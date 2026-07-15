'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { incidenciaSchema, ausenciaSchema, ALLOWED_IMAGE_MIME, ALLOWED_DOC_MIME, MAX_FILE_BYTES } from '@/lib/validations';
import { subirArchivoDrive } from '@/lib/googleDrive';

export async function riderSignOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/rider/login');
}

async function getCurrentRider() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: rider, error } = await supabase
    .from('riders')
    .select('id, nombre, dni, email, centro_id, activo')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !rider || !rider.activo) throw new Error('Cuenta de rider no válida');
  return { supabase, user, rider };
}

function validarArchivo(file: File | null, allowed: string[]): string | null {
  if (!file || file.size === 0) return null;
  if (!allowed.includes(file.type)) return 'Formato de archivo no permitido';
  if (file.size > MAX_FILE_BYTES) return 'El archivo supera los 10 MB';
  return null;
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
    default: return 'bin';
  }
}

export type FormActionState = { error?: string; success?: boolean } | undefined;

export async function enviarIncidencia(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  try {
    const { supabase, rider } = await getCurrentRider();

    const parsed = incidenciaSchema.safeParse({
      dni: formData.get('dni'),
      motivoId: Number(formData.get('motivoId')),
      codigoPedido: formData.get('codigoPedido') || null,
      observaciones: formData.get('observaciones') || null,
      direccionRecogida: formData.get('direccionRecogida') || null,
      direccionEntrega: formData.get('direccionEntrega') || null,
    });

    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    if (parsed.data.dni !== rider.dni) return { error: 'El DNI no coincide con tu cuenta' };

    const { data: motivo } = await supabase.from('motivos').select('*').eq('id', parsed.data.motivoId).single();
    if (!motivo) return { error: 'Motivo no válido' };

    const screenshot = formData.get('screenshot') as File | null;
    const evidencia = formData.get('evidencia') as File | null;

    if (motivo.requiere_captura) {
      const err = validarArchivo(screenshot, ALLOWED_IMAGE_MIME);
      if (err || !screenshot || screenshot.size === 0) return { error: err ?? 'Este motivo requiere una captura' };
    }
    if (motivo.requiere_observaciones && !parsed.data.observaciones) {
      return { error: 'Este motivo requiere que añadas observaciones' };
    }
    if (motivo.requiere_direcciones && (!parsed.data.direccionRecogida || !parsed.data.direccionEntrega)) {
      return { error: 'Este motivo requiere ambas direcciones' };
    }

    const stamp = Date.now();
    let screenshotFileId: string | null = null;
    let evidenciaFileId: string | null = null;

    if (screenshot && screenshot.size > 0) {
      const err = validarArchivo(screenshot, ALLOWED_IMAGE_MIME);
      if (err) return { error: err };
      const nombre = `${rider.dni}_${stamp}_captura.${extFromMime(screenshot.type)}`;
      try {
        const buffer = Buffer.from(await screenshot.arrayBuffer());
        screenshotFileId = await subirArchivoDrive('Incidencias', nombre, buffer, screenshot.type);
      } catch {
        return { error: 'No se pudo subir la captura. Inténtalo de nuevo.' };
      }
    }
    if (evidencia && evidencia.size > 0) {
      const err = validarArchivo(evidencia, ALLOWED_IMAGE_MIME);
      if (err) return { error: err };
      const nombre = `${rider.dni}_${stamp}_evidencia.${extFromMime(evidencia.type)}`;
      try {
        const buffer = Buffer.from(await evidencia.arrayBuffer());
        evidenciaFileId = await subirArchivoDrive('Incidencias', nombre, buffer, evidencia.type);
      } catch {
        return { error: 'No se pudo subir la evidencia. Inténtalo de nuevo.' };
      }
    }

    const { error: insertError } = await supabase.from('incidencias').insert({
      rider_id: rider.id,
      dni: rider.dni,
      nombre_rider: rider.nombre,
      centro_id: rider.centro_id,
      motivo_id: motivo.id,
      codigo_pedido: parsed.data.codigoPedido,
      observaciones: parsed.data.observaciones,
      direccion_recogida: parsed.data.direccionRecogida,
      direccion_entrega: parsed.data.direccionEntrega,
      screenshot_url: screenshotFileId,
      evidencia_url: evidenciaFileId,
      estado: 'pendiente',
    });

    if (insertError) return { error: 'No se pudo guardar la incidencia. Inténtalo de nuevo.' };

    revalidatePath('/rider/dashboard');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function enviarAusencia(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  try {
    const { supabase, rider } = await getCurrentRider();

    const parsed = ausenciaSchema.safeParse({
      dni: formData.get('dni'),
      motivoId: Number(formData.get('motivoId')),
      fechaInicio: formData.get('fechaInicio'),
      fechaFin: formData.get('fechaFin'),
      comentario: formData.get('comentario') || null,
    });

    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    if (parsed.data.dni !== rider.dni) return { error: 'El DNI no coincide con tu cuenta' };

    const files = formData.getAll('justificantes') as File[];
    const validos = files.filter((f) => f && f.size > 0);
    if (validos.length === 0) return { error: 'Adjunta al menos un justificante' };
    if (validos.length > 10) return { error: 'Máximo 10 archivos' };

    for (const f of validos) {
      const err = validarArchivo(f, ALLOWED_DOC_MIME);
      if (err) return { error: err };
    }

    const nombreBase = `${rider.dni}_${parsed.data.fechaInicio}_${parsed.data.fechaFin}_${Date.now()}`;
    const archivoIds: string[] = [];
    for (let i = 0; i < validos.length; i++) {
      const nombre = `${nombreBase}_justificante_${i + 1}.${extFromMime(validos[i].type)}`;
      try {
        const buffer = Buffer.from(await validos[i].arrayBuffer());
        const fileId = await subirArchivoDrive('Ausencias', nombre, buffer, validos[i].type);
        archivoIds.push(fileId);
      } catch {
        return { error: 'No se pudo subir alguno de los justificantes. Inténtalo de nuevo.' };
      }
    }

    const { error: insertError } = await supabase.from('ausencias').insert({
      rider_id: rider.id,
      dni: rider.dni,
      nombre_rider: rider.nombre,
      centro_id: rider.centro_id,
      motivo_id: parsed.data.motivoId,
      fecha_inicio: parsed.data.fechaInicio,
      fecha_fin: parsed.data.fechaFin,
      comentario: parsed.data.comentario,
      archivo_ids: archivoIds,
      estado: 'pendiente',
    });

    if (insertError) return { error: 'No se pudo guardar la ausencia. Inténtalo de nuevo.' };

    revalidatePath('/rider/dashboard');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ============================================================
// MIS MÉTRICAS — datos operativos (conexión, aceptación, cancelación...)
// ============================================================
// Se piden en vivo a la API de Fleet Manager, filtradas al centro del
// propio rider y buscando su fila por DNI — ya no hace falta emparejar
// por email/teléfono, la API identifica al rider directamente por su
// documento. Se reutiliza la misma caché de 30 min que usa el admin
// (fleet_metrics_cache / fleet_metrics_cache_diario), así que si varios
// riders del mismo centro consultan el mismo día, solo el primero
// golpea la API de verdad.

export interface MisMetricasResumen {
  centro: string | null;
  online_hours: number;
  active_hours: number;
  num_of_trips: number;
  acceptance_rate: number;
  cancelation_rate: number;
  tph: number;
  hayDatos: boolean;
}

export interface MisMetricasDia {
  dia: string; // "Lunes", "Martes"...
  fecha: string; // yyyy-mm-dd
  num_of_trips: number;
  online_hours: number;
  tph: number;
  acceptance_rate: number;
  cancelation_rate: number;
  hayDatos: boolean;
}

const CACHE_TTL_MINUTOS_RIDER = 30;

async function centroDelRider() {
  const { supabase, rider } = await getCurrentRider();
  if (!rider.centro_id) return null;
  const { data: centro } = await supabase.from('centros').select('nombre, api_centro_id').eq('id', rider.centro_id).maybeSingle();
  if (!centro?.api_centro_id) return null;
  return { rider, centroNombre: centro.nombre, apiCentroId: centro.api_centro_id as number };
}

/** Resumen semanal (agregado), igual que ve el admin, pero solo la fila propia del rider. */
export async function obtenerMiResumenSemanal(year: number, week: number, forzar = false): Promise<MisMetricasResumen> {
  const vacio: MisMetricasResumen = { centro: null, online_hours: 0, active_hours: 0, num_of_trips: 0, acceptance_rate: 0, cancelation_rate: 0, tph: 0, hayDatos: false };
  const info = await centroDelRider();
  if (!info) return vacio;

  try {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const { obtenerRendimientoSemanal } = await import('@/lib/fleetManagerApi');
    const admClient = createAdminClient();

    let drivers = null as Awaited<ReturnType<typeof obtenerRendimientoSemanal>> | null;
    if (!forzar) {
      const limite = new Date(Date.now() - CACHE_TTL_MINUTOS_RIDER * 60 * 1000).toISOString();
      const { data: centroFila } = await admClient.from('centros').select('id').eq('nombre', info.centroNombre).maybeSingle();
      if (centroFila) {
        const { data: cacheRow } = await admClient
          .from('fleet_metrics_cache')
          .select('datos')
          .eq('centro_id', centroFila.id)
          .eq('year', year)
          .eq('week', week)
          .gte('actualizado_en', limite)
          .maybeSingle();
        if (cacheRow) drivers = cacheRow.datos as typeof drivers;
      }
    }

    if (!drivers) {
      drivers = await obtenerRendimientoSemanal(info.apiCentroId, year, week);
      const { data: centroFila } = await admClient.from('centros').select('id').eq('nombre', info.centroNombre).maybeSingle();
      if (centroFila) {
        await admClient
          .from('fleet_metrics_cache')
          .upsert({ centro_id: centroFila.id, year, week, datos: drivers, actualizado_en: new Date().toISOString() }, { onConflict: 'centro_id,year,week' });
      }
    }

    const mio = drivers.find((d) => d.document_number.toUpperCase() === info.rider.dni.toUpperCase());
    if (!mio) return { ...vacio, centro: info.centroNombre };

    return {
      centro: info.centroNombre,
      online_hours: mio.online_hours,
      active_hours: mio.active_hours,
      num_of_trips: mio.num_of_trips,
      acceptance_rate: mio.acceptance_rate,
      cancelation_rate: mio.cancelation_rate,
      tph: mio.tph,
      hayDatos: true,
    };
  } catch {
    return { ...vacio, centro: info.centroNombre };
  }
}

/**
 * Día a día de la semana (year, week), SOLO hasta hoy si es la semana
 * en curso (no tiene sentido pedir días futuros). Cada día se cachea
 * por separado (fleet_metrics_cache_diario), igual que en el admin.
 */
export async function obtenerMisDiasSemana(year: number, week: number, forzar = false): Promise<MisMetricasDia[]> {
  const info = await centroDelRider();
  if (!info) return [];

  const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const lunes = new Date(simple);
  lunes.setUTCDate(simple.getUTCDate() - ((dow + 6) % 7));

  const hoyIso = new Date().toISOString().split('T')[0];
  const dias: { dia: string; fecha: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setUTCDate(lunes.getUTCDate() + i);
    const fecha = d.toISOString().split('T')[0];
    if (fecha > hoyIso) break; // no pedir días futuros
    dias.push({ dia: NOMBRES_DIA[i], fecha });
  }
  if (dias.length === 0) return [];

  const { createAdminClient } = await import('@/lib/supabase/server');
  const { obtenerRendimientoDiario } = await import('@/lib/fleetManagerApi');
  const admClient = createAdminClient();
  const { data: centroFila } = await admClient.from('centros').select('id').eq('nombre', info.centroNombre).maybeSingle();

  const resultado: MisMetricasDia[] = [];
  for (const { dia, fecha } of dias) {
    try {
      let drivers = null as Awaited<ReturnType<typeof obtenerRendimientoDiario>> | null;
      if (!forzar && centroFila) {
        const limite = new Date(Date.now() - CACHE_TTL_MINUTOS_RIDER * 60 * 1000).toISOString();
        const { data: cacheRow } = await admClient
          .from('fleet_metrics_cache_diario')
          .select('datos')
          .eq('centro_id', centroFila.id)
          .eq('fecha', fecha)
          .gte('actualizado_en', limite)
          .maybeSingle();
        if (cacheRow) drivers = cacheRow.datos as typeof drivers;
      }
      if (!drivers) {
        drivers = await obtenerRendimientoDiario(info.apiCentroId, fecha);
        if (centroFila) {
          await admClient
            .from('fleet_metrics_cache_diario')
            .upsert({ centro_id: centroFila.id, fecha, datos: drivers, actualizado_en: new Date().toISOString() }, { onConflict: 'centro_id,fecha' });
        }
      }
      const mio = drivers.find((d) => d.document_number.toUpperCase() === info.rider.dni.toUpperCase());
      resultado.push({
        dia,
        fecha,
        num_of_trips: mio?.num_of_trips ?? 0,
        online_hours: mio?.online_hours ?? 0,
        tph: mio?.tph ?? 0,
        acceptance_rate: mio?.acceptance_rate ?? 0,
        cancelation_rate: mio?.cancelation_rate ?? 0,
        hayDatos: !!mio,
      });
    } catch {
      resultado.push({ dia, fecha, num_of_trips: 0, online_hours: 0, tph: 0, acceptance_rate: 0, cancelation_rate: 0, hayDatos: false });
    }
  }

  return resultado;
}
