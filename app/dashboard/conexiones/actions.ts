'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ALLOWED_IMAGE_MIME, MAX_FILE_BYTES, validarArchivo } from '@/lib/validations';
import { subirArchivoDrive } from '@/lib/googleDrive';

import { registrarError } from '@/lib/utils';
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

  // Esta búsqueda usa el cliente de servicio (sin RLS) a propósito: el
  // sentido entero de "fuera de zona" es encontrar a un rider que
  // probablemente esté en una zona distinta a la del admin — con el
  // cliente normal, RLS oculta justo a los riders fuera de tu zona, que
  // son los únicos que tiene sentido buscar aquí.
  const admClient = createAdminClient();
  const { data: rider } = await admClient.from('riders').select('id, nombre, dni, centro_id').eq('dni', riderDni).maybeSingle();
  if (!rider) return { error: 'No se encontró un rider con ese DNI' };
  if (!rider.centro_id) return { error: 'Este rider no tiene centro asignado; asígnaselo primero en Riders' };

  const fecha = String(formData.get('fecha') || '');
  if (!fecha) return { error: 'Indica la fecha' };

  const observaciones = (formData.get('observaciones') as string) || null;

  const screenshot = formData.get('screenshot') as File | null;
  if (!screenshot || screenshot.size === 0) return { error: 'Adjunta la captura de pantalla' };
  const err = validarArchivo(screenshot, ALLOWED_IMAGE_MIME);
  if (err) return { error: err };

  const nombre = `${rider.dni}_conexion_${Date.now()}.${extFromMime(screenshot.type)}`;
  let fileId: string;
  try {
    const buffer = Buffer.from(await screenshot.arrayBuffer());
    fileId = await subirArchivoDrive('Conexiones', nombre, buffer, screenshot.type);
  } catch (e) {
    return { error: registrarError('crearConexionFueraZona:captura', e, 'No se pudo subir la captura. Inténtalo de nuevo en unos minutos.') };
  }

  const { error: insertError } = await supabase.from('conexiones_fuera_zona').insert({
    rider_id: rider.id,
    dni: rider.dni,
    nombre_rider: rider.nombre,
    centro_id: rider.centro_id,
    fecha,
    screenshot_url: fileId,
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

export interface FilaExportConexion {
  fecha: string;
  rider: string;
  dni: string;
  centro: string;
  observaciones: string | null;
}

/**
 * Trae TODAS las conexiones que cumplen los filtros (sin paginar), para
 * exportarlas a Excel. Respeta la zona del admin vía RLS normal.
 */
export async function exportarConexiones(filtros: { centro?: string; ciudad?: string; desde?: string; hasta?: string; q?: string }): Promise<FilaExportConexion[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('conexiones_fuera_zona')
    .select('fecha, nombre_rider, dni, observaciones, centros(nombre)')
    .order('fecha', { ascending: false });

  if (filtros.centro) query = query.eq('centro_id', Number(filtros.centro));
  if (filtros.desde) query = query.gte('fecha', filtros.desde);
  if (filtros.hasta) query = query.lte('fecha', filtros.hasta);
  if (filtros.q) {
    const q = filtros.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
  }
  if (filtros.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(filtros.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const { data } = await query.limit(5000);

  return (data ?? []).map((c) => ({
    fecha: c.fecha,
    rider: c.nombre_rider,
    dni: c.dni,
    centro: (c.centros as unknown as { nombre: string } | null)?.nombre ?? '—',
    observaciones: c.observaciones,
  }));
}
