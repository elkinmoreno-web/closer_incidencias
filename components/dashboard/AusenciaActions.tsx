'use client';

import { useState, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { aprobarAusencia, rechazarAusencia } from '@/app/dashboard/ausencias/actions';
import type { EstadoAusencia } from '@/lib/types';

export function AusenciaActions({ id, estado }: { id: string; estado: EstadoAusencia }) {
  const [pending, startTransition] = useTransition();
  const [rechazando, setRechazando] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  if (rechazando) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          autoFocus
          value={motivoRechazo}
          onChange={(e) => setMotivoRechazo(e.target.value)}
          placeholder="Motivo del rechazo (lo verá el rider)"
          rows={2}
          className="w-56 rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            disabled={pending || !motivoRechazo.trim()}
            onClick={() =>
              startTransition(async () => {
                await rechazarAusencia(id, motivoRechazo.trim());
                setRechazando(false);
                setMotivoRechazo('');
              })
            }
            className="rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            Confirmar rechazo
          </button>
          <button
            onClick={() => setRechazando(false)}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink-muted"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        title={estado === 'aprobada' ? 'Ya aprobada' : 'Aprobar'}
        disabled={pending || estado === 'aprobada'}
        onClick={() => startTransition(() => aprobarAusencia(id))}
        className="rounded-full bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
      >
        <Check size={16} />
      </button>
      <button
        title={estado === 'rechazada' ? 'Ya rechazada' : 'Rechazar'}
        disabled={pending || estado === 'rechazada'}
        onClick={() => setRechazando(true)}
        className="rounded-full bg-red-50 p-2 text-danger transition hover:bg-red-100 disabled:opacity-40"
      >
        <X size={16} />
      </button>
    </div>
  );
}
