'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarIncidencia, type FormActionState } from '@/app/rider/dashboard/actions';
import { compressImageIfNeeded } from '@/lib/compressImage';
import type { Motivo } from '@/lib/types';

function SubmitButton({ comprimiendo }: { comprimiendo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || comprimiendo}
      className="w-full rounded-full bg-primary py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {comprimiendo ? 'Optimizando imágenes...' : pending ? 'Enviando...' : 'Enviar incidencia'}
    </button>
  );
}

export function IncidenciaForm({ dni, motivos }: { dni: string; motivos: Motivo[] }) {
  const [state, formAction] = useFormState<FormActionState, FormData>(enviarIncidencia, undefined);
  const [motivoId, setMotivoId] = useState('');
  const [comprimiendo, setComprimiendo] = useState(false);

  const motivoSeleccionado = useMemo(() => motivos.find((m) => String(m.id) === motivoId), [motivoId, motivos]);

  async function handleSubmit(formData: FormData) {
    setComprimiendo(true);
    try {
      const screenshot = formData.get('screenshot') as File | null;
      const evidencia = formData.get('evidencia') as File | null;
      if (screenshot && screenshot.size > 0) {
        formData.set('screenshot', await compressImageIfNeeded(screenshot));
      }
      if (evidencia && evidencia.size > 0) {
        formData.set('evidencia', await compressImageIfNeeded(evidencia));
      }
    } finally {
      setComprimiendo(false);
    }
    await formAction(formData);
  }

  if (state?.success) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
        Incidencia enviada. Quedará pendiente de revisión por el equipo.
        <button onClick={() => window.location.reload()} className="ml-2 underline">
          Enviar otra
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
      <input type="hidden" name="dni" value={dni} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Motivo *</label>
        <select
          name="motivoId"
          required
          value={motivoId}
          onChange={(e) => setMotivoId(e.target.value)}
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="" disabled>
            Selecciona un motivo
          </option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Código del pedido</label>
        <input
          name="codigoPedido"
          placeholder="Ej: UB-123456"
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {motivoSeleccionado?.requiere_direcciones && (
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-bg p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-ink-muted">Dirección de recogida *</label>
            <input
              name="direccionRecogida"
              required
              className="rounded-xl border-2 border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-ink-muted">Dirección de entrega *</label>
            <input
              name="direccionEntrega"
              required
              className="rounded-xl border-2 border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">
          Observaciones {motivoSeleccionado?.requiere_observaciones && '*'}
        </label>
        <textarea
          name="observaciones"
          rows={3}
          required={motivoSeleccionado?.requiere_observaciones}
          placeholder="Añade detalles que ayuden a la revisión..."
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {motivoSeleccionado?.requiere_captura && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-muted">Captura del código del pedido *</label>
          <input
            type="file"
            name="screenshot"
            accept="image/jpeg,image/png,image/webp"
            required
            className="text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Evidencia adicional (opcional)</label>
        <input type="file" name="evidencia" accept="image/jpeg,image/png,image/webp" className="text-sm" />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton comprimiendo={comprimiendo} />
    </form>
  );
}
