'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, X, Search, Loader2 } from 'lucide-react';
import { crearConexionFueraZona, buscarRidersConexion, type FormActionState, type RiderBusqueda } from '@/app/dashboard/conexiones/actions';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? 'Guardando...' : 'Registrar conexión'}
    </button>
  );
}

/**
 * Busca en el SERVIDOR (con RLS, respeta la zona del admin), con un
 * pequeño debounce mientras se escribe — con ~4600 riders, traerlos
 * todos al navegador de una vez no es viable (además de que Supabase
 * corta en 1000 filas por defecto si no se pide un límite explícito,
 * que era justo lo que hacía "desaparecer" riders antes).
 */
function BuscadorRider({ onSeleccionar }: { onSeleccionar: (r: RiderBusqueda | null) => void }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<RiderBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function alCambiarTexto(v: string) {
    setTexto(v);
    setAbierto(true);
    onSeleccionar(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = v.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      const r = await buscarRidersConexion(q);
      setResultados(r);
      setBuscando(false);
    }, 300);
  }

  function elegir(r: RiderBusqueda) {
    setTexto(`${r.nombre} — ${r.dni}`);
    setAbierto(false);
    onSeleccionar(r);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        {buscando ? (
          <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-ink-muted" />
        ) : (
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        )}
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
            {buscando ? (
              <p className="px-3 py-2.5 text-xs text-ink-muted">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-ink-muted">Sin coincidencias en tu zona.</p>
            ) : (
              resultados.map((r) => (
                <button key={r.id} type="button" onClick={() => elegir(r)} className="block w-full px-3 py-2 text-left text-sm hover:bg-bg">
                  <div className="text-ink">{r.nombre}</div>
                  <div className="text-xs text-ink-muted">
                    {r.dni} {r.centro ? `· ${r.centro}` : ''}
                  </div>
                </button>
              ))
            )}
            {resultados.length === 15 && (
              <p className="border-t border-border px-3 py-1.5 text-[11px] text-ink-muted">Sigue escribiendo para acotar más.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function NuevaConexionModal() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<FormActionState, FormData>(crearConexionFueraZona, undefined);
  const [riderEncontrado, setRiderEncontrado] = useState<RiderBusqueda | null>(null);

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
                <BuscadorRider onSeleccionar={setRiderEncontrado} />
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
