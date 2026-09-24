'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarIncidencia, type FormActionState } from '@/app/rider/dashboard/actions';
import { prepararArchivoParaSubir, ArchivoNoDisponibleError, validarArchivoCliente } from '@/lib/compressImage';
import { useArchivosAdjuntos } from '@/components/rider/useArchivosAdjuntos';
import type { Motivo } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

// HEIC/HEIF: formato por defecto de las fotos de iPhone. Si el navegador
// no sabe convertirlas, se suben tal cual en vez de rechazar la foto.
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * Botón de envío + indicador de "sigue trabajando". Necesita estar
 * dentro del <form> para leer `pending` con useFormStatus. Muestra los
 * segundos transcurridos pasados los 3s, para que en conexiones lentas
 * se note que algo se sigue moviendo (y no que la app se congeló).
 */
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
        {comprimiendo ? t('incidenciaForm.optimizando') : pending ? t('incidenciaForm.enviando') : t('incidenciaForm.enviar')}
      </button>
      {activo && segundos >= 3 && (
        <p className="text-xs text-ink-muted">
          {t('incidenciaForm.sigueTrabajando')} ({segundos}s)
        </p>
      )}
    </div>
  );
}

export function IncidenciaForm({ dni, motivos }: { dni: string; motivos: Motivo[] }) {
  const { t, idioma } = useIdioma();
  const [state, formAction] = useFormState<FormActionState, FormData>(enviarIncidencia, undefined);
  const [motivoId, setMotivoId] = useState('');
  const [comprimiendo, setComprimiendo] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorScreenshot, setErrorScreenshot] = useState<string | null>(null);
  // Las evidencias pasan por el mismo hook que Ausencias y Reclamaciones:
  // conserva las válidas cuando una falla y acumula entre selecciones.
  const { archivos: evidencias, error: errorEvidencia, alElegir: alElegirEvidencias, quitar: quitarEvidencia } =
    useArchivosAdjuntos(TIPOS_IMAGEN, 3);
  const ultimoFormData = useRef<FormData | null>(null);

  const motivoSeleccionado = useMemo(() => motivos.find((m) => String(m.id) === motivoId), [motivoId, motivos]);

  /**
   * Valida el archivo AL INSTANTE, en cuanto se elige — antes de
   * comprimir o intentar subir nada. Si no sirve (ej. un video elegido
   * por error), se rechaza aquí mismo y se limpia el campo, sin llegar
   * a tocar la red: así se evita el caso real que pasaba antes, donde
   * un archivo inválido se subía entero (podía tardar minutos en datos
   * móviles) antes de que el servidor pudiera rechazarlo.
   */
  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>, setError: (msg: string | null) => void) {
    const file = e.target.files?.[0];
    if (!file) {
      setError(null);
      return;
    }
    const error = validarArchivoCliente(file, TIPOS_IMAGEN);
    if (error) {
      setError(error);
      e.target.value = '';
      return;
    }
    setError(null);
  }

  async function handleSubmit(formData: FormData) {
    ultimoFormData.current = formData;
    setErrorEnvio(null);
    setComprimiendo(true);
    try {
      const screenshot = formData.get('screenshot') as File | null;
      if (screenshot && screenshot.size > 0) {
        formData.set('screenshot', await prepararArchivoParaSubir(screenshot));
      }
      // Las evidencias salen del ESTADO, no del input: el input solo
      // guarda la ÚLTIMA selección, y en el estado se han ido acumulando.
      formData.delete('evidencia');
      for (const f of evidencias) {
        formData.append('evidencia', await prepararArchivoParaSubir(f));
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

  /** El rider confirma que sí quiere crear otra pese al aviso de posible duplicado: reenvía lo mismo, marcado para saltar la comprobación. */
  async function confirmarDuplicado() {
    if (!ultimoFormData.current) return;
    ultimoFormData.current.set('forzarDuplicado', 'true');
    await formAction(ultimoFormData.current);
  }

  if (state?.posibleDuplicado) {
    const { minutos, codigoPedido, motivoNombre } = state.posibleDuplicado;
    const pedidoSufijo = codigoPedido ? t('incidenciaForm.duplicadoPedidoSufijo').replace('{codigo}', codigoPedido) : '';
    const texto = (motivoNombre ? t('incidenciaForm.duplicadoTextoConMotivo').replace('{motivo}', motivoNombre) : t('incidenciaForm.duplicadoTextoSinMotivo'))
      .replace('{minutos}', String(minutos))
      .replace('{pedido}', pedidoSufijo);
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">{t('incidenciaForm.duplicadoTitulo')}</p>
        <p className="mt-1 text-amber-800">{texto}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={confirmarDuplicado}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
          >
            {t('incidenciaForm.duplicadoConfirmar')}
          </button>
          <button onClick={() => window.location.reload()} className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-bg">
            {t('incidenciaForm.duplicadoCancelar')}
          </button>
        </div>
      </div>
    );
  }

  if (state?.success) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
        {t('incidenciaForm.enviada')}
        <button onClick={() => window.location.reload()} className="ml-2 underline">
          {t('incidenciaForm.enviarOtra')}
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
      <input type="hidden" name="dni" value={dni} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('incidenciaForm.motivo')} *</label>
        <select
          name="motivoId"
          required
          value={motivoId}
          onChange={(e) => setMotivoId(e.target.value)}
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="" disabled>
            {t('incidenciaForm.selecciona')}
          </option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {nombreSegunIdioma(idioma, m.nombre, m.nombre_en)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('incidenciaForm.codigoPedido')}</label>
        <input
          name="codigoPedido"
          placeholder={t('incidenciaForm.codigoPedidoEjemplo')}
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {motivoSeleccionado?.requiere_direcciones && (
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-bg p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-ink-muted">{t('incidenciaForm.direccionRecogida')} *</label>
            <input
              name="direccionRecogida"
              required
              className="rounded-xl border-2 border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-ink-muted">{t('incidenciaForm.direccionEntrega')} *</label>
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
          {t('incidenciaForm.observaciones')} {motivoSeleccionado?.requiere_observaciones && '*'}
        </label>
        <textarea
          name="observaciones"
          rows={3}
          required={motivoSeleccionado?.requiere_observaciones}
          placeholder={t('incidenciaForm.observacionesPlaceholder')}
          className="rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {motivoSeleccionado?.requiere_captura && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-muted">{t('incidenciaForm.captura')} *</label>
          <input
            type="file"
            name="screenshot"
            accept="image/*"
            required
            onChange={(e) => alElegirArchivo(e, setErrorScreenshot)}
            className="text-sm"
          />
          {errorScreenshot && <p className="text-xs text-danger">{errorScreenshot}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">{t('incidenciaForm.evidencia')}</label>
        <input
          type="file"
          name="evidencia"
          accept="image/*"
          multiple
          onChange={alElegirEvidencias}
          className="text-sm"
        />
        <span className="text-xs text-ink-muted">{t('incidenciaForm.hastaTresImagenes')}</span>
        {errorEvidencia && <p className="text-xs text-danger">{errorEvidencia}</p>}
        {evidencias.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1 text-xs text-ink-muted">
            {evidencias.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-2">
                <span className="truncate">· {f.name}</span>
                <button
                  type="button"
                  onClick={() => quitarEvidencia(i)}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-danger hover:bg-red-50"
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {errorEnvio && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-danger">
          {errorEnvio}
        </p>
      )}

      <EstadoEnvio comprimiendo={comprimiendo} />
    </form>
  );
}
