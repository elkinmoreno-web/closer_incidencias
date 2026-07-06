'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'notificacionesPanel';
const SONIDO_KEY = 'sonidoNotificacionesIncidencias';
const MAX_NOTIS = 20;

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
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Si el navegador bloquea audio sin interacción previa, no pasa nada.
  }
}

function formatHora(iso: string) {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/**
 * Aviso de incidencias/ausencias nuevas: sonido + toast en el momento,
 * y además una lista persistente (con contador) para revisar qué entró
 * aunque no estuvieras mirando la pantalla cuando llegó.
 */
export function NotificationCenter() {
  const [sonido, setSonido] = useState(true);
  const [notis, setNotis] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;

  useEffect(() => {
    const savedSonido = localStorage.getItem(SONIDO_KEY);
    if (savedSonido !== null) setSonido(savedSonido === 'true');
    const savedNotis = localStorage.getItem(STORAGE_KEY);
    if (savedNotis) {
      try {
        setNotis(JSON.parse(savedNotis));
      } catch {
        // ignorar si el JSON quedó corrupto
      }
    }
  }, []);

  function agregarNotificacion(texto: string) {
    setNotis((prev) => {
      const nueva: Notificacion = { id: crypto.randomUUID(), texto, fecha: new Date().toISOString(), leida: false };
      const actualizadas = [nueva, ...prev].slice(0, MAX_NOTIS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actualizadas));
      return actualizadas;
    });
    setToast(texto);
    setTimeout(() => setToast((t) => (t === texto ? null : t)), 6000);
    if (sonidoRef.current) playBeep();
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('avisos-panel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidencias' }, (payload) => {
        const nombre = (payload.new as { nombre_rider?: string })?.nombre_rider ?? 'Un rider';
        agregarNotificacion(`Nueva incidencia de ${nombre}`);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ausencias' }, (payload) => {
        const nombre = (payload.new as { nombre_rider?: string })?.nombre_rider ?? 'Un rider';
        agregarNotificacion(`Nueva ausencia comunicada por ${nombre}`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSonido() {
    setSonido((v) => {
      localStorage.setItem(SONIDO_KEY, String(!v));
      return !v;
    });
  }

  function marcarTodasLeidas() {
    setNotis((prev) => {
      const actualizadas = prev.map((n) => ({ ...n, leida: true }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actualizadas));
      return actualizadas;
    });
  }

  const noLeidas = notis.filter((n) => !n.leida).length;

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={toggleSonido}
        title={sonido ? 'Silenciar avisos' : 'Activar avisos'}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-ink-muted transition hover:bg-bg"
      >
        {sonido ? <Volume2 size={14} /> : <VolumeX size={14} />}
        {sonido ? 'Sonido ON' : 'Sonido OFF'}
      </button>

      <button
        onClick={() => {
          setAbierto((v) => !v);
          if (!abierto) marcarTodasLeidas();
        }}
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
        <div className="absolute right-0 top-12 z-40 w-80 rounded-card border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">Notificaciones</div>
          <div className="max-h-80 overflow-y-auto">
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

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          <Bell size={16} className="text-primary" />
          {toast}
        </div>
      )}
    </div>
  );
}
