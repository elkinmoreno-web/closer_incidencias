'use client';

import { useState, useTransition } from 'react';
import { Pencil, X, Loader2 } from 'lucide-react';
import { editarReclamacion, type EditarReclamacionState } from '@/app/dashboard/reclamaciones/actions';
import type { ViaPagoReclamacion } from '@/lib/types';

const fmt = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', ','));
const CAMPO = 'w-full rounded-xl border-2 border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none';
const ETIQUETA = 'text-sm font-semibold text-ink-muted';

export interface ReclamacionEditable {
  id: string;
  estado: string;
  motivoId: number;
  /** aaaa-mm */
  periodo: string;
  importe: number | null;
  importeAprobado: number | null;
  viaPago: ViaPagoReclamacion | null;
  comentario: string | null;
  respuesta: string | null;
}

/**
 * Corrige cualquier dato de una reclamación sin cambiar su estado ni quién
 * la resolvió. Importe aprobado y vía de pago solo aparecen si está aprobada.
 */
export function EditarReclamacionButton({
  reclamacion: r,
  motivos,
}: {
  reclamacion: ReclamacionEditable;
  motivos: { id: number; nombre: string }[];
}) {
  const inicial = () => ({
    motivoId: r.motivoId,
    periodo: r.periodo,
    importeTexto: fmt(r.importe),
    importeAprobadoTexto: fmt(r.importeAprobado),
    viaPago: (r.viaPago ?? '') as ViaPagoReclamacion | '',
    comentario: r.comentario ?? '',
    respuesta: r.respuesta ?? '',
  });
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(inicial);
  const [res, setRes] = useState<EditarReclamacionState>(undefined);
  const [pending, startTransition] = useTransition();
  const esAprobada = r.estado === 'aprobada';
  const set = <K extends keyof ReturnType<typeof inicial>>(k: K, v: ReturnType<typeof inicial>[K]) => setDatos((d) => ({ ...d, [k]: v }));

  function abrir() {
    setDatos(inicial());
    setRes(undefined);
    setAbierto(true);
  }

  function guardar() {
    startTransition(async () => {
      const resultado = await editarReclamacion(r.id, datos);
      setRes(resultado);
      if (resultado && 'success' in resultado) setTimeout(() => setAbierto(false), 900);
    });
  }

  // Si el concepto actual está desactivado no viene en el catálogo, pero
  // tiene que seguir saliendo: si no, el desplegable mostraría otro y al
  // guardar se cambiaría sin querer.
  const opciones = motivos.some((m) => m.id === r.motivoId) ? motivos : [{ id: r.motivoId, nombre: '(concepto desactivado)' }, ...motivos];

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Editar reclamación"
        className="rounded-full border border-border bg-surface p-2 text-ink-muted transition hover:bg-bg"
      >
        <Pencil size={14} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card bg-surface p-6 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Editar reclamación</h2>
                <p className="text-sm text-ink-muted">No cambia el estado ni quién la resolvió. Queda registrado en Auditoría.</p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-ink-muted hover:text-ink" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Concepto</span>
                <select value={datos.motivoId} onChange={(e) => set('motivoId', Number(e.target.value))} className={CAMPO}>
                  {opciones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className={ETIQUETA}>Mes de la nómina</span>
                  <input type="month" value={datos.periodo} onChange={(e) => set('periodo', e.target.value)} className={CAMPO} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={ETIQUETA}>Reclamado (€)</span>
                  <input
                    value={datos.importeTexto}
                    onChange={(e) => set('importeTexto', e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className={CAMPO}
                  />
                </label>
              </div>

              {esAprobada && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className={ETIQUETA}>Aprobado (€)</span>
                    <input
                      value={datos.importeAprobadoTexto}
                      onChange={(e) => set('importeAprobadoTexto', e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      className={CAMPO}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={ETIQUETA}>Se paga en</span>
                    <select value={datos.viaPago} onChange={(e) => set('viaPago', e.target.value as ViaPagoReclamacion | '')} className={CAMPO}>
                      <option value="">—</option>
                      <option value="primera_remesa">Primera remesa</option>
                      <option value="siguiente_nomina">Siguiente nómina</option>
                    </select>
                  </label>
                </div>
              )}
              <p className="-mt-1 text-xs text-ink-muted">Los importes se pueden escribir como 19,85 o 1.234,50.</p>

              <label className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Comentario del rider</span>
                <textarea value={datos.comentario} onChange={(e) => set('comentario', e.target.value)} rows={3} className={CAMPO} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Respuesta al rider</span>
                <textarea value={datos.respuesta} onChange={(e) => set('respuesta', e.target.value)} rows={3} className={CAMPO} />
                <span className="text-xs text-ink-muted">El rider la ve en su panel.</span>
              </label>

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
