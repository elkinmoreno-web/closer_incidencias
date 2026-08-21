'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { crearAusenciaAdmin, type FormActionState } from '@/app/dashboard/ausencias/actions';
import type { MotivoAusencia } from '@/lib/types';
import { BuscadorRiderRemoto } from '@/components/shared/BuscadorRiderRemoto';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useIdioma();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? t('nuevaAusencia.guardando') : t('nuevaAusencia.crear')}
    </button>
  );
}

export function NuevaAusenciaModal({ motivos }: { motivos: MotivoAusencia[] }) {
  const { t, idioma } = useIdioma();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<FormActionState, FormData>(crearAusenciaAdmin, undefined);
  const [fechaInicio, setFechaInicio] = useState('');

  if (state?.success && open) {
    setTimeout(() => setOpen(false), 800);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
      >
        <Plus size={16} />
        {t('nuevaAusencia.nueva')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{t('nuevaAusencia.nueva')}</h2>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <form action={formAction} className="flex flex-col gap-3" encType="multipart/form-data">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('nuevaAusencia.rider')}</label>
                <BuscadorRiderRemoto />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('editIncidencia.motivo')}</label>
                <select name="motivoId" required defaultValue="" className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="" disabled>{t('editIncidencia.selecciona')}</option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>{nombreSegunIdioma(idioma, m.nombre, m.nombre_en)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('nuevaAusencia.fechaInicio')}</label>
                  <input type="date" name="fechaInicio" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('nuevaAusencia.fechaFin')}</label>
                  <input type="date" name="fechaFin" required min={fechaInicio || undefined} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('nuevaAusencia.justificantesOpcional')}</label>
                <input type="file" name="justificantes" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="text-sm" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('nuevaAusencia.comentario')}</label>
                <textarea name="comentario" rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>

              {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
              {state?.success && <p className="text-sm font-medium text-emerald-700">{t('nuevaAusencia.creada')}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                  {t('editIncidencia.cancelar')}
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
