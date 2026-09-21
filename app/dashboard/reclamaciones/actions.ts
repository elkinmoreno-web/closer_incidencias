'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { registrarError, formatFecha } from '@/lib/utils';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import type { EstadoReclamacion } from '@/lib/types';

async function getCurrentAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single();
  if (!admin) throw new Error('Sin acceso');
  return admin.id as string;
}

/** Etiqueta legible del estado, para el texto de auditoría. */
const ETIQUETA_ESTADO: Record<EstadoReclamacion, string> = {
  pendiente: 'Pendiente',
  en_tramite: 'En trámite',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  papelera: 'En papelera',
};

/**
 * Resuelve una reclamación: cambia el estado y deja la respuesta al rider.
 *
 * Aquí la respuesta va SIEMPRE, no solo al rechazar como en ausencias:
 * el rider tiene que poder leer la resolución se apruebe o se deniegue,
 * que es lo que se pidió ("que tenga registro de sus reclamaciones y la
 * respuesta de resolución, bien sea positiva o negativa").
 *
 * 'en_tramite' es el estado intermedio para las que ya están en manos de
 * nóminas y tardan semanas: sin él, el gestor tendría que dejarlas en
 * "pendiente" y no se distinguiría lo que nadie ha mirado de lo que está
 * en curso.
 */
export async function resolverReclamacion(id: string, estado: EstadoReclamacion, respuesta: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const texto = respuesta.trim();
  // Rechazar sin explicar deja al rider sin saber qué hacer después.
  if (estado === 'rechazada' && !texto) throw new Error('Explica al rider por qué se rechaza');

  const { data: fila, error } = await supabase
    .from('reclamaciones')
    .update({
      estado,
      respuesta: texto || null,
      revisado_por_id: adminId,
      fecha_gestion: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);

  await supabase.from('auditoria').insert({
    admin_id: adminId,
    accion: 'Resolver reclamación',
    detalles: `Marcó la reclamación ${id} como ${ETIQUETA_ESTADO[estado]}`,
    centro_id: fila?.centro_id ?? null,
  });

  revalidatePath('/dashboard/reclamaciones');
  revalidatePath('/rider/dashboard');
}

/** Manda una reclamación a la papelera (no se borra: se recupera desde /dashboard/papelera). */
export async function enviarReclamacionAPapelera(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const { data: fila, error } = await supabase
    .from('reclamaciones')
    .update({ estado: 'papelera', eliminado_por_id: adminId, fecha_eliminacion: new Date().toISOString() })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await supabase.from('auditoria').insert({
    admin_id: adminId,
    accion: 'Enviar a papelera',
    detalles: `Movió a papelera la reclamación ${id}`,
    centro_id: fila?.centro_id ?? null,
  });
  revalidatePath('/dashboard/reclamaciones');
  revalidatePath('/dashboard/papelera');
}

/** Devuelve una reclamación de la papelera a "pendiente". */
export async function recuperarReclamacionDePapelera(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const { data: fila, error } = await supabase
    .from('reclamaciones')
    .update({ estado: 'pendiente', eliminado_por_id: null, fecha_eliminacion: null })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await supabase.from('auditoria').insert({
    admin_id: adminId,
    accion: 'Recuperar de papelera',
    detalles: `Recuperó la reclamación ${id}`,
    centro_id: fila?.centro_id ?? null,
  });
  revalidatePath('/dashboard/reclamaciones');
  revalidatePath('/dashboard/papelera');
}

export interface FilaExportReclamacion {
  creada: string;
  periodo: string;
  rider: string;
  dni: string;
  centro: string;
  concepto: string;
  importe: string;
  comentario: string | null;
  estado: string;
  respuesta: string | null;
  resueltaPor: string | null;
}

/** Exporta TODAS las que coinciden con los filtros activos, no solo la página visible. */
export async function exportarReclamaciones(filtros: {
  estado?: string;
  centro?: string;
  motivo?: string;
  ciudad?: string;
  periodo?: string;
  q?: string;
}): Promise<FilaExportReclamacion[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const idioma = await resolverIdioma();

  let query = supabase
    .from('reclamaciones')
    .select('created_at, periodo, nombre_rider, dni, importe, comentario, estado, respuesta, centros(nombre), motivos_reclamacion(nombre, nombre_en), admins:revisado_por_id(usuario)')
    .neq('estado', 'papelera')
    .order('created_at', { ascending: false });

  if (filtros.estado) query = query.eq('estado', filtros.estado);
  if (filtros.centro) query = query.eq('centro_id', Number(filtros.centro));
  if (filtros.motivo) query = query.eq('motivo_id', Number(filtros.motivo));
  if (filtros.periodo) query = query.eq('periodo', `${filtros.periodo}-01`);
  if (filtros.q) {
    const q = filtros.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
  }
  if (filtros.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(filtros.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const { data, error } = await query.limit(5000);
  if (error) {
    registrarError('exportarReclamaciones', error);
    return [];
  }

  return (data ?? []).map((r) => {
    const motivo = r.motivos_reclamacion as unknown as { nombre: string; nombre_en: string | null } | null;
    return {
      creada: formatFecha(r.created_at),
      periodo: String(r.periodo).slice(0, 7),
      rider: r.nombre_rider,
      dni: r.dni,
      centro: (r.centros as unknown as { nombre: string } | null)?.nombre ?? '—',
      concepto: motivo ? nombreSegunIdioma(idioma, motivo.nombre, motivo.nombre_en) : '—',
      // Sin separador de miles y con punto decimal: así Excel lo lee como número.
      importe: r.importe === null || r.importe === undefined ? '' : Number(r.importe).toFixed(2),
      comentario: r.comentario,
      estado: ETIQUETA_ESTADO[r.estado as EstadoReclamacion] ?? r.estado,
      respuesta: r.respuesta,
      resueltaPor: (r.admins as unknown as { usuario: string } | null)?.usuario ?? null,
    };
  });
}
