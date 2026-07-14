'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Pencil, Check, X } from 'lucide-react';
import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { toggleRiderActivo, restablecerPasswordRider, actualizarEmailMetricas } from '@/app/dashboard/riders/actions';

interface RiderRow {
  id: string;
  nombre: string;
  dni: string;
  email: string;
  email_metricas?: string | null;
  activo: boolean;
  provincia: string | null;
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
 * Muestra/edita el "email de métricas" del rider — el que usa en la app
 * de reparto, si es distinto al de RRHH. Útil cuando alguien no ve sus
 * propias métricas: revisas aquí y corriges el email correcto.
 */
function EmailMetricas({ riderId, valorActual }: { riderId: string; valorActual: string | null | undefined }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorActual ?? '');
  const [pending, startTransition] = useTransition();

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="flex items-center gap-1 text-xs text-ink-muted hover:text-primary"
        title="Corregir el email que usa en la app de reparto, si es distinto"
      >
        {valorActual ? (
          <span className="max-w-[160px] truncate">{valorActual}</span>
        ) : (
          <span className="italic opacity-60">Sin definir</span>
        )}
        <Pencil size={11} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="email en la app de reparto"
        className="w-40 rounded border border-border bg-surface px-1.5 py-0.5 text-xs focus:border-primary focus:outline-none"
      />
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await actualizarEmailMetricas(riderId, valor);
            setEditando(false);
          })
        }
        className="text-emerald-600 hover:text-emerald-700"
      >
        <Check size={14} />
      </button>
      <button
        disabled={pending}
        onClick={() => {
          setValor(valorActual ?? '');
          setEditando(false);
        }}
        className="text-ink-muted hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function RidersList({ riders }: { riders: RiderRow[] }) {
  return (
    <table className="w-full min-w-[950px] text-sm">
      <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <tr>
          <th className="px-4 py-3">Rider</th>
          <th className="px-4 py-3">Centro</th>
          <th className="px-4 py-3">Provincia</th>
          <th className="px-4 py-3">Vehículo</th>
          <th className="px-4 py-3">Email métricas</th>
          <th className="px-4 py-3 text-right">Activo</th>
          <th className="px-4 py-3 text-right">Contraseña</th>
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
            <td className="px-4 py-3">
              <EmailMetricas riderId={r.id} valorActual={r.email_metricas} />
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex justify-end">
                <ToggleSwitch activo={r.activo} onToggle={(v) => toggleRiderActivo(r.id, v)} />
              </div>
            </td>
            <td className="px-4 py-3 text-right">
              <BotonResetPassword riderId={r.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
