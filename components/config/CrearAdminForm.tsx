'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { crearAdmin, type CrearAdminState } from '@/app/dashboard/configuracion/actions';

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

export function CrearAdminForm() {
  const [state, formAction] = useFormState<CrearAdminState, FormData>(crearAdmin, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <select
        name="rol"
        defaultValue="moderador"
        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
      >
        <option value="moderador">Moderador</option>
        <option value="super_admin">Super Admin</option>
      </select>

      {state?.error && <p className="col-span-full text-sm font-medium text-danger">{state.error}</p>}
      {state?.success && (
        <p className="col-span-full text-sm font-medium text-emerald-700">Administrador creado correctamente.</p>
      )}

      <div className="col-span-full">
        <SubmitButton />
      </div>
    </form>
  );
}
