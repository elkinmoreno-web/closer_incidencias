'use client';

import { useState, useTransition } from 'react';
import { Pencil, Check, X, Eye } from 'lucide-react';
import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { toggleCentro, toggleVehiculo, toggleMotivo, toggleMotivoAusencia, asignarCiudadCentro, actualizarInstruccionesMotivo } from '@/app/dashboard/configuracion/actions';
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

/** Icono de ojo que muestra el texto completo en un popover pequeño, sin entrar a modo edición. */
function VerTextoCompleto({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
        className="text-ink-muted hover:text-primary"
        title="Ver texto completo"
      >
        <Eye size={11} />
      </button>
      {abierto && (
        <>
          {/* Capa invisible para poder cerrar el popover al hacer clic fuera */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-5 z-50 w-64 max-w-[80vw] rounded-card border border-border bg-surface p-3 text-xs normal-case text-ink shadow-lg">
            <p className="whitespace-pre-wrap">{texto}</p>
          </div>
        </>
      )}
    </span>
  );
}

function InstruccionesAprobacion({ motivoId, valorActual }: { motivoId: number; valorActual: string | null | undefined }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorActual ?? '');
  const [pending, startTransition] = useTransition();

  if (!editando) {
    return (
      <div className="mt-0.5 flex items-center gap-1.5">
        <button
          onClick={() => setEditando(true)}
          className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-primary"
          title="Instrucciones que verá el rider cuando se apruebe una incidencia de este motivo"
        >
          {valorActual ? (
            <span className="max-w-[220px] truncate italic">&quot;{valorActual}&quot;</span>
          ) : (
            <span className="italic opacity-60">Sin instrucciones al aprobar</span>
          )}
          <Pencil size={10} />
        </button>
        {valorActual && <VerTextoCompleto texto={valorActual} />}
      </div>
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
        </div>
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
