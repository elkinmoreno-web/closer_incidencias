'use client';

import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { toggleCentro, toggleVehiculo, toggleMotivo, toggleMotivoAusencia } from '@/app/dashboard/configuracion/actions';
import type { Centro, Vehiculo, Motivo, MotivoAusencia } from '@/lib/types';

function CatalogRow({ nombre, activo, onToggle }: { nombre: string; activo: boolean; onToggle: (v: boolean) => Promise<void> }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
      <span className={activo ? 'text-ink' : 'text-ink-muted line-through'}>{nombre}</span>
      <ToggleSwitch activo={activo} onToggle={onToggle} />
    </div>
  );
}

export function CentrosList({ centros }: { centros: Centro[] }) {
  return (
    <div>
      {centros.map((c) => (
        <CatalogRow key={c.id} nombre={c.nombre} activo={c.activo} onToggle={(v) => toggleCentro(c.id, v)} />
      ))}
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
