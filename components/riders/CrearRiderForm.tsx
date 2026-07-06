'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { crearRider, type RiderFormState } from '@/app/dashboard/riders/actions';
import type { Centro, Vehiculo } from '@/lib/types';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? 'Creando...' : 'Añadir rider'}
    </button>
  );
}

export function CrearRiderForm({ centros, vehiculos }: { centros: Centro[]; vehiculos: Vehiculo[] }) {
  const [state, formAction] = useFormState<RiderFormState, FormData>(crearRider, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <input name="nombre" placeholder="Nombre completo" required className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
      <input name="dni" placeholder="DNI/NIE" required className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
      <input name="email" type="email" placeholder="Email" required className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
      <select name="centroId" required defaultValue="" className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
        <option value="" disabled>Centro (obligatorio)...</option>
        {centros.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      <select name="vehiculoId" defaultValue="" className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
        <option value="">Vehículo...</option>
        {vehiculos.map((v) => (
          <option key={v.id} value={v.id}>{v.nombre}</option>
        ))}
      </select>

      {state?.error && <p className="col-span-full text-sm font-medium text-danger">{state.error}</p>}
      {state?.success && <p className="col-span-full text-sm font-medium text-emerald-700">Rider creado. Ya puede entrar con su email.</p>}

      <div className="col-span-full">
        <SubmitButton />
      </div>
    </form>
  );
}
