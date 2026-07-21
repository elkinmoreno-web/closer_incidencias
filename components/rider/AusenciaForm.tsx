'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations, useLocale } from 'next-intl';
import { enviarAusencia, type FormActionState } from '@/app/rider/dashboard/actions';
import { compressImageIfNeeded, validarArchivoCliente } from '@/lib/compressImage';
import { nombreLocalizado } from '@/lib/utils';
import type { MotivoAusencia } from '@/lib/types';

const TIPOS_JUSTIFICANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function EstadoEnvio({ comprimiendo }: { comprimiendo: boolean }) {
  const { pending } = useFormStatus();
  const t = useTranslations('AusenciaForm');
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
        {comprimiendo ? t('optimizandoArchivos') : pending ? t('enviando') : t('enviar')}
      </button>
      {activo && segundos >= 3 && <p className="text-xs text-ink-muted">{t('siguiendoTrabajando', { segundos })}</p>}
    </div>
  );
}

export function AusenciaForm({ dni, motivos }: { dni: string; motivos: MotivoAusencia[] }) {
  const [state, formAction] = useFormState<FormActionState, FormData>(enviarAusencia, undefined);
  const [fechaInicio, setFechaInicio] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const t = useTranslations('AusenciaForm');
  const locale = useLocale();

  /**
   * Valida TODOS los archivos elegidos al instante — antes de comprimir
   * o subir nada. Si alguno no sirve (tipo o tamaño), se rechaza la
   * selección completa y se pide elegir de nuevo, en vez de dejar que
   * un archivo inválido (ej. un video) se suba entero antes de que el
   * servidor pueda rechazarlo.
   */
  function alElegirArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const errores = files.map((f) => validarArchivoCliente(f, TIPOS_JUSTIFICANTE)).filter((err): err is string => !!err);
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
        {t('exito')}
        <button onClick={() => window.location.reload()} className="ml-2 underline">
          {t('enviarOtra')}
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
      <input type="hidden" name="dni" value={dni} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('motivo')}</label>
        <select
          name="motivoId"
          required
          defaultValue=""
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="" disabled>
            {t('seleccionaMotivo')}
          </option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {nombreLocalizado(m.nombre, m.nombre_en, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-muted">{t('fechaInicio')}</label>
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
          <label className="text-sm font-semibold text-ink-muted">{t('fechaFin')}</label>
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
        <label className="text-sm font-semibold text-ink-muted">{t('justificantes')}</label>
        <input
          type="file"
          name="justificantes"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          required
          onChange={alElegirArchivos}
          className="text-sm"
        />
        <span className="text-xs text-ink-muted">{t('justificantesAyuda')}</span>
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
        <label className="text-sm font-semibold text-ink-muted">{t('comentario')}</label>
        <textarea
          name="comentario"
          rows={3}
          placeholder={t('comentarioPlaceholder')}
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      <EstadoEnvio comprimiendo={comprimiendo} />
    </form>
  );
}
