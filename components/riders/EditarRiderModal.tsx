'use client';

import { useState, useTransition } from 'react';
import { Pencil, X } from 'lucide-react';
import { editarRider } from '@/app/dashboard/riders/actions';

interface CentroOpcion {
  id: number;
  nombre: string;
}
interface VehiculoOpcion {
  id: number;
  nombre: string;
}

/**
 * Edición de un rider ya existente — solo super_admin. Pensado para
 * corregir datos que se equivocaron al crear el rider (centro mal
 * asignado, DNI/email con un typo, etc.), sin tener que borrarlo y
 * volver a crearlo.
 */
export function EditarRiderModal({
  rider,
  centros,
  vehiculos,
}: {
  rider: { id: string; nombre: string; dni: string; email: string; centro_id: number | null; vehiculo_id: number | null };
  centros: CentroOpcion[];
  vehiculos: VehiculoOpcion[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState(rider.nombre);
  const [dni, setDni] = useState(rider.dni);
  const [email, setEmail] = useState(rider.email);
  const [centroId, setCentroId] = useState(rider.centro_id?.toString() ?? '');
  const [vehiculoId, setVehiculoId] = useState(rider.vehiculo_id?.toString() ?? '');

  function guardar() {
    setError(null);
    startTransition(async () => {
      const res = await editarRider(rider.id, {
        nombre,
        dni,
        email,
        centroId: centroId ? Number(centroId) : null,
        vehiculoId: vehiculoId ? Number(vehiculoId) : null,
      });
      if (!res.ok) {
        setError(res.motivo ?? 'No se pudo guardar');
        return;
      }
      setAbierto(false);
    });
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        title="Editar rider"
        className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
      >
        <Pencil size={14} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Editar rider</h2>
              <button onClick={() => setAbierto(false)} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Nombre completo</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">DNI</label>
                <input
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-muted">Si lo cambias, también cambia con qué email inicia sesión.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Centro</label>
                <select
                  value={centroId}
                  onChange={(e) => setCentroId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Sin centro</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Vehículo</label>
                <select
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Sin vehículo</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-danger">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={guardar}
                disabled={pending}
                className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                onClick={() => setAbierto(false)}
                disabled={pending}
                className="rounded-full border border-border px-4 py-2.5 text-sm text-ink-muted hover:bg-bg"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
