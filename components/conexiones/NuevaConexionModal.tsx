'use client';

import { useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, X, Search } from 'lucide-react';
import { crearConexionFueraZona, type FormActionState } from '@/app/dashboard/conexiones/actions';

interface RiderOpcion {
  id: string;
  nombre: string;
  dni: string;
  centro: string | null;
}

const MAX_SUGERENCIAS = 15;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? 'Guardando...' : 'Registrar conexión'}
    </button>
  );
}

/**
 * Buscador propio en vez de <datalist> nativo: con más de mil riders,
 * el datalist del navegador se vuelve inconsistente entre navegadores
 * (algunos limitan cuántas sugerencias muestran) — por eso podían
 * "faltar" riders que sí existían. Aquí el filtrado es nuestro: se
 * hace en el propio navegador (la lista ya viene acotada a la zona del
 * admin desde el servidor), mostrando como máximo 15 coincidencias a
 * la vez para que la lista nunca se vuelva pesada de renderizar.
 */
function BuscadorRider({ riders, onSeleccionar }: { riders: RiderOpcion[]; onSeleccionar: (r: RiderOpcion) => void }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState<RiderOpcion | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const coincidencias = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (q.length < 2) return [];
    return riders.filter((r) => r.nombre.toLowerCase().includes(q) || r.dni.toLowerCase().includes(q)).slice(0, MAX_SUGERENCIAS);
  }, [texto, riders]);

  function elegir(r: RiderOpcion) {
    setSeleccionado(r);
    setTexto(`${r.nombre} — ${r.dni}`);
    setAbierto(false);
    onSeleccionar(r);
  }

  function alCambiarTexto(v: string) {
    setTexto(v);
    setAbierto(true);
    if (seleccionado) {
      setSeleccionado(null);
      onSeleccionar(null as unknown as RiderOpcion);
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={texto}
          onChange={(e) => alCambiarTexto(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder="Escribe al menos 2 letras del nombre o DNI..."
          className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {abierto && texto.trim().length >= 2 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
            {coincidencias.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-ink-muted">Sin coincidencias en tu zona.</p>
            ) : (
              coincidencias.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => elegir(r)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-bg"
                >
                  <div className="text-ink">{r.nombre}</div>
                  <div className="text-xs text-ink-muted">
                    {r.dni} {r.centro ? `· ${r.centro}` : ''}
                  </div>
                </button>
              ))
            )}
            {coincidencias.length === MAX_SUGERENCIAS && (
              <p className="border-t border-border px-3 py-1.5 text-[11px] text-ink-muted">Sigue escribiendo para acotar más.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function NuevaConexionModal({ riders }: { riders: RiderOpcion[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<FormActionState, FormData>(crearConexionFueraZona, undefined);
  const [riderEncontrado, setRiderEncontrado] = useState<RiderOpcion | null>(null);

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
              <input type="hidden" name="riderId" value={riderEncontrado?.id ?? ''} />
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Rider (nombre o DNI)</label>
                <BuscadorRider riders={riders} onSeleccionar={setRiderEncontrado} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Zona / Centro del rider</label>
                <input
                  disabled
                  value={riderEncontrado?.centro ?? ''}
                  placeholder="Se rellena solo al elegir el rider"
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
                <SubmitButton disabled={!riderEncontrado} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
