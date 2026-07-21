'use client';

import { useState, useTransition } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { toggleCentro, toggleVehiculo, toggleMotivo, toggleMotivoAusencia, asignarCiudadCentro, actualizarInstruccionesMotivo, actualizarNombreEnMotivo, actualizarNombreEnMotivoAusencia } from '@/app/dashboard/configuracion/actions';
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

function InstruccionesAprobacion({ motivoId, valorActual }: { motivoId: number; valorActual: string | null | undefined }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorActual ?? '');
  const [pending, startTransition] = useTransition();

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted hover:text-primary"
        title="Instrucciones que verá el rider cuando se apruebe una incidencia de este motivo"
      >
        {valorActual ? (
          <span className="max-w-[220px] truncate italic">&quot;{valorActual}&quot;</span>
        ) : (
          <span className="italic opacity-60">Sin instrucciones al aprobar</span>
        )}
        <Pencil size={10} />
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-start gap-1">
      <textarea
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Ej: Recuerda entregar el paquete en la oficina antes de las 18:00..."
        rows={2}
        className="w-64 rounded border border-border bg-surface px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
      />
      <div className="flex flex-col gap-1">
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await actualizarInstruccionesMotivo(motivoId, valor);
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
    </div>
  );
}

function NombreEnEditor({ valorActual, onGuardar }: { valorActual: string | null | undefined; onGuardar: (valor: string) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorActual ?? '');
  const [pending, startTransition] = useTransition();

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-primary"
        title="Nombre en inglés (opcional) — si se deja vacío, se muestra el nombre en español"
      >
        {valorActual ? <span className="max-w-[200px] truncate">EN: {valorActual}</span> : <span className="italic opacity-60">Sin traducir al inglés</span>}
        <Pencil size={10} />
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1">
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="English name"
        className="w-52 rounded border border-border bg-surface px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
      />
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await onGuardar(valor);
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

export function MotivosList({ motivos }: { motivos: Motivo[] }) {
  return (
    <div>
      {motivos.map((m) => (
        <div key={m.id} className="border-b border-border py-2.5 last:border-0">
          <div className="flex items-center justify-between">
            <div className={m.activo ? 'text-ink' : 'text-ink-muted line-through'}>{m.nombre}</div>
            <ToggleSwitch activo={m.activo} onToggle={(v) => toggleMotivo(m.id, v)} />
          </div>
          <InstruccionesAprobacion motivoId={m.id} valorActual={m.instrucciones_aprobacion} />
          <NombreEnEditor valorActual={m.nombre_en} onGuardar={(valor) => actualizarNombreEnMotivo(m.id, valor)} />
        </div>
      ))}
    </div>
  );
}

export function MotivosAusenciaList({ motivos }: { motivos: MotivoAusencia[] }) {
  return (
    <div>
      {motivos.map((m) => (
        <div key={m.id} className="border-b border-border py-2.5 last:border-0">
          <div className="flex items-center justify-between">
            <div className={m.activo ? 'text-ink' : 'text-ink-muted line-through'}>{m.nombre}</div>
            <ToggleSwitch activo={m.activo} onToggle={(v) => toggleMotivoAusencia(m.id, v)} />
          </div>
          <NombreEnEditor valorActual={m.nombre_en} onGuardar={(valor) => actualizarNombreEnMotivoAusencia(m.id, valor)} />
        </div>
      ))}
    </div>
  );
}
