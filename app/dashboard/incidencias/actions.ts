'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALLOWED_IMAGE_MIME, MAX_FILE_BYTES, validarArchivo } from '@/lib/validations';
import { subirArchivoDrive } from '@/lib/googleDrive';

import { registrarError, formatFecha, estadoIncidenciaLabel } from '@/lib/utils';
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
    } catch (e) {
      return { error: registrarError('crearIncidenciaAdmin:captura', e, 'No se pudo subir la captura. Inténtalo de nuevo en unos minutos.') };
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

export interface FilaExportIncidencia {
  fecha: string;
  rider: string;
  dni: string;
  centro: string;
  motivo: string;
  codigoPedido: string | null;
  observaciones: string | null;
  estado: string;
  motivoRechazo: string | null;
  gestor: string | null;
}

/**
 * Exporta TODAS las incidencias que coinciden con los filtros activos
 * (no solo la página visible) — mismo patrón que exportarConexiones.
 * Respeta RLS/zona: usa el cliente normal, así que un admin solo exporta
 * lo que ya podría ver en la lista.
 */
export async function exportarIncidencias(filtros: {
  estado?: string;
  centro?: string;
  motivo?: string;
  ciudad?: string;
  gestor?: string;
  desde?: string;
  hasta?: string;
  q?: string;
}): Promise<FilaExportIncidencia[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('incidencias')
    .select('created_at, nombre_rider, dni, codigo_pedido, observaciones, estado, motivo_rechazo, centros(nombre), motivos(nombre), admins:gestor_id(usuario)')
    .neq('estado', 'papelera')
    .order('created_at', { ascending: false });

  if (filtros.estado) query = query.eq('estado', filtros.estado);
  if (filtros.centro) query = query.eq('centro_id', Number(filtros.centro));
  if (filtros.motivo) query = query.eq('motivo_id', Number(filtros.motivo));
  if (filtros.desde) query = query.gte('created_at', `${filtros.desde}T00:00:00`);
  if (filtros.hasta) query = query.lte('created_at', `${filtros.hasta}T23:59:59`);
  if (filtros.q) {
    const q = filtros.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,codigo_pedido.ilike.%${q}%,dni.ilike.%${q}%,observaciones.ilike.%${q}%`);
  }
  if (filtros.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(filtros.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }
  if (filtros.gestor) {
    const { data: ciudadesDelGestor } = await supabase.from('gestor_ciudades').select('ciudad_id').eq('gestor_id', Number(filtros.gestor));
    const idsCiudad = (ciudadesDelGestor ?? []).map((c) => c.ciudad_id);
    const { data: centrosDelGestor } = await supabase.from('centros').select('id').in('ciudad_id', idsCiudad);
    query = query.in('centro_id', (centrosDelGestor ?? []).map((c) => c.id));
  }

  const { data } = await query.limit(5000);

  return (data ?? []).map((i) => ({
    fecha: formatFecha(i.created_at),
    rider: i.nombre_rider,
    dni: i.dni,
    centro: (i.centros as unknown as { nombre: string } | null)?.nombre ?? '—',
    motivo: (i.motivos as unknown as { nombre: string } | null)?.nombre ?? '—',
    codigoPedido: i.codigo_pedido,
    observaciones: i.observaciones,
    estado: estadoIncidenciaLabel(i.estado),
    motivoRechazo: i.motivo_rechazo,
    gestor: (i.admins as unknown as { usuario: string } | null)?.usuario ?? null,
  }));
}
