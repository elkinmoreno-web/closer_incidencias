'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { crearAdmin, type CrearAdminState } from '@/app/dashboard/configuracion/actions';
import type { Ciudad } from '@/lib/types';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? 'Creando...' : 'Crear administrador'}
    </button>
  );
}

/**
 * `puedeCrearTodosLosRoles`: true si quien crea es Super Admin (puede
 * elegir cualquier rol). Si es Administrador, solo puede crear
 * Moderadores, así que el selector queda fijo.
 */
export function CrearAdminForm({ ciudades, puedeCrearTodosLosRoles }: { ciudades: Ciudad[]; puedeCrearTodosLosRoles: boolean }) {
  const [state, formAction] = useFormState<CrearAdminState, FormData>(crearAdmin, undefined);
  const [rol, setRol] = useState(puedeCrearTodosLosRoles ? 'administrador' : 'moderador');

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="usuario"
          placeholder="Nombre de usuario"
          required
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña temporal (mín. 8 caracteres)"
          required
          minLength={8}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        {puedeCrearTodosLosRoles ? (
          <select
            name="rol"
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="administrador">Administrador (ve todo + Anuncio Global)</option>
            <option value="moderador">Moderador (restringido a sus ciudades)</option>
            <option value="super_admin">Super Admin</option>
          </select>
        ) : (
          <input type="hidden" name="rol" value="moderador" />
        )}
      </div>

      {!puedeCrearTodosLosRoles && (
        <p className="text-xs text-ink-muted">
          Como Administrador, las cuentas que crees serán siempre de tipo Moderador.
        </p>
      )}

      {rol === 'moderador' && (
        <div className="rounded-lg border border-border bg-bg p-3">
          <p className="mb-2 text-xs font-semibold text-ink-muted">Ciudades a las que tendrá acceso:</p>
          <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
            {ciudades.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-xs text-ink">
                <input type="checkbox" name="ciudadIds" value={c.id} className="rounded" />
                {c.nombre}
              </label>
            ))}
          </div>
        </div>
      )}

      {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      {state?.success && <p className="text-sm font-medium text-emerald-700">Administrador creado correctamente.</p>}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
