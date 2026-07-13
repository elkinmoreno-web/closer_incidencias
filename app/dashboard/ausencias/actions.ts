'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALLOWED_DOC_MIME, MAX_FILE_BYTES } from '@/lib/validations';

async function getCurrentAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single();
  if (!admin) throw new Error('Sin acceso');
  return admin.id as string;
}

export async function aprobarAusencia(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const { data: fila, error } = await supabase
    .from('ausencias')
    .update({ estado: 'aprobada', revisado_por_id: adminId, motivo_rechazo: null })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await supabase.from('auditoria').insert({ admin_id: adminId, accion: 'Aprobar ausencia', detalles: `Aprobó la ausencia ${id}`, centro_id: fila?.centro_id ?? null });
  revalidatePath('/dashboard/ausencias');
}

export async function rechazarAusencia(id: string, motivoRechazo: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const { data: fila, error } = await supabase
    .from('ausencias')
    .update({ estado: 'rechazada', revisado_por_id: adminId, motivo_rechazo: motivoRechazo || null })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await supabase.from('auditoria').insert({ admin_id: adminId, accion: 'Rechazar ausencia', detalles: `Rechazó la ausencia ${id}: ${motivoRechazo}`, centro_id: fila?.centro_id ?? null });
  revalidatePath('/dashboard/ausencias');
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

/** Alta directa de una ausencia por un admin (ej. avisada por teléfono). */
export async function crearAusenciaAdmin(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!admin) return { error: 'Sin acceso' };

  const riderDni = String(formData.get('riderDni') || '').trim().toUpperCase();
  if (!riderDni) return { error: 'Selecciona un rider' };

  const { data: rider } = await supabase.from('riders').select('id, nombre, dni, centro_id').eq('dni', riderDni).maybeSingle();
  if (!rider) return { error: 'No se encontró un rider con ese DNI' };

  const motivoId = Number(formData.get('motivoId'));
  if (!motivoId) return { error: 'Selecciona un motivo' };

  const fechaInicio = String(formData.get('fechaInicio') || '');
  const fechaFin = String(formData.get('fechaFin') || '');
  if (!fechaInicio || !fechaFin) return { error: 'Indica el rango de fechas' };
  if (fechaFin < fechaInicio) return { error: 'La fecha de fin no puede ser anterior a la de inicio' };

  const comentario = (formData.get('comentario') as string) || null;

  const files = formData.getAll('justificantes') as File[];
  const validos = files.filter((f) => f && f.size > 0);
  for (const f of validos) {
    const err = validarArchivo(f, ALLOWED_DOC_MIME);
    if (err) return { error: err };
  }

  const prefix = `${user.id}/${fechaInicio}_${fechaFin}_${Date.now()}`;
  for (let i = 0; i < validos.length; i++) {
    const path = `${prefix}/justificante_${i + 1}.${extFromMime(validos[i].type)}`;
    const { error: upErr } = await supabase.storage.from('ausencias').upload(path, validos[i]);
    if (upErr) return { error: 'No se pudo subir uno de los justificantes' };
  }

  const { error: insertError } = await supabase.from('ausencias').insert({
    rider_id: rider.id,
    dni: rider.dni,
    nombre_rider: rider.nombre,
    centro_id: rider.centro_id,
    motivo_id: motivoId,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    comentario,
    storage_prefix: validos.length > 0 ? prefix : null,
    num_archivos: validos.length,
    estado: 'pendiente',
  });

  if (insertError) return { error: insertError.message };

  await supabase.from('auditoria').insert({
    admin_id: admin.id,
    accion: 'Crear',
    detalles: `Registró manualmente una ausencia para ${rider.nombre} (${rider.dni})`,
    centro_id: rider.centro_id,
  });

  revalidatePath('/dashboard/ausencias');
  return { success: true };
}
