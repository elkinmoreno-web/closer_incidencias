'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarIncidencia, type FormActionState } from '@/app/rider/dashboard/actions';
import { compressImageIfNeeded, validarArchivoCliente } from '@/lib/compressImage';
import type { Motivo } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

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
  const [errorScreenshot, setErrorScreenshot] = useState<string | null>(null);
  const [errorEvidencia, setErrorEvidencia] = useState<string | null>(null);
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

  /** Igual que alElegirArchivo, pero para el campo de evidencia (hasta 3 archivos). */
  function alElegirEvidencias(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) {
      setErrorEvidencia(null);
      return;
    }
    if (files.length > 3) {
      setErrorEvidencia('Máximo 3 archivos');
      e.target.value = '';
      return;
    }
    const errores = files.map((f) => validarArchivoCliente(f, TIPOS_IMAGEN)).filter((err): err is string => !!err);
    if (errores.length > 0) {
      setErrorEvidencia(errores[0]);
      e.target.value = '';
      return;
    }
    setErrorEvidencia(null);
  }

  async function handleSubmit(formData: FormData) {
    ultimoFormData.current = formData;
    setComprimiendo(true);
    try {
      const screenshot = formData.get('screenshot') as File | null;
      if (screenshot && screenshot.size > 0) {
        formData.set('screenshot', await compressImageIfNeeded(screenshot));
      }
      const evidencias = formData.getAll('evidencia') as File[];
      formData.delete('evidencia');
      for (const f of evidencias) {
        if (f && f.size > 0) {
          formData.append('evidencia', await compressImageIfNeeded(f));
        }
      }
    } finally {
      setComprimiendo(false);
    }
    await formAction(formData);
  }

  /** El rider confirma que sí quiere crear otra pese al aviso de posible duplicado: reenvía lo mismo, marcado para saltar la comprobación. */
  async function confirmarDuplicado() {
    if (!ultimoFormData.current) return;
    ultimoFormData.current.set('forzarDuplicado', 'true');
    await formAction(ultimoFormData.current);
  }

  if (state?.posibleDuplicado) {
    const { minutos, codigoPedido } = state.posibleDuplicado;
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">¿Ya reportaste esto?</p>
        <p className="mt-1 text-amber-800">
          Reportaste una incidencia con el mismo motivo hace {minutos} minuto(s)
          {codigoPedido ? ` (pedido ${codigoPedido})` : ''}. ¿Seguro que quieres crear otra?
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={confirmarDuplicado}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
          >
            Sí, crear otra
          </button>
          <button onClick={() => window.location.reload()} className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-bg">
            Cancelar
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
            accept="image/jpeg,image/png,image/webp"
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
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={alElegirEvidencias}
          className="text-sm"
        />
        <span className="text-xs text-ink-muted">{t('incidenciaForm.hastaTresImagenes')}</span>
        {errorEvidencia && <p className="text-xs text-danger">{errorEvidencia}</p>}
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
