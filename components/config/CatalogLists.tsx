'use client';

import { useState, useTransition } from 'react';
import { Pencil, Check, X, Languages } from 'lucide-react';
import { ToggleSwitch } from '@/components/config/ToggleSwitch';
import { VerTextoCompleto } from '@/components/shared/VerTextoCompleto';
import {
  toggleCentro,
  toggleVehiculo,
  toggleMotivo,
  toggleMotivoAusencia,
  asignarCiudadCentro,
  actualizarInstruccionesMotivo,
  actualizarInstruccionesMotivoEn,
  actualizarNombreMotivoEn,
  actualizarNombreMotivoAusenciaEn,
} from '@/app/dashboard/configuracion/actions';
import type { Centro, Vehiculo, Motivo, MotivoAusencia, Ciudad } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

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
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();
  const sinCiudad = centros.filter((c) => !c.ciudad_id).length;

  return (
    <div>
      {sinCiudad > 0 && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {sinCiudad} {t('catalogo.sinCiudadAviso')}
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
                <option value="">{t('catalogo.sinCiudad')}</option>
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

/** Icono de ojo que muestra el texto completo en un popup centrado, sin entrar a modo edición ni desbordarse de su fila. */
function InstruccionesAprobacion({
  nombreMotivo,
  valorActual,
  onGuardar,
  ingles,
}: {
  nombreMotivo: string;
  valorActual: string | null | undefined;
  onGuardar: (valor: string) => Promise<void>;
  ingles?: boolean;
}) {
  const { t } = useIdioma();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorActual ?? '');
  const [pending, startTransition] = useTransition();

  if (!editando) {
    return (
      <div className="mt-0.5 flex items-center gap-1.5">
        <button
          onClick={() => setEditando(true)}
          className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-primary"
          title={ingles ? t('catalogo.tituloInstruccionesEn') : t('catalogo.tituloInstrucciones')}
        >
          {ingles && <Languages size={10} />}
          {valorActual ? (
            <span className="max-w-[220px] truncate italic">&quot;{valorActual}&quot;</span>
          ) : (
            <span className="italic opacity-60">
              {ingles ? t('catalogo.sinInstruccionesEnUsa') : t('catalogo.sinInstruccionesAprobar')}
            </span>
          )}
          <Pencil size={10} />
        </button>
        {valorActual && <VerTextoCompleto titulo={`${t('catalogo.instruccionesTitulo')} ${nombreMotivo}`} texto={valorActual} />}
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-start gap-1">
      <textarea
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={ingles ? 'English instructions...' : t('catalogo.instruccionesPlaceholder')}
        rows={2}
        className="w-64 rounded border border-border bg-surface px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
      />
      <div className="flex flex-col gap-1">
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
    </div>
  );
}

// Umbral a partir del cual un nombre de motivo se considera "largo" y
// muestra el ojo — por debajo de esto, el truncado con "..." casi nunca
// llega a activarse de verdad, así que no hace falta el botón.
const NOMBRE_LARGO = 38;

function NombreMotivo({ nombre, activo }: { nombre: string; activo: boolean }) {
  const { t } = useIdioma();
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className={`truncate ${activo ? 'text-ink' : 'text-ink-muted line-through'}`}>{nombre}</div>
      {nombre.length > NOMBRE_LARGO && <VerTextoCompleto titulo={t('catalogo.motivo')} texto={nombre} />}
    </div>
  );
}

/**
 * Edición inline del nombre en inglés — el mismo catálogo de motivos
 * se comparte entre España y Alemania; este campo es lo que ve un
 * rider/admin alemán en vez del nombre en español. Si queda vacío,
 * la aplicación cae al nombre en español como respaldo.
 */
function NombreEnEditable({
  nombreEs,
  valorActual,
  onGuardar,
}: {
  nombreEs: string;
  valorActual: string | null;
  onGuardar: (valor: string) => Promise<void>;
}) {
  const { t } = useIdioma();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorActual ?? '');
  const [pending, startTransition] = useTransition();

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted hover:text-primary"
        title={t('catalogo.tituloNombreEn')}
      >
        <Languages size={10} />
        {valorActual ? (
          <span className="max-w-[220px] truncate italic">{valorActual}</span>
        ) : (
          <span className="italic opacity-60">{t('catalogo.sinNombreEnUsa')} &quot;{nombreEs}&quot;)</span>
        )}
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
        placeholder="English name..."
        className="w-56 rounded border border-border bg-surface px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
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
          <div className="flex items-center justify-between gap-2">
            <NombreMotivo nombre={m.nombre} activo={m.activo} />
            <ToggleSwitch activo={m.activo} onToggle={(v) => toggleMotivo(m.id, v)} />
          </div>
          <NombreEnEditable nombreEs={m.nombre} valorActual={m.nombre_en} onGuardar={(v) => actualizarNombreMotivoEn(m.id, v)} />
          <InstruccionesAprobacion
            nombreMotivo={m.nombre}
            valorActual={m.instrucciones_aprobacion}
            onGuardar={(v) => actualizarInstruccionesMotivo(m.id, v)}
          />
          <InstruccionesAprobacion
            nombreMotivo={m.nombre}
            valorActual={m.instrucciones_aprobacion_en}
            onGuardar={(v) => actualizarInstruccionesMotivoEn(m.id, v)}
            ingles
          />
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
          <div className="flex items-center justify-between gap-2">
            <NombreMotivo nombre={m.nombre} activo={m.activo} />
            <ToggleSwitch activo={m.activo} onToggle={(v) => toggleMotivoAusencia(m.id, v)} />
          </div>
          <NombreEnEditable nombreEs={m.nombre} valorActual={m.nombre_en} onGuardar={(v) => actualizarNombreMotivoAusenciaEn(m.id, v)} />
        </div>
      ))}
    </div>
  );
}
