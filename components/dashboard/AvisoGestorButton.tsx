'use client';

import { useState, useTransition } from 'react';
import { Send, X, Loader2 } from 'lucide-react';
import { avisarGestorReclamacion, type AvisoGestorState } from '@/app/dashboard/reclamaciones/actions';

/**
 * Botón en cada reclamación para escribir al gestor que la aprobó o
 * rechazó. Si nadie la ha gestionado todavía, sale desactivado.
 */
export function AvisoGestorButton({ id, gestor }: { id: string; gestor: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [estado, setEstado] = useState<AvisoGestorState>(undefined);
  const [pending, startTransition] = useTransition();

  if (!gestor) {
    return (
      <button
        type="button"
        disabled
        title="Nadie ha aprobado ni rechazado todavía esta reclamación: no hay a quién avisar"
        className="rounded-full border border-border p-2 text-ink-muted opacity-40"
      >
        <Send size={14} />
      </button>
    );
  }

  function enviar() {
    startTransition(async () => {
      setEstado(await avisarGestorReclamacion(id, mensaje));
    });
  }

  function cerrar() {
    setAbierto(false);
    setMensaje('');
    setEstado(undefined);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`Avisar a ${gestor}`}
        className="rounded-full border border-amber-300 bg-amber-50 p-2 text-amber-700 transition hover:bg-amber-100"
      >
        <Send size={14} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrar}>
          <div className="w-full max-w-lg rounded-card bg-surface p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Avisar al gestor</h2>
                <p className="text-sm text-ink-muted">
                  Le llegará por correo a <span className="font-semibold text-ink">{gestor}</span>, que es quien resolvió esta
                  reclamación. Si responde, la respuesta te llega a ti.
                </p>
              </div>
              <button onClick={cerrar} className="text-ink-muted hover:text-ink" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>

            {estado && 'success' in estado ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  Aviso enviado a {estado.para}.
                </div>
                {!estado.correoEnviado && (
                  <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    El aviso se ha guardado, pero el correo no ha salido. Inténtalo de nuevo más tarde.
                  </div>
                )}
                <button onClick={cerrar} className="self-end rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Escribe aquí el mensaje para el gestor."
                  className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
                {estado && 'error' in estado && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{estado.error}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={cerrar} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                    Cancelar
                  </button>
                  <button
                    onClick={enviar}
                    disabled={pending || mensaje.trim().length < 3}
                    className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Enviar aviso
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
