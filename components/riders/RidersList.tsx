'use client';

import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { toggleRiderActivo } from '@/app/dashboard/riders/actions';

interface RiderRow {
  id: string;
  nombre: string;
  dni: string;
  email: string;
  activo: boolean;
  provincia: string | null;
  centros: { nombre: string } | null;
  vehiculos: { nombre: string } | null;
}

export function RidersList({ riders }: { riders: RiderRow[] }) {
  return (
    <table className="w-full min-w-[800px] text-sm">
      <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <tr>
          <th className="px-4 py-3">Rider</th>
          <th className="px-4 py-3">Centro</th>
          <th className="px-4 py-3">Provincia</th>
          <th className="px-4 py-3">Vehículo</th>
          <th className="px-4 py-3 text-right">Activo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {riders.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-3">
              <div className="font-medium text-ink">{r.nombre}</div>
              <div className="text-xs text-ink-muted">{r.dni} · {r.email}</div>
            </td>
            <td className="px-4 py-3">{r.centros?.nombre ?? '—'}</td>
            <td className="px-4 py-3 text-xs text-ink-muted">{r.provincia ?? '—'}</td>
            <td className="px-4 py-3">{r.vehiculos?.nombre ?? '—'}</td>
            <td className="px-4 py-3 text-right">
              <div className="flex justify-end">
                <ToggleSwitch activo={r.activo} onToggle={(v) => toggleRiderActivo(r.id, v)} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
