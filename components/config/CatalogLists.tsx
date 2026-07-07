'use client';

import { useTransition } from 'react';
import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { toggleCentro, toggleVehiculo, toggleMotivo, toggleMotivoAusencia, asignarCiudadCentro } from '@/app/dashboard/configuracion/actions';
import type { Centro, Vehiculo, Motivo, MotivoAusencia, Ciudad } from '@/lib/types';

function CatalogRow({
  nombre,
  subtitulo,
  activo,
  onToggle,
}: {
  nombre: string;
  subtitulo?: string;
  activo: boolean;
  onToggle: (v: boolean) => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
      <div>
        <div className={activo ? 'text-ink' : 'text-ink-muted line-through'}>{nombre}</div>
        {subtitulo && <div className="text-xs text-ink-muted">{subtitulo}</div>}
      </div>
      <ToggleSwitch activo={activo} onToggle={onToggle} />
    </div>
  );
}

export function CentrosList({ centros, ciudades }: { centros: Centro[]; ciudades: Ciudad[] }) {
  const [pending, startTransition] = useTransition();
  const sinCiudad = centros.filter((c) => !c.ciudad_id).length;

  return (
    <div>
      {sinCiudad > 0 && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {sinCiudad} centro(s) sin ciudad asignada (resaltados abajo). Sin ciudad, un admin
          restringido por zona no los verá — asígnasela si corresponde.
        </p>
      )}
      <div className="max-h-96 overflow-y-auto pr-1">
        {centros.map((c) => (
          <div
            key={c.id}
            className={`flex items-center justify-between gap-2 border-b border-border py-2.5 last:border-0 ${
              !c.ciudad_id ? 'bg-amber-50/60' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className={c.activo ? 'text-ink' : 'text-ink-muted line-through'}>{c.nombre}</div>
              <select
                disabled={pending}
                defaultValue={c.ciudad_id ?? ''}
                onChange={(e) => startTransition(() => asignarCiudadCentro(c.id, e.target.value ? Number(e.target.value) : null))}
                className="mt-1 w-full rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-ink-muted focus:border-primary focus:outline-none"
              >
                <option value="">Sin ciudad</option>
                {ciudades.map((ci) => (
                  <option key={ci.id} value={ci.id}>{ci.nombre}</option>
                ))}
              </select>
            </div>
            <ToggleSwitch activo={c.activo} onToggle={(v) => toggleCentro(c.id, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function VehiculosList({ vehiculos }: { vehiculos: Vehiculo[] }) {
  return (
    <div>
      {vehiculos.map((v) => (
        <CatalogRow key={v.id} nombre={v.nombre} activo={v.activo} onToggle={(val) => toggleVehiculo(v.id, val)} />
      ))}
    </div>
  );
}

export function MotivosList({ motivos }: { motivos: Motivo[] }) {
  return (
    <div>
      {motivos.map((m) => (
        <CatalogRow key={m.id} nombre={m.nombre} activo={m.activo} onToggle={(v) => toggleMotivo(m.id, v)} />
      ))}
    </div>
  );
}

export function MotivosAusenciaList({ motivos }: { motivos: MotivoAusencia[] }) {
  return (
    <div>
      {motivos.map((m) => (
        <CatalogRow key={m.id} nombre={m.nombre} activo={m.activo} onToggle={(v) => toggleMotivoAusencia(m.id, v)} />
      ))}
    </div>
  );
}
