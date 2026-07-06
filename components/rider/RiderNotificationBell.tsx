'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY_PREFIX = 'notificacionesRider_';
const MAX_NOTIS = 15;

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

/** Avisa al rider cuando le aprueban o rechazan una incidencia o ausencia. */
export function RiderNotificationBell({ riderId }: { riderId: string }) {
  const [notis, setNotis] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const storageKey = `${STORAGE_KEY_PREFIX}${riderId}`;

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

    function agregar(texto: string) {
      setNotis((prev) => {
        const nueva: Notificacion = { id: crypto.randomUUID(), texto, fecha: new Date().toISOString(), leida: false };
        const actualizadas = [nueva, ...prev].slice(0, MAX_NOTIS);
        localStorage.setItem(storageKey, JSON.stringify(actualizadas));
        return actualizadas;
      });
      playBeep();
    }

    const channel = supabase
      .channel(`avisos-rider-${riderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'incidencias', filter: `rider_id=eq.${riderId}` },
        (payload) => {
          const nuevo = payload.new as { estado?: string };
          const anterior = payload.old as { estado?: string };
          if (nuevo.estado === anterior.estado) return; // solo avisar si cambió el estado
          if (nuevo.estado === 'aprobada') agregar('Tu incidencia fue aprobada');
          if (nuevo.estado === 'rechazada') agregar('Tu incidencia fue rechazada');
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [riderId, storageKey]);

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
    </div>
  );
}
