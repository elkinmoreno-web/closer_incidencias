'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALLOWED_IMAGE_MIME, MAX_FILE_BYTES } from '@/lib/validations';

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
    default: return 'bin';
  }
}

export type FormActionState = { error?: string; success?: boolean } | undefined;

export async function crearConexionFueraZona(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
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
  if (!rider.centro_id) return { error: 'Este rider no tiene centro asignado; asígnaselo primero en Riders' };

  const fecha = String(formData.get('fecha') || '');
  if (!fecha) return { error: 'Indica la fecha' };

  const observaciones = (formData.get('observaciones') as string) || null;

  const screenshot = formData.get('screenshot') as File | null;
  if (!screenshot || screenshot.size === 0) return { error: 'Adjunta la captura de pantalla' };
  const err = validarArchivo(screenshot, ALLOWED_IMAGE_MIME);
  if (err) return { error: err };

  const path = `${user.id}/conexion_${Date.now()}.${extFromMime(screenshot.type)}`;
  const { error: upErr } = await supabase.storage.from('conexiones').upload(path, screenshot);
  if (upErr) return { error: 'No se pudo subir la captura' };

  const { error: insertError } = await supabase.from('conexiones_fuera_zona').insert({
    rider_id: rider.id,
    dni: rider.dni,
    nombre_rider: rider.nombre,
    centro_id: rider.centro_id,
    fecha,
    screenshot_url: path,
    observaciones,
    created_by: admin.id,
  });

  if (insertError) return { error: insertError.message };

  await supabase.from('auditoria').insert({
    admin_id: admin.id,
    accion: 'Conexión fuera de zona',
    detalles: `Registró una conexión fuera de zona para ${rider.nombre} (${rider.dni})`,
    centro_id: rider.centro_id,
  });

  revalidatePath('/dashboard/conexiones');
  return { success: true };
}
