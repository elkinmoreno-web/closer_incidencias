'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';

/**
 * Icono de ojo que muestra el texto completo en un popup centrado en
 * pantalla — para texto que se corta con "..." (observaciones, motivos
 * de rechazo, instrucciones, nombres largos...) sin tener que entrar a
 * modo edición ni arriesgarse a que un popover pegado al icono se
 * desborde de su fila.
 */
export function VerTextoCompleto({ titulo, texto }: { titulo: string; texto: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        className="shrink-0 rounded-full bg-primary/10 p-1 text-primary hover:bg-primary/20"
        title="Ver texto completo"
      >
        <Eye size={13} />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-sm rounded-card bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-semibold text-ink">{titulo}</h3>
            <p className="whitespace-pre-wrap text-sm text-ink-muted">{texto}</p>
            <button
              onClick={() => setAbierto(false)}
              className="mt-4 w-full rounded-full bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
