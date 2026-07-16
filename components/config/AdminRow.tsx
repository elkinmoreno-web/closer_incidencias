'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { cambiarRolAdmin, toggleAdminActivo, cambiarPasswordAdmin } from '@/app/dashboard/configuracion/actions';

import { mensajeError } from '@/lib/utils';
function etiquetaRol(rol: string) {
  if (rol === 'super_admin') return 'Super Admin';
  if (rol === 'administrador') return 'Administrador';
  if (rol === 'admin_zona') return 'Moderador (rol antiguo)';
  return 'Moderador';
}

export function AdminRow({
  admin,
  zonas,
  ciudadIdsActuales,
  ciudadesDisponibles,
  esSuperAdmin,
  esYoMismo,
}: {
  admin: { id: string; usuario: string; rol: string; activo: boolean };
  zonas: string[];
  ciudadIdsActuales: number[];
  ciudadesDisponibles: { id: number; nombre: string }[];
  esSuperAdmin: boolean;
  esYoMismo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [msgPassword, setMsgPassword] = useState<string | null>(null);
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  // Rol "en edición": mientras se está eligiendo un rol de zona y sus
  // ciudades, no se aplica nada todavía — así nunca queda a medias.
  const [rolPendiente, setRolPendiente] = useState<string | null>(null);
  const [ciudadesSeleccionadas, setCiudadesSeleccionadas] = useState<Set<number>>(new Set(ciudadIdsActuales));
  const [errorRol, setErrorRol] = useState<string | null>(null);

  const muestraZonas = admin.rol === 'moderador' || admin.rol === 'administrador' || admin.rol === 'admin_zona';
  const necesitaCiudades = rolPendiente === 'administrador' || rolPendiente === 'moderador';

  function onCambiarSelectRol(nuevoRol: string) {
    setErrorRol(null);
    if (nuevoRol === admin.rol) {
      setRolPendiente(null);
      return;
    }
    if (nuevoRol === 'super_admin') {
      // Sin ciudades que elegir: se aplica directo.
      startTransition(async () => {
        try {
          await cambiarRolAdmin(admin.id, 'super_admin');
          setRolPendiente(null);
        } catch (e) {
          setErrorRol(mensajeError(e));
        }
      });
      return;
    }
    // Rol de zona: no se aplica todavía, hay que elegir ciudades primero.
    setRolPendiente(nuevoRol);
    setCiudadesSeleccionadas(new Set(ciudadIdsActuales));
  }

  function toggleCiudad(id: number) {
    setCiudadesSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function aplicarCambioRol() {
    if (!rolPendiente) return;
    if (ciudadesSeleccionadas.size === 0) {
      setErrorRol('Selecciona al menos una ciudad antes de aplicar');
      return;
    }
    setErrorRol(null);
    startTransition(async () => {
      try {
        await cambiarRolAdmin(admin.id, rolPendiente as 'administrador' | 'moderador', Array.from(ciudadesSeleccionadas));
        setRolPendiente(null);
      } catch (e) {
        setErrorRol(mensajeError(e));
      }
    });
  }

  function onToggleActivo() {
    startTransition(async () => {
      try {
        await toggleAdminActivo(admin.id, !admin.activo);
      } catch (e) {
        alert(mensajeError(e));
      }
    });
  }

  async function onGuardarPassword() {
    setGuardandoPassword(true);
    setMsgPassword(null);
    const res = await cambiarPasswordAdmin(admin.id, password);
    setGuardandoPassword(false);
    if (res.ok) {
      setMsgPassword('✓ Contraseña actualizada');
      setPassword('');
      setTimeout(() => {
        setMostrarPassword(false);
        setMsgPassword(null);
      }, 1500);
    } else {
      setMsgPassword(res.error ?? 'No se pudo cambiar');
    }
  }

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{admin.usuario}</span>
            {esYoMismo && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">tú</span>}
            {!admin.activo && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-danger">Inactivo</span>}
          </div>
          {muestraZonas && !necesitaCiudades && <div className="mt-0.5 text-xs text-ink-muted">{zonas.join(', ') || 'Sin ciudades asignadas'}</div>}
        </div>

        <div className="flex items-center gap-2">
          {/* Cambio de rol: solo super_admin, y no sobre uno mismo */}
          {esSuperAdmin && !esYoMismo ? (
            <select
              value={rolPendiente ?? (admin.rol === 'admin_zona' ? 'moderador' : admin.rol)}
              disabled={pending}
              onChange={(e) => onCambiarSelectRol(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
            >
              <option value="super_admin">Super Admin</option>
              <option value="administrador">Administrador</option>
              <option value="moderador">Moderador</option>
            </select>
          ) : (
            <span className="text-xs text-ink-muted">{etiquetaRol(admin.rol)}</span>
          )}

          {esSuperAdmin && !esYoMismo && (
            <>
              <button
                onClick={() => setMostrarPassword((v) => !v)}
                disabled={pending}
                className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-ink-muted hover:border-primary hover:text-primary"
                title="Cambiar contraseña"
              >
                <KeyRound className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onToggleActivo}
                disabled={pending}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  admin.activo ? 'border-red-200 text-danger hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {admin.activo ? 'Desactivar' : 'Activar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selector de ciudades inline: aparece SOLO mientras se está
          eligiendo un rol de zona, y el cambio no se aplica hasta pulsar
          "Aplicar" — así nunca queda un rol de zona sin ciudades. */}
      {necesitaCiudades && (
        <div className="mt-2 rounded-lg bg-bg p-3">
          <p className="mb-2 text-xs font-medium text-ink">
            Elige las ciudades para el rol &quot;{rolPendiente === 'administrador' ? 'Administrador' : 'Moderador'}&quot;:
          </p>
          <div className="mb-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {ciudadesDisponibles.map((c) => (
              <label
                key={c.id}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                  ciudadesSeleccionadas.has(c.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-ink-muted'
                }`}
              >
                <input type="checkbox" checked={ciudadesSeleccionadas.has(c.id)} onChange={() => toggleCiudad(c.id)} className="hidden" />
                {c.nombre}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={aplicarCambioRol}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Aplicar cambio de rol
            </button>
            <button
              onClick={() => {
                setRolPendiente(null);
                setErrorRol(null);
              }}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {errorRol && <p className="mt-1.5 text-xs text-danger">{errorRol}</p>}

      {mostrarPassword && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-bg p-2">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña (mín. 8 caracteres)"
            className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          />
          <button
            onClick={onGuardarPassword}
            disabled={guardandoPassword || password.length < 8}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {guardandoPassword && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </button>
          {msgPassword && <span className={`text-xs ${msgPassword.startsWith('✓') ? 'text-emerald-600' : 'text-danger'}`}>{msgPassword}</span>}
        </div>
      )}
    </div>
  );
}
