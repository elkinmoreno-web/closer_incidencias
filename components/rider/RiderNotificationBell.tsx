'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY_PREFIX = 'notificacionesRider_';
const ULTIMO_VISTO_PREFIX = 'ultimoVistoRider_';
const MAX_NOTIS = 15;
// En la primera vez que alguien abre esto (sin nada guardado todavía),
// cuánto hacia atrás revisamos para no inundar con historial muy viejo.
const DIAS_HACIA_ATRAS_PRIMERA_VEZ = 3;

interface Notificacion {
  id: string;
  texto: string;
  fecha: string;
  leida: boolean;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Navegadores que bloquean audio sin interacción previa: no pasa nada.
  }
}

function formatHora(iso: string) {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/**
 * Avisa al rider cuando le aprueban o rechazan una incidencia o
 * ausencia. Tiene DOS mecanismos, no solo uno:
 *
 * 1. En vivo (Realtime): si la pestaña está abierta justo cuando se
 *    aprueba/rechaza, se entera al instante.
 * 2. Al abrir la app (respaldo): revisa qué cambió desde la última vez
 *    que el rider miró — esto es lo que faltaba antes. Sin esto, si el
 *    rider tenía la app cerrada en el momento exacto de la aprobación
 *    (el caso más común: manda la incidencia y cierra), nunca se
 *    enteraba de nada al volver a entrar.
 *
 * Además, cualquier cambio detectado (por cualquiera de las dos vías)
 * refresca la página entera (router.refresh()), para que las listas de
 * incidencias/ausencias en pantalla también muestren el estado nuevo
 * sin que el rider tenga que recargar a mano.
 */
export function RiderNotificationBell({ riderId }: { riderId: string }) {
  const router = useRouter();
  const [notis, setNotis] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [popupInstrucciones, setPopupInstrucciones] = useState<{ motivo: string; texto: string } | null>(null);
  const [popupRechazo, setPopupRechazo] = useState<{ motivo: string; razon: string } | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const storageKey = `${STORAGE_KEY_PREFIX}${riderId}`;
  const ultimoVistoKey = `${ULTIMO_VISTO_PREFIX}${riderId}`;

  useEffect(() => {
    const guardadas = localStorage.getItem(storageKey);
    if (guardadas) {
      try {
        setNotis(JSON.parse(guardadas));
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelado = false;

    function agregar(texto: string) {
      setNotis((prev) => {
        const nueva: Notificacion = { id: crypto.randomUUID(), texto, fecha: new Date().toISOString(), leida: false };
        const actualizadas = [nueva, ...prev].slice(0, MAX_NOTIS);
        localStorage.setItem(storageKey, JSON.stringify(actualizadas));
        return actualizadas;
      });
      playBeep();
    }

    async function mostrarPopupSiHayInstrucciones(motivoId: number | null | undefined) {
      if (!motivoId) return;
      const { data } = await supabase.from('motivos').select('nombre, instrucciones_aprobacion').eq('id', motivoId).maybeSingle();
      if (data?.instrucciones_aprobacion) {
        setPopupInstrucciones({ motivo: data.nombre, texto: data.instrucciones_aprobacion });
      }
    }

    async function mostrarPopupRechazo(motivoId: number | null | undefined, motivoRechazo: string | null | undefined) {
      const { data } = motivoId ? await supabase.from('motivos').select('nombre').eq('id', motivoId).maybeSingle() : { data: null };
      setPopupRechazo({ motivo: data?.nombre ?? 'Tu incidencia', razon: motivoRechazo?.trim() || 'No se indicó un motivo específico.' });
    }

    /** Revisa qué cambió desde la última vez que el rider abrió la app — el respaldo para cuando no estaba mirando en el momento exacto. */
    async function revisarCambiosPerdidos() {
      const ultimoVisto = localStorage.getItem(ultimoVistoKey) ?? new Date(Date.now() - DIAS_HACIA_ATRAS_PRIMERA_VEZ * 86400000).toISOString();
      const ahora = new Date().toISOString();

      const [incRes, ausRes] = await Promise.all([
        supabase
          .from('incidencias')
          .select('id, estado, motivo_id, motivo_rechazo, updated_at')
          .eq('rider_id', riderId)
          .in('estado', ['aprobada', 'rechazada'])
          .gt('updated_at', ultimoVisto)
          .order('updated_at', { ascending: true }),
        supabase
          .from('ausencias')
          .select('id, estado, updated_at')
          .eq('rider_id', riderId)
          .in('estado', ['aprobada', 'rechazada'])
          .gt('updated_at', ultimoVisto)
          .order('updated_at', { ascending: true }),
      ]);

      if (cancelado) return;

      const incidenciasNuevas = incRes.data ?? [];
      const ausenciasNuevas = ausRes.data ?? [];
      let huboAlgo = false;

      for (const inc of incidenciasNuevas) {
        huboAlgo = true;
        agregar(inc.estado === 'aprobada' ? 'Tu incidencia fue aprobada' : 'Tu incidencia fue rechazada');
      }
      for (const aus of ausenciasNuevas) {
        huboAlgo = true;
        agregar(aus.estado === 'aprobada' ? 'Tu ausencia fue aprobada' : 'Tu ausencia fue rechazada');
      }

      // Si hubo varias incidencias que cambiaron mientras no estaba, solo
      // mostramos UN popup — el de la más reciente de todas (por
      // updated_at), sea aprobación o rechazo. Como ya viene ordenado
      // ascendente, la última del array es la más reciente.
      const masReciente = incidenciasNuevas[incidenciasNuevas.length - 1];
      if (masReciente?.estado === 'aprobada') await mostrarPopupSiHayInstrucciones(masReciente.motivo_id);
      else if (masReciente?.estado === 'rechazada') await mostrarPopupRechazo(masReciente.motivo_id, masReciente.motivo_rechazo);

      localStorage.setItem(ultimoVistoKey, ahora);
      if (huboAlgo) router.refresh();
    }

    revisarCambiosPerdidos();

    const channel = supabase
      .channel(`avisos-rider-${riderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'incidencias', filter: `rider_id=eq.${riderId}` },
        (payload) => {
          const nuevo = payload.new as { estado?: string; motivo_id?: number; motivo_rechazo?: string | null };
          const anterior = payload.old as { estado?: string };
          if (nuevo.estado === anterior.estado) return; // solo avisar si cambió el estado
          if (nuevo.estado === 'aprobada') {
            agregar('Tu incidencia fue aprobada');
            mostrarPopupSiHayInstrucciones(nuevo.motivo_id);
          }
          if (nuevo.estado === 'rechazada') {
            agregar('Tu incidencia fue rechazada');
            mostrarPopupRechazo(nuevo.motivo_id, nuevo.motivo_rechazo);
          }
          localStorage.setItem(ultimoVistoKey, new Date().toISOString());
          router.refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ausencias', filter: `rider_id=eq.${riderId}` },
        (payload) => {
          const nuevo = payload.new as { estado?: string };
          const anterior = payload.old as { estado?: string };
          if (nuevo.estado === anterior.estado) return;
          if (nuevo.estado === 'aprobada') agregar('Tu ausencia fue aprobada');
          if (nuevo.estado === 'rechazada') agregar('Tu ausencia fue rechazada');
          localStorage.setItem(ultimoVistoKey, new Date().toISOString());
          router.refresh();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // No podemos hacer mucho más desde aquí, pero al menos queda
          // registrado — el respaldo de "revisarCambiosPerdidos" seguirá
          // funcionando la próxima vez que se abra la app de todas formas.
          console.error('Canal de notificaciones del rider no se pudo conectar:', status);
        }
      });

    return () => {
      cancelado = true;
      supabase.removeChannel(channel);
    };
  }, [riderId, storageKey, ultimoVistoKey, router]);

  function alAbrir() {
    setAbierto((v) => {
      const nuevoAbierto = !v;
      if (nuevoAbierto) {
        setNotis((prev) => {
          const actualizadas = prev.map((n) => ({ ...n, leida: true }));
          localStorage.setItem(storageKey, JSON.stringify(actualizadas));
          return actualizadas;
        });
      }
      return nuevoAbierto;
    });
  }

  const noLeidas = notis.filter((n) => !n.leida).length;

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={alAbrir}
        className="relative rounded-full border border-border p-2.5 text-ink-muted transition hover:bg-bg"
        title="Notificaciones"
      >
        <Bell size={16} />
        {noLeidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-12 z-[60] w-72 max-w-[90vw] rounded-card border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">Notificaciones</div>
          <div className="max-h-72 overflow-y-auto">
            {notis.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">Sin novedades por ahora.</p>
            ) : (
              notis.map((n) => (
                <div key={n.id} className="border-b border-border px-4 py-2.5 text-xs last:border-0">
                  <div className="text-ink">{n.texto}</div>
                  <div className="mt-0.5 text-ink-muted">{formatHora(n.fecha)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {popupInstrucciones && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-lg">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">✓ Incidencia aprobada</p>
            <h3 className="mb-3 text-base font-semibold text-ink">{popupInstrucciones.motivo}</h3>
            <p className="mb-5 whitespace-pre-wrap text-sm text-ink-muted">{popupInstrucciones.texto}</p>
            <button
              onClick={() => setPopupInstrucciones(null)}
              className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {popupRechazo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-lg">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-danger">
                <AlertCircle size={16} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-danger">Incidencia rechazada</p>
            </div>
            <h3 className="mb-3 text-base font-semibold text-ink">{popupRechazo.motivo}</h3>
            <div className="mb-5 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-ink">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-danger">Motivo del rechazo</p>
              <p className="whitespace-pre-wrap text-ink-muted">{popupRechazo.razon}</p>
            </div>
            <button
              onClick={() => setPopupRechazo(null)}
              className="w-full rounded-full border border-border py-2.5 text-sm font-semibold text-ink hover:bg-bg"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
