'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { obtenerRendimientoSemanal, semanaIsoDe, type DriverPerformance } from '@/lib/fleetManagerApi';

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id, rol, activo').eq('auth_user_id', user.id).single();
  if (!admin || !admin.activo) throw new Error('Sin acceso');
  return { supabase, admin };
}

export interface CentroConId {
  id: number;
  nombre: string;
}

/** Centros consultables del admin actual (mismo patrón de zona que el resto del CRM), solo los que tienen api_centro_id. */
export async function centrosConsultablesMetricas(): Promise<{ centros: CentroConId[]; esSuperAdmin: boolean }> {
  const { supabase, admin } = await assertAdmin();

  if (admin.rol === 'super_admin') {
    const { data } = await supabase.from('centros').select('id, nombre').not('api_centro_id', 'is', null).eq('activo', true).order('nombre');
    return { centros: (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre })), esSuperAdmin: true };
  }

  const { data: misCiudades } = await supabase.from('admin_ciudades').select('ciudad_id').eq('admin_id', admin.id);
  const ciudadIds = (misCiudades ?? []).map((c) => c.ciudad_id);
  if (ciudadIds.length === 0) return { centros: [], esSuperAdmin: false };

  const { data } = await supabase
    .from('centros')
    .select('id, nombre')
    .not('api_centro_id', 'is', null)
    .in('ciudad_id', ciudadIds)
    .eq('activo', true)
    .order('nombre');
  return { centros: (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre })), esSuperAdmin: false };
}

const CACHE_TTL_MINUTOS = 30;

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

export interface FilaMetricaAdmin {
  centro: string;
  dni: string;
  nombre: string;
  telefono: string;
  online_hours: number;
  active_hours: number;
  num_of_trips: number;
  acceptance_rate: number;
  cancelation_rate: number;
  tph: number;
}

/**
 * Trae el rendimiento semanal de los centros indicados. Cachea 30 min
 * por centro+semana (la respuesta de la API puede pesar más de 1 MB por
 * centro) — si ya hay caché fresca, no vuelve a golpear la API para ese
 * centro. Los centros sin caché se piden en paralelo (máx. 5 a la vez).
 */
export async function obtenerMetricasAdmin(
  centroIds: number[],
  year: number,
  week: number,
  forzar = false
): Promise<{ filas: FilaMetricaAdmin[]; errores: string[]; consultados: number }> {
  const { supabase } = await assertAdmin();
  const errores: string[] = [];

  const { data: centros } = await supabase.from('centros').select('id, nombre, api_centro_id').in('id', centroIds);
  const centrosValidos = (centros ?? []).filter((c) => c.api_centro_id);
  if (centrosValidos.length === 0) return { filas: [], errores: [], consultados: 0 };

  const admClient = createAdminClient();

  let cacheValida = new Map<number, DriverPerformance[]>();
  if (!forzar) {
    const limite = new Date(Date.now() - CACHE_TTL_MINUTOS * 60 * 1000).toISOString();
    const { data: cacheRows } = await admClient
      .from('fleet_metrics_cache')
      .select('centro_id, datos')
      .in('centro_id', centrosValidos.map((c) => c.id))
      .eq('year', year)
      .eq('week', week)
      .gte('actualizado_en', limite);
    cacheValida = new Map((cacheRows ?? []).map((r) => [r.centro_id, r.datos as DriverPerformance[]]));
  }

  const centrosAConsultar = centrosValidos.filter((c) => !cacheValida.has(c.id));
  const resultadosPorCentro = new Map<number, DriverPerformance[]>();
  cacheValida.forEach((v, id) => resultadosPorCentro.set(id, v));

  await conConcurrencia(centrosAConsultar, 5, async (centro) => {
    try {
      const drivers = await obtenerRendimientoSemanal(centro.api_centro_id!, year, week);
      resultadosPorCentro.set(centro.id, drivers);
      await admClient
        .from('fleet_metrics_cache')
        .upsert({ centro_id: centro.id, year, week, datos: drivers, actualizado_en: new Date().toISOString() }, { onConflict: 'centro_id,year,week' });
    } catch (e) {
      errores.push(`${centro.nombre}: ${(e as Error).message}`);
    }
  });

  const nombrePorId = new Map(centrosValidos.map((c) => [c.id, c.nombre]));
  const filas: FilaMetricaAdmin[] = [];
  resultadosPorCentro.forEach((drivers, centroId) => {
    drivers.forEach((d) => {
      filas.push({
        centro: nombrePorId.get(centroId) ?? d.center_name,
        dni: d.document_number,
        nombre: d.driver_name,
        telefono: d.driver_number,
        online_hours: d.online_hours,
        active_hours: d.active_hours,
        num_of_trips: d.num_of_trips,
        acceptance_rate: d.acceptance_rate,
        cancelation_rate: d.cancelation_rate,
        tph: d.tph,
      });
    });
  });

  return { filas, errores, consultados: centrosAConsultar.length };
}

export interface RiderEncontrado {
  nombre: string;
  dni: string;
  email: string;
}

/** Busca un rider en el CRM por DNI, nombre o email — para revisar rápido si tiene datos esta semana. */
export async function buscarRiderPorTexto(texto: string): Promise<RiderEncontrado[]> {
  const { supabase } = await assertAdmin();
  const q = texto.trim().replace(/[%,]/g, '');
  if (q.length < 2) return [];

  const { data } = await supabase.from('riders').select('nombre, dni, email').or(`dni.ilike.%${q}%,nombre.ilike.%${q}%,email.ilike.%${q}%`).limit(10);
  return (data ?? []).map((r) => ({ nombre: r.nombre, dni: r.dni, email: r.email }));
}

/** Semana ISO actual (para el selector), y su lunes/domingo en ISO para mostrar el rango. */
export async function semanaActual(): Promise<{ year: number; week: number }> {
  return semanaIsoDe(new Date());
}

/**
 * Exporta el rendimiento semanal de los centros indicados como filas
 * planas, para que el cliente arme un .xlsx. No usa caché (siempre en
 * vivo), ya que exportar es una acción puntual, no de navegación.
 */
export async function exportarMetricas(centroIds: number[], year: number, week: number): Promise<{ filas: FilaMetricaAdmin[]; errores: string[] }> {
  const res = await obtenerMetricasAdmin(centroIds, year, week, true);
  return { filas: res.filas, errores: res.errores };
}

const MAX_DIAS_EXPORTACION = 31;

/**
 * Exporta un rango de fechas libre (desde-hasta), día a día — la API no
 * tiene un endpoint de rango arbitrario, así que se pide el rendimiento
 * DIARIO de cada día del rango, para cada centro, y se suma por rider.
 * Limitado a 31 días para no disparar demasiadas peticiones de golpe.
 */
export async function exportarMetricasRango(
  centroIds: number[],
  fechaDesde: string,
  fechaHasta: string
): Promise<{ filas: FilaMetricaAdmin[]; errores: string[] }> {
  const { supabase } = await assertAdmin();
  const errores: string[] = [];

  const dias: string[] = [];
  const cursor = new Date(fechaDesde + 'T00:00:00Z');
  const fin = new Date(fechaHasta + 'T00:00:00Z');
  while (cursor <= fin && dias.length < MAX_DIAS_EXPORTACION) {
    dias.push(cursor.toISOString().split('T')[0]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (cursor <= fin) errores.push(`El rango es mayor a ${MAX_DIAS_EXPORTACION} días; se exportaron solo los primeros ${MAX_DIAS_EXPORTACION}.`);

  const { data: centros } = await supabase.from('centros').select('id, nombre, api_centro_id').in('id', centroIds);
  const centrosValidos = (centros ?? []).filter((c) => c.api_centro_id);

  const acumulado = new Map<string, FilaMetricaAdmin & { _diasConDatos: number; _sumAccept: number; _sumCancel: number; _sumTph: number }>();

  const { obtenerRendimientoDiario } = await import('@/lib/fleetManagerApi');

  for (const centro of centrosValidos) {
    await conConcurrencia(dias, 5, async (dia) => {
      try {
        const drivers = await obtenerRendimientoDiario(centro.api_centro_id!, dia);
        drivers.forEach((d) => {
          const key = `${centro.id}|${d.document_number}`;
          const actual = acumulado.get(key);
          if (actual) {
            actual.online_hours += d.online_hours;
            actual.active_hours += d.active_hours;
            actual.num_of_trips += d.num_of_trips;
            actual._sumAccept += d.acceptance_rate;
            actual._sumCancel += d.cancelation_rate;
            actual._sumTph += d.tph;
            actual._diasConDatos += 1;
          } else {
            acumulado.set(key, {
              centro: centro.nombre,
              dni: d.document_number,
              nombre: d.driver_name,
              telefono: d.driver_number,
              online_hours: d.online_hours,
              active_hours: d.active_hours,
              num_of_trips: d.num_of_trips,
              acceptance_rate: d.acceptance_rate,
              cancelation_rate: d.cancelation_rate,
              tph: d.tph,
              _diasConDatos: 1,
              _sumAccept: d.acceptance_rate,
              _sumCancel: d.cancelation_rate,
              _sumTph: d.tph,
            });
          }
        });
      } catch (e) {
        errores.push(`${centro.nombre} (${dia}): ${(e as Error).message}`);
      }
    });
  }

  const filas: FilaMetricaAdmin[] = Array.from(acumulado.values()).map((f) => ({
    centro: f.centro,
    dni: f.dni,
    nombre: f.nombre,
    telefono: f.telefono,
    online_hours: Number(f.online_hours.toFixed(2)),
    active_hours: Number(f.active_hours.toFixed(2)),
    num_of_trips: f.num_of_trips,
    acceptance_rate: Number((f._sumAccept / f._diasConDatos).toFixed(4)),
    cancelation_rate: Number((f._sumCancel / f._diasConDatos).toFixed(4)),
    tph: Number((f._sumTph / f._diasConDatos).toFixed(2)),
  }));

  return { filas, errores };
}
