'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { toggleRiderActivo, restablecerPasswordRider, eliminarRider } from '@/app/dashboard/riders/actions';
import { EditarRiderModal } from '@/components/riders/EditarRiderModal';

interface RiderRow {
  id: string;
  nombre: string;
  dni: string;
  email: string;
  activo: boolean;
  provincia: string | null;
  centro_id: number | null;
  vehiculo_id: number | null;
  centros: { nombre: string } | null;
  vehiculos: { nombre: string } | null;
}

function BotonResetPassword({ riderId }: { riderId: string }) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        title="Restablecer contraseña al esquema actual"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await restablecerPasswordRider(riderId);
            setMensaje(res.ok ? `Nueva: ${res.passwordNueva}` : res.motivo ?? 'Error');
            setTimeout(() => setMensaje(null), 8000);
          })
        }
        className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
      >
        <KeyRound size={14} />
      </button>
      {mensaje && <span className="text-[10px] text-ink-muted">{mensaje}</span>}
    </div>
  );
}

/**
 * Elimina el rider por completo (fila + acceso de Auth), no solo lo
 * desactiva. Es lo que faltaba para que borrar un rider nunca deje un
 * usuario huérfano en Authentication — antes, la única forma de
 * "borrar" era hacerlo a mano en Supabase, y eso se olvidaba de Auth.
 */
function BotonEliminar({ riderId, nombre }: { riderId: string; nombre: string }) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function eliminar() {
    if (!confirm(`¿Eliminar a ${nombre} por completo? Esto borra su acceso y no se puede deshacer.`)) return;
    startTransition(async () => {
      const res = await eliminarRider(riderId);
      if (!res.ok) {
        setMensaje(res.motivo ?? 'Error');
        setTimeout(() => setMensaje(null), 8000);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        title="Eliminar rider por completo (fila + acceso)"
        disabled={pending}
        onClick={eliminar}
        className="rounded-full bg-red-50 p-2 text-danger transition hover:bg-red-100 disabled:opacity-60"
      >
        <Trash2 size={14} />
      </button>
      {mensaje && <span className="max-w-[140px] text-right text-[10px] text-danger">{mensaje}</span>}
    </div>
  );
}

export function RidersList({
  riders,
  centros,
  vehiculos,
  esSuperAdmin,
}: {
  riders: RiderRow[];
  centros: { id: number; nombre: string }[];
  vehiculos: { id: number; nombre: string }[];
  esSuperAdmin: boolean;
}) {
  return (
    <table className="w-full min-w-[980px] text-sm">
      <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <tr>
          <th className="px-4 py-3">Rider</th>
          <th className="px-4 py-3">Centro</th>
          <th className="px-4 py-3">Provincia</th>
          <th className="px-4 py-3">Vehículo</th>
          <th className="px-4 py-3 text-right">Activo</th>
          <th className="px-4 py-3 text-right">Contraseña</th>
          {esSuperAdmin && <th className="px-4 py-3 text-right">Editar</th>}
          {esSuperAdmin && <th className="px-4 py-3 text-right">Eliminar</th>}
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
            <td className="px-4 py-3 text-right">
              <BotonResetPassword riderId={r.id} />
            </td>
            {esSuperAdmin && (
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end">
                  <EditarRiderModal rider={r} centros={centros} vehiculos={vehiculos} />
                </div>
              </td>
            )}
            {esSuperAdmin && (
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end">
                  <BotonEliminar riderId={r.id} nombre={r.nombre} />
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
