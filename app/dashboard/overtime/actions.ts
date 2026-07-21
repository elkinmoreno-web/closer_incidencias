'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { obtenerOvertimeCentro } from '@/lib/overtimeApi';

import { registrarError } from '@/lib/utils';
async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id, activo').eq('auth_user_id', user.id).single();
  if (!admin || !admin.activo) throw new Error('Sin acceso');

  return supabase;
}

export interface CentroConId {
  id: number;
  nombre: string;
}

/**
 * Devuelve los centros que el admin/moderador de sesión puede consultar
 * (sus ciudades asignadas, o todos si es super_admin), solo los que
 * tienen `api_centro_id` configurado.
 */
export async function centrosConsultablesOvertime(): Promise<CentroConId[]> {
  const supabase = await assertAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: yo } = await supabase.from('admins').select('id, rol').eq('auth_user_id', user!.id).single();
  const esSuperAdmin = yo?.rol === 'super_admin';

  let query = supabase.from('centros').select('id, nombre, ciudad_id').not('api_centro_id', 'is', null).eq('activo', true);

  if (!esSuperAdmin) {
    const { data: misCiudades } = await supabase.from('admin_ciudades').select('ciudad_id').eq('admin_id', yo!.id);
    const ciudadIds = (misCiudades ?? []).map((c) => c.ciudad_id);
    if (ciudadIds.length === 0) return [];
    query = query.in('ciudad_id', ciudadIds);
  }

  const { data: centros } = await query.order('nombre');
  return (centros ?? []).map((c) => ({ id: c.id, nombre: c.nombre }));
}

export interface FilaOvertime {
  id: number;
  centro: string;
  rider: string;
  usuario: string;
  dia: string;
  fecha: string;
  zona: string;
  horario: string;
  horasUber: number;
  horasOnDemand: number;
  horasTotal: number;
  estado: 'Pendiente' | 'Confirmado' | 'Rechazado';
  auditadoPor: string | null;
  auditadoEn: string | null;
}

const FRESCURA_MINUTOS = 5;

/** Ejecuta tareas async con límite de concurrencia. */
async function conConcurrencia<T, R>(items: T[], limite: number, tarea: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let indice = 0;
  async function trabajador() {
    while (indice < items.length) {
      const i = indice++;
      resultados[i] = await tarea(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}

/**
 * Descarga de la API externa las horas extra de los centros indicados
 * para la semana dada, las guarda/actualiza en la base de datos, y
 * devuelve el estado actual (incluida la auditoría) de TODOS los
 * centros solicitados para esa semana.
 *
 * Rendimiento: si un centro ya tiene datos guardados de hace menos de
 * `FRESCURA_MINUTOS`, NO se vuelve a golpear la API para él (se asume
 * que sigue siendo válido) — salvo que `forzar` sea true. Los centros
 * que sí hay que consultar se piden EN PARALELO, no uno a uno.
 */
export async function actualizarYObtenerOvertime(
  centroIds: number[],
  fechaLunes: string,
  forzar = false
): Promise<{ filas: FilaOvertime[]; errores: string[]; consultados: number }> {
  const supabase = await assertAdmin();
  const errores: string[] = [];

  const { data: centros } = await supabase.from('centros').select('id, nombre, api_centro_id').in('id', centroIds);
  const centrosValidos = (centros ?? []).filter((c) => c.api_centro_id);

  const fechasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(fechaLunes + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().split('T')[0];
  });

  // 1. Ver qué centros ya tienen datos "frescos" guardados (si no se fuerza).
  let centrosAConsultar = centrosValidos;
  if (!forzar && centrosValidos.length > 0) {
    const limite = new Date(Date.now() - FRESCURA_MINUTOS * 60 * 1000).toISOString();
    const { data: recientes } = await supabase
      .from('overtime_registros')
      .select('centro_id')
      .in('centro_id', centrosValidos.map((c) => c.id))
      .in('fecha', fechasSemana)
      .gte('actualizado_en', limite);
    const centrosFrescos = new Set((recientes ?? []).map((r) => r.centro_id));
    centrosAConsultar = centrosValidos.filter((c) => !centrosFrescos.has(c.id));
  }

  // 2. Consultar a la API solo los centros que hagan falta, en paralelo (máx. 5 a la vez).
  await conConcurrencia(centrosAConsultar, 5, async (centro) => {
    try {
      const registros = await obtenerOvertimeCentro(centro.api_centro_id!, fechaLunes);
      if (registros.length === 0) return;

      const filasUpsert = registros.map((r) => ({
        centro_id: centro.id,
        rider_usuario: r.usuario,
        rider_nombre: r.nombre,
        rider_apellido: r.apellido,
        fecha: r.fecha,
        dia_semana: r.dia,
        zona: r.zona,
        horario: r.horario,
        horas_uber: r.horasUber,
        horas_ondemand: r.horasOnDemand,
        horas_total: r.horasTotal,
        actualizado_en: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('overtime_registros')
        .upsert(filasUpsert, { onConflict: 'centro_id,rider_usuario,fecha', ignoreDuplicates: false });
      if (error) errores.push(`${centro.nombre}: ${error.message}`);
    } catch (e) {
      errores.push(`${centro.nombre}: ${registrarError('sync:' + centro.nombre, e, 'No se pudieron obtener los datos de este centro')}`);
    }
  });

  // 3. Leer de vuelta todo lo que hay en BD para esos centros/semana (ya
  //    con la auditoría existente, incluida la de otros usuarios).
  const { data: filas } = await supabase
    .from('overtime_registros')
    .select(
      'id, centro_id, rider_usuario, rider_nombre, rider_apellido, fecha, dia_semana, zona, horario, horas_uber, horas_ondemand, horas_total, estado, auditado_en, admins(usuario), centros(nombre)'
    )
    .in('centro_id', centroIds)
    .in('fecha', fechasSemana)
    .order('fecha');

  const resultado: FilaOvertime[] = (filas ?? []).map((f) => {
    const centroRel = f.centros as unknown as { nombre: string } | null;
    const adminRel = f.admins as unknown as { usuario: string } | null;
    return {
      id: f.id,
      centro: centroRel?.nombre ?? '—',
      rider: `${f.rider_nombre ?? ''} ${f.rider_apellido ?? ''}`.trim(),
      usuario: f.rider_usuario,
      dia: f.dia_semana,
      fecha: f.fecha,
      zona: f.zona,
      horario: f.horario ?? '—',
      horasUber: Number(f.horas_uber),
      horasOnDemand: Number(f.horas_ondemand),
      horasTotal: Number(f.horas_total),
      estado: f.estado as 'Pendiente' | 'Confirmado' | 'Rechazado',
      auditadoPor: adminRel?.usuario ?? null,
      auditadoEn: f.auditado_en,
    };
  });

  return { filas: resultado, errores, consultados: centrosAConsultar.length };
}

/** Cambia el estado de auditoría de un registro. RLS impide tocar registros fuera de la zona del admin. */
export async function auditarOvertime(id: number, estado: 'Pendiente' | 'Confirmado' | 'Rechazado') {
  const supabase = await assertAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('overtime_registros')
    .update({
      estado,
      auditado_por: estado === 'Pendiente' ? null : user!.id,
      auditado_en: estado === 'Pendiente' ? null : new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/overtime');
}
