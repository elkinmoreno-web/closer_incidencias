'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

/**
 * Enlace pequeño junto al estado "Aprobada" de una incidencia, para
 * volver a ver las instrucciones/protocolo de ese motivo cuando el
 * rider quiera (no solo la primera vez que apareció el popup).
 */
export function VerProtocoloLink({ motivo, instrucciones }: { motivo: string; instrucciones: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
      >
        <FileText size={11} />
        Ver protocolo
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">✓ Incidencia aprobada</p>
            <h3 className="mb-3 text-base font-semibold text-ink">{motivo}</h3>
            <p className="mb-5 whitespace-pre-wrap text-sm text-ink-muted">{instrucciones}</p>
            <button
              onClick={() => setAbierto(false)}
              className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
