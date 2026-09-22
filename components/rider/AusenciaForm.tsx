'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarAusencia, type FormActionState } from '@/app/rider/dashboard/actions';
import { compressImageIfNeeded } from '@/lib/compressImage';
import { useArchivosAdjuntos } from '@/components/rider/useArchivosAdjuntos';
import type { MotivoAusencia } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

// HEIC/HEIF: formato por defecto de las fotos de iPhone. Si el navegador
// no sabe convertirlas, se suben tal cual en vez de rechazar la foto.
const TIPOS_JUSTIFICANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/heic', 'image/heif'];

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
        {comprimiendo ? t('ausenciaForm.optimizando') : pending ? t('ausenciaForm.enviando') : t('ausenciaForm.enviar')}
      </button>
      {activo && segundos >= 3 && (
        <p className="text-xs text-ink-muted">
          {t('ausenciaForm.sigueTrabajando')} ({segundos}s)
        </p>
      )}
    </div>
  );
}

export function AusenciaForm({ dni, motivos }: { dni: string; motivos: MotivoAusencia[] }) {
  const { t, idioma } = useIdioma();
  const [state, formAction] = useFormState<FormActionState, FormData>(enviarAusencia, undefined);
  const [fechaInicio, setFechaInicio] = useState('');
  const { archivos, error: errorArchivos, alElegir, quitar } = useArchivosAdjuntos(TIPOS_JUSTIFICANTE, 10);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [errorSinArchivos, setErrorSinArchivos] = useState<string | null>(null);

  /**
   * Valida TODOS los archivos elegidos al instante — antes de comprimir
   * o subir nada. Si alguno no sirve (tipo o tamaño), se rechaza la
   * selección completa y se pide elegir de nuevo, en vez de dejar que
   * un archivo inválido (ej. un video) se suba entero antes de que el
   * servidor pueda rechazarlo.
   */
  async function handleSubmit(formData: FormData) {
    // El input ya no lleva `required` (los archivos viven en el estado,
    // no en él), así que el aviso de "falta adjuntar" lo damos aquí.
    if (archivos.length === 0) {
      setErrorSinArchivos('Adjunta al menos un justificante');
      return;
    }
    setErrorSinArchivos(null);
    setComprimiendo(true);
    try {
      // Los archivos salen del ESTADO, no del input: el input solo
      // guarda la ÚLTIMA selección, y aquí se han ido acumulando.
      formData.delete('justificantes');
      for (const f of archivos) {
        formData.append('justificantes', await compressImageIfNeeded(f));
      }
    } finally {
      setComprimiendo(false);
    }
    await formAction(formData);
  }

  if (state?.success) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
        {t('ausenciaForm.comunicada')}
        <button onClick={() => window.location.reload()} className="ml-2 underline">
          {t('ausenciaForm.enviarOtra')}
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
      <input type="hidden" name="dni" value={dni} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('ausenciaForm.motivo')} *</label>
        <select
          name="motivoId"
          required
          defaultValue=""
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="" disabled>
            {t('ausenciaForm.selecciona')}
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
          <label className="text-sm font-semibold text-ink-muted">{t('ausenciaForm.fechaInicio')} *</label>
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
          <label className="text-sm font-semibold text-ink-muted">{t('ausenciaForm.fechaFin')} *</label>
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
        <label className="text-sm font-semibold text-ink-muted">{t('ausenciaForm.justificantes')} *</label>
        <input
          type="file"
          name="justificantes"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          onChange={alElegir}
          className="text-sm"
        />
        <span className="text-xs text-ink-muted">{t('ausenciaForm.justificantesAyuda')}</span>
        {(errorArchivos || errorSinArchivos) && <p className="text-xs text-danger">{errorArchivos ?? errorSinArchivos}</p>}
        {archivos.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1 text-xs text-ink-muted">
            {archivos.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-2">
                <span className="truncate">· {f.name}</span>
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-danger hover:bg-red-50"
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('ausenciaForm.comentario')}</label>
        <textarea
          name="comentario"
          rows={3}
          placeholder={t('ausenciaForm.comentarioPlaceholder')}
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
