'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { crearIncidenciaAdmin, type FormActionState } from '@/app/dashboard/incidencias/actions';
import type { Motivo } from '@/lib/types';

interface RiderOpcion {
  nombre: string;
  dni: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? 'Guardando...' : 'Crear incidencia'}
    </button>
  );
}

export function NuevaIncidenciaModal({ riders, motivos }: { riders: RiderOpcion[]; motivos: Motivo[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<FormActionState, FormData>(crearIncidenciaAdmin, undefined);
  const [motivoId, setMotivoId] = useState('');

  const motivoSeleccionado = useMemo(() => motivos.find((m) => String(m.id) === motivoId), [motivoId, motivos]);

  if (state?.success && open) {
    // Cierra el modal automáticamente al terminar con éxito.
    setTimeout(() => setOpen(false), 800);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
      >
        <Plus size={16} />
        Nueva incidencia
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Nueva incidencia</h2>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <form action={formAction} className="flex flex-col gap-3" encType="multipart/form-data">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Rider (busca por nombre o DNI)</label>
                <input
                  name="riderDni"
                  list="ridersDatalist"
                  required
                  placeholder="Escribe para buscar..."
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <datalist id="ridersDatalist">
                  {riders.map((r) => (
                    <option key={r.dni} value={r.dni}>{`${r.nombre} — ${r.dni}`}</option>
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-ink-muted">Escribe el DNI exacto del rider (lo autocompleta la lista).</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Motivo</label>
                <select
                  name="motivoId"
                  required
                  value={motivoId}
                  onChange={(e) => setMotivoId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="" disabled>Selecciona...</option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Código del pedido</label>
                <input name="codigoPedido" className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>

              {motivoSeleccionado?.requiere_direcciones && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink-muted">Dirección recogida</label>
                    <input name="direccionRecogida" required className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink-muted">Dirección entrega</label>
                    <input name="direccionEntrega" required className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">
                  Observaciones {motivoSeleccionado?.requiere_observaciones && '*'}
                </label>
                <textarea
                  name="observaciones"
                  rows={3}
                  required={motivoSeleccionado?.requiere_observaciones}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Captura (opcional)</label>
                <input type="file" name="screenshot" accept="image/jpeg,image/png,image/webp" className="text-sm" />
              </div>

              {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
              {state?.success && <p className="text-sm font-medium text-emerald-700">Incidencia creada.</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                  Cancelar
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
