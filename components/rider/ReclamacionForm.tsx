'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarReclamacion, type FormActionState } from '@/app/rider/dashboard/actions';
import { prepararArchivoParaSubir, ArchivoNoDisponibleError } from '@/lib/compressImage';
import { useArchivosAdjuntos } from '@/components/rider/useArchivosAdjuntos';
import type { MotivoReclamacion } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

// HEIC/HEIF: formato por defecto de las fotos de iPhone. Si el navegador
// no sabe convertirlas, se suben tal cual en vez de rechazar la foto.
const TIPOS_NOMINA = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/heic', 'image/heif'];

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
  const { archivos, error: errorArchivos, alElegir, quitar } = useArchivosAdjuntos(TIPOS_NOMINA, 5);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorSinArchivos, setErrorSinArchivos] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    // El input ya no lleva `required` (los archivos viven en el estado,
    // no en él), así que el aviso de "falta adjuntar" lo damos aquí.
    if (archivos.length === 0) {
      setErrorSinArchivos('Adjunta tu hoja de nómina');
      return;
    }
    setErrorSinArchivos(null);
    setErrorEnvio(null);
    setComprimiendo(true);
    try {
      // Los archivos salen del ESTADO, no del input: el input solo
      // guarda la ÚLTIMA selección, y aquí se han ido acumulando.
      formData.delete('nomina');
      for (const f of archivos) {
        formData.append('nomina', await prepararArchivoParaSubir(f));
      }
    } catch (e) {
      // El teléfono ya no puede entregar los bytes (la foto se movió, la
      // borraron, o la galería la reescribió). Antes esto llegaba al rider
      // como un `Failed to fetch` en blanco y no sabía qué hacer.
      setErrorEnvio(
        e instanceof ArchivoNoDisponibleError
          ? `No se pudo leer «${e.nombre}». Vuelve a seleccionarlo e inténtalo de nuevo.`
          : 'No se pudieron preparar los archivos. Vuelve a seleccionarlos e inténtalo de nuevo.'
      );
      return;
    } finally {
      setComprimiendo(false);
    }

    try {
      await formAction(formData);
    } catch {
      // Corte de cobertura a mitad del envío: muy habitual en un rider en
      // la calle.
      setErrorEnvio('No se pudo enviar. Comprueba tu conexión e inténtalo de nuevo.');
    }
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
          accept="image/*,application/pdf"
          multiple
          onChange={alElegir}
          className="text-sm"
        />
        <span className="text-xs text-ink-muted">{t('reclamacionForm.nominaAyuda')}</span>
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
        <label className="text-sm font-semibold text-ink-muted">{t('reclamacionForm.comentario')}</label>
        <textarea
          name="comentario"
          rows={3}
          placeholder={t('reclamacionForm.comentarioPlaceholder')}
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {state?.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{state.error}</p>}
      {errorEnvio && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-danger">
          {errorEnvio}
        </p>
      )}

      <EstadoEnvio comprimiendo={comprimiendo} />
    </form>
  );
}
