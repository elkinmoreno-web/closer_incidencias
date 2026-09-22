'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, UsersRound, Check, Loader2 } from 'lucide-react';
import { guardarModulo, type ModuloConSeleccion } from '@/app/dashboard/configuracion/modulos-actions';
import type { VisibilidadModulo } from '@/lib/modulos';

interface Opcion {
  id: string;
  nombre: string;
}

const ESTADOS: { valor: VisibilidadModulo; etiqueta: string; icono: typeof Eye; clase: string }[] = [
  { valor: 'todos', etiqueta: 'Todos', icono: Eye, clase: 'bg-emerald-600 text-white' },
  { valor: 'seleccionados', etiqueta: 'Solo algunos', icono: UsersRound, clase: 'bg-amber-500 text-white' },
  { valor: 'nadie', etiqueta: 'Nadie', icono: EyeOff, clase: 'bg-slate-600 text-white' },
];

function FilaModulo({ modulo, admins, centros }: { modulo: ModuloConSeleccion; admins: Opcion[]; centros: Opcion[] }) {
  const [pending, startTransition] = useTransition();
  const [visibilidad, setVisibilidad] = useState<VisibilidadModulo>(modulo.visibilidad);
  const [seleccion, setSeleccion] = useState<string[]>(modulo.seleccion);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Para módulos del gestor se eligen ADMINS; para los del rider, CENTROS
  // (hay ~7.000 riders: una lista uno a uno sería inmanejable, y lo que se
  // quiere es pilotar por centro).
  const opciones = modulo.ambito === 'admin' ? admins : centros;
  const etiquetaSeleccion = modulo.ambito === 'admin' ? 'Visible solo para estos gestores' : 'Visible solo en estos centros';

  function alternar(id: string) {
    setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setGuardado(false);
  }

  function guardar() {
    setMensaje(null);
    startTransition(async () => {
      const res = await guardarModulo(modulo.clave, visibilidad, seleccion);
      if (res && 'error' in res) {
        setMensaje(res.error);
        return;
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    });
  }

  const hayCambios =
    visibilidad !== modulo.visibilidad ||
    seleccion.length !== modulo.seleccion.length ||
    seleccion.some((s) => !modulo.seleccion.includes(s));

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{modulo.nombre}</p>
          <p className="text-xs text-ink-muted">{modulo.ambito === 'admin' ? 'Panel de gestión' : 'Panel del rider'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {ESTADOS.map((e) => {
            const Icono = e.icono;
            const activo = visibilidad === e.valor;
            return (
              <button
                key={e.valor}
                type="button"
                onClick={() => {
                  setVisibilidad(e.valor);
                  setGuardado(false);
                }}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  activo ? e.clase : 'border border-border text-ink-muted hover:border-primary'
                }`}
              >
                <Icono size={13} />
                {e.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {visibilidad === 'seleccionados' && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-ink-muted">{etiquetaSeleccion}</p>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {opciones.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => alternar(o.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  seleccion.includes(o.id)
                    ? 'bg-primary font-semibold text-white'
                    : 'border border-border text-ink-muted hover:border-primary'
                }`}
              >
                {o.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {(hayCambios || mensaje || guardado) && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={guardar}
            disabled={pending || !hayCambios}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar
          </button>
          {guardado && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check size={13} /> Guardado
            </span>
          )}
          {mensaje && <span className="text-xs text-danger">{mensaje}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Interruptores de visibilidad de los módulos del panel.
 *
 * Sirve para tener algo terminado en producción sin enseñarlo todavía, o
 * para pilotarlo con unos pocos gestores o centros antes de abrirlo.
 *
 * Configuración no aparece en la lista a propósito: si se pudiera apagar,
 * el super admin se quedaría sin la pantalla desde la que encenderla.
 */
export function ModulosPanel({
  modulos,
  admins,
  centros,
}: {
  modulos: ModuloConSeleccion[];
  admins: Opcion[];
  centros: Opcion[];
}) {
  const delPanel = modulos.filter((m) => m.ambito === 'admin');
  const delRider = modulos.filter((m) => m.ambito === 'rider');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Panel de gestión</p>
        <div className="flex flex-col gap-2">
          {delPanel.map((m) => (
            <FilaModulo key={m.clave} modulo={m} admins={admins} centros={centros} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Panel del rider</p>
        <div className="flex flex-col gap-2">
          {delRider.map((m) => (
            <FilaModulo key={m.clave} modulo={m} admins={admins} centros={centros} />
          ))}
        </div>
      </div>
    </div>
  );
}
