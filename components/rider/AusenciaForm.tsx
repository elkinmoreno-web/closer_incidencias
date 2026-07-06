'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarAusencia, type FormActionState } from '@/app/rider/dashboard/actions';
import { compressImageIfNeeded } from '@/lib/compressImage';
import type { MotivoAusencia } from '@/lib/types';

function SubmitButton({ comprimiendo }: { comprimiendo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || comprimiendo}
      className="w-full rounded-full bg-primary py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {comprimiendo ? 'Optimizando archivos...' : pending ? 'Enviando...' : 'Enviar comunicación'}
    </button>
  );
}

export function AusenciaForm({ dni, motivos }: { dni: string; motivos: MotivoAusencia[] }) {
  const [state, formAction] = useFormState<FormActionState, FormData>(enviarAusencia, undefined);
  const [fechaInicio, setFechaInicio] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [comprimiendo, setComprimiendo] = useState(false);

  async function handleSubmit(formData: FormData) {
    setComprimiendo(true);
    try {
      const files = formData.getAll('justificantes') as File[];
      formData.delete('justificantes');
      for (const f of files) {
        if (f && f.size > 0) {
          formData.append('justificantes', await compressImageIfNeeded(f));
        }
      }
    } finally {
      setComprimiendo(false);
    }
    await formAction(formData);
  }

  if (state?.success) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
        Ausencia comunicada. Quedará pendiente de revisión.
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
          defaultValue=""
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-muted">Fecha de inicio *</label>
          <input
            type="date"
            name="fechaInicio"
            required
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-muted">Fecha de fin *</label>
          <input
            type="date"
            name="fechaFin"
            required
            min={fechaInicio || undefined}
            className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Justificantes *</label>
        <input
          type="file"
          name="justificantes"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          required
          onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        <span className="text-xs text-ink-muted">Imágenes o PDF, máx. 10 MB cada uno y 10 archivos.</span>
        {archivos.length > 0 && (
          <ul className="mt-1 text-xs text-ink-muted">
            {archivos.map((f) => (
              <li key={f.name}>· {f.name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Comentario (opcional)</label>
        <textarea
          name="comentario"
          rows={3}
          placeholder="Añade cualquier detalle que consideres relevante..."
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
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
