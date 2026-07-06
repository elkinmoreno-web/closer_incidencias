'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { crearRidersMasivo, type BulkResultState } from '@/app/dashboard/riders/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? 'Procesando...' : 'Dar de alta el lote'}
    </button>
  );
}

export function BulkRidersForm() {
  const [state, formAction] = useFormState<BulkResultState, FormData>(crearRidersMasivo, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <textarea
        name="lineas"
        rows={6}
        placeholder={'Una línea por rider:\nNombre Apellido, 12345678X, email@ejemplo.com, Madrid, Bici eléctrica'}
        className="rounded-lg border border-border px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
      />
      <p className="text-xs text-ink-muted">
        Formato: <code>nombre, dni, email, centro, vehículo</code>. El centro y el vehículo deben
        escribirse exactamente igual que en la configuración.
      </p>

      {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      {state?.resumen && <pre className="whitespace-pre-wrap rounded-lg bg-bg p-3 text-xs text-ink">{state.resumen}</pre>}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
