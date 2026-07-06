'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { crearConexionFueraZona, type FormActionState } from '@/app/dashboard/conexiones/actions';

interface RiderOpcion {
  nombre: string;
  dni: string;
  centro: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? 'Guardando...' : 'Registrar conexión'}
    </button>
  );
}

export function NuevaConexionModal({ riders }: { riders: RiderOpcion[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<FormActionState, FormData>(crearConexionFueraZona, undefined);
  const [dniBuscado, setDniBuscado] = useState('');

  const riderEncontrado = useMemo(
    () => riders.find((r) => r.dni.toLowerCase() === dniBuscado.trim().toLowerCase()),
    [dniBuscado, riders]
  );

  if (state?.success && open) {
    setTimeout(() => setOpen(false), 800);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark">
        <Plus size={16} />
        Nueva conexión
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Nueva conexión fuera de zona</h2>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <form action={formAction} className="flex flex-col gap-3" encType="multipart/form-data">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Rider (nombre o DNI)</label>
                <input
                  name="riderDni"
                  list="ridersDatalistConexion"
                  required
                  value={dniBuscado}
                  onChange={(e) => setDniBuscado(e.target.value)}
                  placeholder="Escribe para buscar..."
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <datalist id="ridersDatalistConexion">
                  {riders.map((r) => (
                    <option key={r.dni} value={r.dni}>{`${r.nombre} — ${r.dni}`}</option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Zona / Centro del rider</label>
                <input
                  disabled
                  value={riderEncontrado?.centro ?? (dniBuscado ? 'Rider no encontrado' : '')}
                  placeholder="Se rellena solo al seleccionar el rider"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink-muted"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Fecha</label>
                <input type="date" name="fecha" required className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Captura de pantalla</label>
                <input type="file" name="screenshot" accept="image/jpeg,image/png,image/webp" required className="text-sm" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Observaciones</label>
                <textarea name="observaciones" rows={3} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>

              {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
              {state?.success && <p className="text-sm font-medium text-emerald-700">Conexión registrada.</p>}

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
