'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALLOWED_DOC_MIME, MAX_FILE_BYTES, validarArchivo } from '@/lib/validations';
import { subirArchivoDrive } from '@/lib/googleDrive';

import { registrarError, formatFecha, formatFechaCorta, estadoAusenciaLabel } from '@/lib/utils';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
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

  const prefix = `${rider.dni}_${fechaInicio}_${fechaFin}_${Date.now()}`;
  const archivoIds: string[] = [];
  for (let i = 0; i < validos.length; i++) {
    const nombre = `${prefix}_justificante_${i + 1}.${extFromMime(validos[i].type)}`;
    try {
      const buffer = Buffer.from(await validos[i].arrayBuffer());
      const fileId = await subirArchivoDrive('Ausencias', nombre, buffer, validos[i].type);
      archivoIds.push(fileId);
    } catch (e) {
      return { error: registrarError('crearAusenciaAdmin:justificante', e, 'No se pudo subir uno de los justificantes. Inténtalo de nuevo en unos minutos.') };
    }
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
    archivo_ids: archivoIds,
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

export interface FilaExportAusencia {
  creado: string;
  rango: string;
  rider: string;
  dni: string;
  centro: string;
  motivo: string;
  comentario: string | null;
  estado: string;
  motivoRechazo: string | null;
  revisadoPor: string | null;
}

/** Exporta TODAS las ausencias que coinciden con los filtros activos (no solo la página visible). */
export async function exportarAusencias(filtros: {
  estado?: string;
  centro?: string;
  motivo?: string;
  ciudad?: string;
  gestor?: string;
  desde?: string;
  hasta?: string;
  q?: string;
}): Promise<FilaExportAusencia[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const idioma = await resolverIdioma();

  let query = supabase
    .from('ausencias')
    .select('created_at, fecha_inicio, fecha_fin, nombre_rider, dni, comentario, estado, motivo_rechazo, centros(nombre), motivos_ausencia(nombre, nombre_en), admins:revisado_por_id(usuario)')
    .order('created_at', { ascending: false });

  if (filtros.estado) query = query.eq('estado', filtros.estado);
  if (filtros.centro) query = query.eq('centro_id', Number(filtros.centro));
  if (filtros.motivo) query = query.eq('motivo_id', Number(filtros.motivo));
  if (filtros.desde) query = query.gte('fecha_inicio', filtros.desde);
  if (filtros.hasta) query = query.lte('fecha_inicio', filtros.hasta);
  if (filtros.q) {
    const q = filtros.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
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

  return (data ?? []).map((a) => {
    const motivo = a.motivos_ausencia as unknown as { nombre: string; nombre_en: string | null } | null;
    return {
      creado: formatFecha(a.created_at),
      rango: `${formatFechaCorta(a.fecha_inicio)} → ${formatFechaCorta(a.fecha_fin)}`,
      rider: a.nombre_rider,
      dni: a.dni,
      centro: (a.centros as unknown as { nombre: string } | null)?.nombre ?? '—',
      motivo: motivo ? nombreSegunIdioma(idioma, motivo.nombre, motivo.nombre_en) : '—',
      comentario: a.comentario,
      estado: estadoAusenciaLabel(a.estado, idioma),
      motivoRechazo: a.motivo_rechazo,
      revisadoPor: (a.admins as unknown as { usuario: string } | null)?.usuario ?? null,
    };
  });
}
