'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALLOWED_IMAGE_MIME, MAX_FILE_BYTES } from '@/lib/validations';
import { subirArchivoDrive } from '@/lib/googleDrive';

function validarArchivo(file: File | null, allowed: string[]): string | null {
  if (!file || file.size === 0) return null;
  if (!allowed.includes(file.type)) return 'Formato de archivo no permitido';
  if (file.size > MAX_FILE_BYTES) return 'El archivo supera los 10 MB';
  return null;
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export type FormActionState = { error?: string; success?: boolean } | undefined;

/** Alta directa de una incidencia por un admin (ej. reportada por teléfono). */
export async function crearIncidenciaAdmin(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
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

  const { data: motivo } = await supabase.from('motivos').select('*').eq('id', motivoId).maybeSingle();
  if (!motivo) return { error: 'Motivo no válido' };

  const codigoPedido = (formData.get('codigoPedido') as string) || null;
  const observaciones = (formData.get('observaciones') as string) || null;
  const direccionRecogida = (formData.get('direccionRecogida') as string) || null;
  const direccionEntrega = (formData.get('direccionEntrega') as string) || null;

  if (motivo.requiere_observaciones && !observaciones) {
    return { error: 'Este motivo requiere observaciones' };
  }
  if (motivo.requiere_direcciones && (!direccionRecogida || !direccionEntrega)) {
    return { error: 'Este motivo requiere ambas direcciones' };
  }

  const screenshot = formData.get('screenshot') as File | null;
  let screenshotFileId: string | null = null;
  if (screenshot && screenshot.size > 0) {
    const err = validarArchivo(screenshot, ALLOWED_IMAGE_MIME);
    if (err) return { error: err };
    const nombre = `${rider.dni}_admin_${Date.now()}_captura.${extFromMime(screenshot.type)}`;
    try {
      const buffer = Buffer.from(await screenshot.arrayBuffer());
      screenshotFileId = await subirArchivoDrive('Incidencias', nombre, buffer, screenshot.type);
    } catch {
      return { error: 'No se pudo subir la captura' };
    }
  }

  const { error: insertError } = await supabase.from('incidencias').insert({
    rider_id: rider.id,
    dni: rider.dni,
    nombre_rider: rider.nombre,
    centro_id: rider.centro_id,
    motivo_id: motivo.id,
    codigo_pedido: codigoPedido,
    observaciones,
    direccion_recogida: direccionRecogida,
    direccion_entrega: direccionEntrega,
    screenshot_url: screenshotFileId,
    estado: 'pendiente',
  });

  if (insertError) return { error: insertError.message };

  await supabase.from('auditoria').insert({
    admin_id: admin.id,
    accion: 'Crear',
    detalles: `Registró manualmente una incidencia para ${rider.nombre} (${rider.dni})`,
    centro_id: rider.centro_id,
  });

  revalidatePath('/dashboard/incidencias');
  revalidatePath('/dashboard');
  return { success: true };
}
