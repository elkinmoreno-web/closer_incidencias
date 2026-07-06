'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginRider, type RiderLoginState } from '@/app/rider/login/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-primary py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? 'Entrando...' : 'Entrar'}
    </button>
  );
}

export function RiderLoginForm() {
  const [state, formAction] = useFormState<RiderLoginState, FormData>(loginRider, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-semibold text-ink-muted">
          Tu correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          placeholder="tucorreo@ejemplo.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="dni" className="text-sm font-semibold text-ink-muted">
          Tu DNI/NIE
        </label>
        <input
          id="dni"
          name="dni"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          placeholder="Ej: 12345678X"
        />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
