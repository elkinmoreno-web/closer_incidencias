'use client';

import { useState, useTransition } from 'react';
import { Pencil, X } from 'lucide-react';
import { editarIncidencia } from '@/app/dashboard/actions';
import type { Centro, Motivo } from '@/lib/types';

import { mensajeError } from '@/lib/utils';
interface IncidenciaEditable {
  id: string;
  motivo_id: number | null;
  codigo_pedido: string | null;
  observaciones: string | null;
  direccion_recogida: string | null;
  direccion_entrega: string | null;
  centro_id: number | null;
}

export function EditIncidenciaModal({
  incidencia,
  centros,
  motivos,
}: {
  incidencia: IncidenciaEditable;
  centros: Centro[];
  motivos: Motivo[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [motivoId, setMotivoId] = useState(incidencia.motivo_id ?? '');
  const [codigoPedido, setCodigoPedido] = useState(incidencia.codigo_pedido ?? '');
  const [observaciones, setObservaciones] = useState(incidencia.observaciones ?? '');
  const [direccionRecogida, setDireccionRecogida] = useState(incidencia.direccion_recogida ?? '');
  const [direccionEntrega, setDireccionEntrega] = useState(incidencia.direccion_entrega ?? '');
  const [centroId, setCentroId] = useState(incidencia.centro_id ?? '');

  const motivoRequiereDirecciones = motivos.find((m) => String(m.id) === String(motivoId))?.requiere_direcciones ?? false;

  function handleSave() {
    if (!motivoId) {
      setError('Selecciona un motivo');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await editarIncidencia(incidencia.id, {
          motivoId: Number(motivoId),
          codigoPedido: codigoPedido.trim() || null,
          observaciones: observaciones.trim() || null,
          direccionRecogida: direccionRecogida.trim() || null,
          direccionEntrega: direccionEntrega.trim() || null,
          centroId: centroId ? Number(centroId) : null,
        });
        setOpen(false);
      } catch (e) {
        setError(mensajeError(e));
      }
    });
  }

  return (
    <>
      <button
        title="Editar campos"
        onClick={() => setOpen(true)}
        className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
      >
        <Pencil size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Editar incidencia</h2>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Motivo</label>
                <select
                  value={motivoId}
                  onChange={(e) => setMotivoId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Selecciona...</option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Centro</label>
                <select
                  value={centroId}
                  onChange={(e) => setCentroId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Sin centro</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Código del pedido</label>
                <input
                  value={codigoPedido}
                  onChange={(e) => setCodigoPedido(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">Dirección recogida</label>
                  <input
                    value={direccionRecogida}
                    onChange={(e) => setDireccionRecogida(e.target.value)}
                    disabled={!motivoRequiereDirecciones}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-bg disabled:text-ink-muted"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">Dirección entrega</label>
                  <input
                    value={direccionEntrega}
                    onChange={(e) => setDireccionEntrega(e.target.value)}
                    disabled={!motivoRequiereDirecciones}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-bg disabled:text-ink-muted"
                  />
                </div>
              </div>
              {!motivoRequiereDirecciones && (
                <p className="-mt-2 text-xs text-ink-muted">
                  Solo se usan para el motivo &quot;Fuera de área&quot; (o los que tengan esa opción activada
                  en Configuración). Con el motivo actual quedan deshabilitadas.
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              {error && <p className="text-sm font-medium text-danger">{error}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted"
                >
                  Cancelar
                </button>
                <button
                  disabled={pending}
                  onClick={handleSave}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
