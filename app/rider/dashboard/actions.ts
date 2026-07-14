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
// Se emparejan por email con la sesión real del rider (ya autenticada
// con DNI+contraseña), no con un segundo login por email+teléfono como
// tenía el panel original. RLS en `driver_daily_stats` ya garantiza que
// un rider solo puede leer sus propias filas.

export interface FilaMetricaDiariaRider {
  day: string;
  city: string | null;
  sh: number | null;
  active_hours: number | null;
  utilization_rate: number | null;
  tph: number | null;
  tpuh: number | null;
  pct_accept: number | null;
  pct_cancel: number | null;
  total_dispatches: number | null;
  accepted: number | null;
  completed_trips: number | null;
  rejected: number | null;
  non_legit_cancel: number | null;
  legit_cancel: number | null;
}

export async function obtenerMisMetricasSemana(fechaLunes: string, fechaDomingo: string): Promise<FilaMetricaDiariaRider[]> {
  const { supabase, rider } = await getCurrentRider();
  if (!rider.email) return [];

  const { data } = await supabase
    .from('driver_daily_stats')
    .select('day, city, sh, active_hours, utilization_rate, tph, tpuh, pct_accept, pct_cancel, total_dispatches, accepted, completed_trips, rejected, non_legit_cancel, legit_cancel')
    .ilike('email', rider.email)
    .gte('day', fechaLunes)
    .lte('day', fechaDomingo)
    .order('day');

  return data ?? [];
}

/** Días (fechas ISO) que tienen datos cargados en las últimas ~8 semanas, para saber qué semanas mostrar en el selector. */
export async function obtenerSemanasConDatos(): Promise<string[]> {
  const { supabase, rider } = await getCurrentRider();
  if (!rider.email) return [];

  const desde = new Date();
  desde.setDate(desde.getDate() - 60);

  const { data } = await supabase
    .from('driver_daily_stats')
    .select('day')
    .ilike('email', rider.email)
    .gte('day', desde.toISOString().split('T')[0])
    .order('day');

  return (data ?? []).map((d) => d.day as string);
}
