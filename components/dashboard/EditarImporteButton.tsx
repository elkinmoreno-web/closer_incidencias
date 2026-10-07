'use client';

import { useState, useTransition } from 'react';
import { Pencil, X, Loader2 } from 'lucide-react';
import { editarImporteReclamacion, type EditarImporteState } from '@/app/dashboard/reclamaciones/actions';

const fmt = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', ','));
const CAMPO = 'w-full rounded-xl border-2 border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none';

/**
 * Corrige los importes de una reclamación sin cambiar su estado ni quién la
 * resolvió. El aprobado solo aparece si la reclamación está aprobada.
 */
export function EditarImporteButton({
  id,
  estado,
  importe,
  importeAprobado,
}: {
  id: string;
  estado: string;
  importe: number | null;
  importeAprobado: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [reclamado, setReclamado] = useState(fmt(importe));
  const [aprobado, setAprobado] = useState(fmt(importeAprobado));
  const [res, setRes] = useState<EditarImporteState>(undefined);
  const [pending, startTransition] = useTransition();
  const esAprobada = estado === 'aprobada';

  function abrir() {
    setReclamado(fmt(importe));
    setAprobado(fmt(importeAprobado));
    setRes(undefined);
    setAbierto(true);
  }

  function guardar() {
    startTransition(async () => {
      const r = await editarImporteReclamacion(id, reclamado, esAprobada ? aprobado : null);
      setRes(r);
      if (r && 'success' in r) setTimeout(() => setAbierto(false), 900);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Editar importe"
        className="rounded-full border border-border bg-surface p-2 text-ink-muted transition hover:bg-bg"
      >
        <Pencil size={14} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-sm rounded-card bg-surface p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Editar importe</h2>
                <p className="text-sm text-ink-muted">No cambia el estado ni quién la resolvió. Queda registrado en Auditoría.</p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-ink-muted hover:text-ink" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-ink-muted">Importe reclamado (€)</span>
                <input value={reclamado} onChange={(e) => setReclamado(e.target.value)} inputMode="decimal" placeholder="0,00" className={CAMPO} />
              </label>
              {esAprobada && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-ink-muted">Importe aprobado (€)</span>
                  <input value={aprobado} onChange={(e) => setAprobado(e.target.value)} inputMode="decimal" placeholder="0,00" className={CAMPO} />
                </label>
              )}
              <p className="text-xs text-ink-muted">Puedes escribirlo como 19,85 o 1.234,50.</p>

              {res && 'error' in res && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{res.error}</p>}
              {res && 'success' in res && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Guardado.</p>}

              <div className="flex justify-end gap-2">
                <button onClick={() => setAbierto(false)} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
