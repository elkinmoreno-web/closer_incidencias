'use server';

import { createClient } from '@/lib/supabase/server';
import { obtenerChVsWhCentro, obtenerCalculaHorarioBulk, type AgregadoChVsWh } from '@/lib/overtimeApi';

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

/** Mismo filtro de zona que en Overtime: solo los centros de mis ciudades (o todos si soy super_admin). */
export async function centrosConsultablesChVsWh(): Promise<CentroConId[]> {
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

export interface FilaChVsWh {
  centro: string;
  rider: string;
  usuario: string;
  ch: number;
  wh: number;
  balance: number;
  horasExtra: number;
  calculaHorario: 'Sí' | 'No';
  eventos: string;
  diasIncidencia: number;
  uuidExterno: string | null;
}

const CACHE_TTL_MINUTOS = 30;

/** Ejecuta tareas async con límite de concurrencia (para no golpear varios centros a la vez sin control). */
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
 * Consulta CH vs WH para los centros indicados.
 *
 * Rendimiento (esto es lo importante): por cada centro, primero mira si
 * ya hay un resultado en caché de los últimos 30 minutos (tabla
 * ch_vs_wh_cache) — si lo hay, lo usa directo y NO llama a la API
 * externa para ese centro. Solo golpea la API para los centros sin
 * caché válida (o si `forzar` es true). Los centros que sí hace falta
 * consultar se piden EN PARALELO (no uno detrás de otro). Y "calcula
 * horario" (que requiere una llamada por rider) se resuelve primero
 * contra la caché persistente en base de datos; solo se pide a la API
 * para los riders que de verdad no estén ya guardados.
 */
export async function obtenerChVsWh(
  centroIds: number[],
  fechaLunes: string,
  forzar = false
): Promise<{ filas: FilaChVsWh[]; errores: string[]; desdeCache: number; consultados: number }> {
  const supabase = await assertAdmin();
  const errores: string[] = [];

  const { data: centros } = await supabase.from('centros').select('id, nombre, api_centro_id').in('id', centroIds);
  const centrosValidos = (centros ?? []).filter((c) => c.api_centro_id);
  if (centrosValidos.length === 0) return { filas: [], errores: [], desdeCache: 0, consultados: 0 };

  // 1. Ver qué centros ya tienen caché fresca (si no se fuerza refresco).
  let cacheValida = new Map<number, { datos: AgregadoChVsWh[] }>();
  if (!forzar) {
    const limite = new Date(Date.now() - CACHE_TTL_MINUTOS * 60 * 1000).toISOString();
    const { data: cacheRows } = await supabase
      .from('ch_vs_wh_cache')
      .select('centro_id, datos, actualizado_en')
      .in('centro_id', centrosValidos.map((c) => c.id))
      .eq('fecha_lunes', fechaLunes)
      .gte('actualizado_en', limite);
    cacheValida = new Map((cacheRows ?? []).map((r) => [r.centro_id, { datos: r.datos as AgregadoChVsWh[] }]));
  }

  const centrosAConsultar = centrosValidos.filter((c) => !cacheValida.has(c.id));

  // 2. Consultar a la API SOLO los centros sin caché válida, en paralelo (máx. 5 a la vez).
  const resultadosPorCentro = new Map<number, AgregadoChVsWh[]>();
  cacheValida.forEach((v, id) => resultadosPorCentro.set(id, v.datos));

  await conConcurrencia(centrosAConsultar, 5, async (centro) => {
    try {
      const agregados = await obtenerChVsWhCentro(centro.api_centro_id!, fechaLunes);
      resultadosPorCentro.set(centro.id, agregados);
      // Guardar en caché para la próxima consulta de esta semana.
      await supabase
        .from('ch_vs_wh_cache')
        .upsert({ centro_id: centro.id, fecha_lunes: fechaLunes, datos: agregados, actualizado_en: new Date().toISOString() }, { onConflict: 'centro_id,fecha_lunes' });
    } catch (e) {
      errores.push(`${centro.nombre}: ${(e as Error).message}`);
    }
  });

  // 3. Resolver "calcula horario": primero contra la caché persistente,
  //    y solo pedir a la API los UUIDs que de verdad falten.
  const todosLosAgregados = Array.from(resultadosPorCentro.entries()).flatMap(([centroId, agregados]) =>
    agregados.map((a) => ({ ...a, centroId }))
  );
  const uuidsNecesarios = Array.from(new Set(todosLosAgregados.map((a) => a.uuidExterno).filter((u): u is string => !!u)));

  const { data: enCache } = await supabase.from('overtime_drivers_calcula').select('uuid_externo, calcula_horario').in('uuid_externo', uuidsNecesarios);
  const calculaMap = new Map((enCache ?? []).map((r) => [r.uuid_externo, r.calcula_horario as boolean]));

  const faltantes = uuidsNecesarios.filter((u) => !calculaMap.has(u));
  if (faltantes.length > 0) {
    const nuevos = await obtenerCalculaHorarioBulk(faltantes);
    nuevos.forEach((v, k) => calculaMap.set(k, v));
    const filasGuardar = Array.from(nuevos.entries()).map(([uuid_externo, calcula_horario]) => ({
      uuid_externo,
      calcula_horario,
      actualizado_en: new Date().toISOString(),
    }));
    if (filasGuardar.length > 0) {
      await supabase.from('overtime_drivers_calcula').upsert(filasGuardar, { onConflict: 'uuid_externo' });
    }
  }

  const centroNombrePorId = new Map(centrosValidos.map((c) => [c.id, c.nombre]));
  const filas: FilaChVsWh[] = todosLosAgregados.map((a) => ({
    centro: centroNombrePorId.get(a.centroId) ?? '—',
    rider: `${a.nombre} ${a.apellido}`.trim(),
    usuario: a.usuario,
    ch: a.ch,
    wh: a.wh,
    balance: a.balance,
    horasExtra: a.horasExtra,
    calculaHorario: (a.uuidExterno && calculaMap.get(a.uuidExterno)) ? 'Sí' : 'No',
    eventos: a.eventos,
    diasIncidencia: a.diasIncidencia,
    uuidExterno: a.uuidExterno,
  }));

  return { filas, errores, desdeCache: cacheValida.size, consultados: centrosAConsultar.length };
}

/**
 * Fuerza volver a preguntar a la API si estos riders "calculan horario"
 * (por si el contrato cambió), ignorando la caché. Se usa desde el
 * botón de refresco de la interfaz — no se llama automáticamente nunca,
 * porque este dato casi no cambia.
 */
export async function refrescarCalculaHorario(uuidsExternos: string[]): Promise<Map<string, boolean>> {
  const supabase = await assertAdmin();
  const uuids = uuidsExternos.filter(Boolean);
  if (uuids.length === 0) return new Map();

  const nuevos = await obtenerCalculaHorarioBulk(uuids);
  const filasGuardar = Array.from(nuevos.entries()).map(([uuid_externo, calcula_horario]) => ({
    uuid_externo,
    calcula_horario,
    actualizado_en: new Date().toISOString(),
  }));
  if (filasGuardar.length > 0) {
    await supabase.from('overtime_drivers_calcula').upsert(filasGuardar, { onConflict: 'uuid_externo' });
  }
  return nuevos;
}
