'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarReclamacion, type FormActionState } from '@/app/rider/dashboard/actions';
import { compressImageIfNeeded, validarArchivoCliente } from '@/lib/compressImage';
import type { MotivoReclamacion } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

const TIPOS_NOMINA = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function EstadoEnvio({ comprimiendo }: { comprimiendo: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useIdioma();
  const [segundos, setSegundos] = useState(0);
  const activo = comprimiendo || pending;

  useEffect(() => {
    if (!activo) {
      setSegundos(0);
      return;
    }
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [activo]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="submit"
        disabled={activo}
        className="w-full rounded-full bg-primary py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
      >
        {comprimiendo ? t('reclamacionForm.optimizando') : pending ? t('reclamacionForm.enviando') : t('reclamacionForm.enviar')}
      </button>
      {activo && segundos >= 3 && (
        <p className="text-xs text-ink-muted">
          {t('reclamacionForm.sigueTrabajando')} ({segundos}s)
        </p>
      )}
    </div>
  );
}

/** Mes actual en aaaa-mm, que es el tope del selector: no se reclama una nómina futura. */
function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ReclamacionForm({ dni, motivos }: { dni: string; motivos: MotivoReclamacion[] }) {
  const { t, idioma } = useIdioma();
  const [state, formAction] = useFormState<FormActionState, FormData>(enviarReclamacion, undefined);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);

  function alElegirArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const errores = files.map((f) => validarArchivoCliente(f, TIPOS_NOMINA)).filter((err): err is string => !!err);
    if (errores.length > 0) {
      setErrorArchivos(errores[0]);
      setArchivos([]);
      e.target.value = '';
      return;
    }
    setErrorArchivos(null);
    setArchivos(files);
  }

  async function handleSubmit(formData: FormData) {
    setComprimiendo(true);
    try {
      const files = formData.getAll('nomina') as File[];
      formData.delete('nomina');
      for (const f of files) {
        if (f && f.size > 0) formData.append('nomina', await compressImageIfNeeded(f));
      }
    } finally {
      setComprimiendo(false);
    }
    await formAction(formData);
  }

  if (state?.success) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
        {t('reclamacionForm.enviada')}
        <button onClick={() => window.location.reload()} className="ml-2 underline">
          {t('reclamacionForm.enviarOtra')}
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
      <input type="hidden" name="dni" value={dni} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('reclamacionForm.concepto')} *</label>
        <select
          name="motivoId"
          required
          defaultValue=""
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="" disabled>
            {t('reclamacionForm.selecciona')}
          </option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {nombreSegunIdioma(idioma, m.nombre, m.nombre_en)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-muted">{t('reclamacionForm.periodo')} *</label>
          <input
            type="month"
            name="periodo"
            required
            max={mesActual()}
            defaultValue={mesActual()}
            className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-ink-muted">{t('reclamacionForm.periodoAyuda')}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-muted">{t('reclamacionForm.importe')}</label>
          <input
            type="number"
            name="importe"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0,00"
            className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-ink-muted">{t('reclamacionForm.importeAyuda')}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('reclamacionForm.nomina')} *</label>
        <input
          type="file"
          name="nomina"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          required
          onChange={alElegirArchivos}
          className="text-sm"
        />
        <span className="text-xs text-ink-muted">{t('reclamacionForm.nominaAyuda')}</span>
        {errorArchivos && <p className="text-xs text-danger">{errorArchivos}</p>}
        {archivos.length > 0 && (
          <ul className="mt-1 text-xs text-ink-muted">
            {archivos.map((f) => (
              <li key={f.name}>· {f.name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('reclamacionForm.comentario')}</label>
        <textarea
          name="comentario"
          rows={3}
          placeholder={t('reclamacionForm.comentarioPlaceholder')}
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {state?.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{state.error}</p>}

      <EstadoEnvio comprimiendo={comprimiendo} />
    </form>
  );
}
