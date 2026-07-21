'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { loginRider, type RiderLoginState } from '@/app/rider/login/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('RiderLogin');
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-primary py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? t('entrando') : t('entrar')}
    </button>
  );
}

export function RiderLoginForm() {
  const [state, formAction] = useFormState<RiderLoginState, FormData>(loginRider, undefined);
  const t = useTranslations('RiderLogin');

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dni" className="text-sm font-semibold text-ink-muted">
          {t('dni')}
        </label>
        <input
          id="dni"
          name="dni"
          type="text"
          autoComplete="username"
          required
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          placeholder={t('dniPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-ink-muted">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          placeholder={t('passwordPlaceholder')}
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
