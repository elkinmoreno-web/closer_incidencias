import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Lee las métricas de riders desde `driver_daily_stats` — la misma
 * Supabase de Closer CRM (un pipeline propio en Python sube ahí el
 * resultado ya calculado; aquí solo se LEE, nunca se recalcula nada).
 * Reemplaza a la antigua API de Fleet Manager.
 *
 * El cruce con el DNI/nombre real del rider ya viene resuelto desde el
 * propio SQL (join contra `riders` por email, dentro de get_center_data)
 * — no hace falta una segunda consulta aparte en el código.
 */

/** Fila cruda tal como la deja el pipeline Python, con el DNI/nombre de Closer CRM ya cruzados por el propio SQL. */
export interface DriverDailyStat {
  day: string;
  courier_uuid: string;
  driver_name: string | null;
  driver_number: string | null;
  email: string | null;
  city: string | null;
  num_of_trips: number | null;
  online_hours: number | null;
  active_hours: number | null;
  accept_trips: number | null;
  reject_trips: number | null;
  cancel_trips: number | null;
  cancel_not_at_fault: number | null;
  tph: number | null;
  pct_accept: number | null;
  pct_cancel: number | null;
  rider_dni: string | null;
  rider_nombre: string | null;
}

/** Mismo shape que usaba el resto de la app con Fleet Manager, para minimizar cambios en el código que ya lo consume. */
export interface DriverPerformance {
  email: string;
  dni: string | null;
  driver_name: string;
  driver_number: string;
  center_name: string;
  num_of_trips: number;
  accept_trips: number;
  reject_trips: number;
  cancel_trips: number;
  cancel_not_at_fault_trips: number;
  acceptance_rate: number;
  cancelation_rate: number;
  online_hours: number;
  active_hours: number;
  tph: number;
}

function mapear(d: DriverDailyStat): DriverPerformance {
  return {
    email: (d.email ?? '').trim().toLowerCase(),
    dni: d.rider_dni ?? null,
    driver_name: d.rider_nombre ?? d.driver_name ?? '',
    driver_number: d.driver_number ?? '',
    center_name: d.city ?? '',
    num_of_trips: d.num_of_trips ?? 0,
    accept_trips: d.accept_trips ?? 0,
    reject_trips: d.reject_trips ?? 0,
    cancel_trips: d.cancel_trips ?? 0,
    cancel_not_at_fault_trips: d.cancel_not_at_fault ?? 0,
    acceptance_rate: d.pct_accept ?? 0,
    cancelation_rate: d.pct_cancel ?? 0,
    online_hours: d.online_hours ?? 0,
    active_hours: d.active_hours ?? 0,
    tph: d.tph ?? 0,
  };
}

/** Suma varias filas del mismo rider en el rango (un rider puede tener varios días) en un único acumulado. */
function agregarPorRider(filas: DriverDailyStat[]): DriverPerformance[] {
  const porEmail = new Map<string, DriverDailyStat[]>();
  for (const f of filas) {
    const key = (f.email ?? '').trim().toLowerCase();
    if (!porEmail.has(key)) porEmail.set(key, []);
    porEmail.get(key)!.push(f);
  }

  return Array.from(porEmail.values()).map((filasRider) => {
    const base = mapear(filasRider[0]);
    const suma = filasRider.reduce(
      (acc, f) => ({
        num_of_trips: acc.num_of_trips + (f.num_of_trips ?? 0),
        accept_trips: acc.accept_trips + (f.accept_trips ?? 0),
        reject_trips: acc.reject_trips + (f.reject_trips ?? 0),
        cancel_trips: acc.cancel_trips + (f.cancel_trips ?? 0),
        cancel_not_at_fault_trips: acc.cancel_not_at_fault_trips + (f.cancel_not_at_fault ?? 0),
        online_hours: acc.online_hours + (f.online_hours ?? 0),
        active_hours: acc.active_hours + (f.active_hours ?? 0),
      }),
      { num_of_trips: 0, accept_trips: 0, reject_trips: 0, cancel_trips: 0, cancel_not_at_fault_trips: 0, online_hours: 0, active_hours: 0 }
    );
    return {
      ...base,
      ...suma,
      tph: suma.online_hours > 0 ? suma.num_of_trips / suma.online_hours : 0,
      acceptance_rate: suma.accept_trips + suma.reject_trips > 0 ? suma.accept_trips / (suma.accept_trips + suma.reject_trips) : 0,
      cancelation_rate: suma.accept_trips > 0 ? suma.cancel_trips / suma.accept_trips : 0,
    };
  });
}

/** Rendimiento de UN centro (por su id real en Closer CRM) para un día concreto (yyyy-mm-dd). */
export async function obtenerRendimientoDiario(centroId: number, fechaIso: string): Promise<DriverPerformance[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('get_center_data', { p_centro_id: centroId, p_date_from: fechaIso, p_date_to: fechaIso });
  if (error) throw new Error(`Supabase respondió con error al pedir métricas: ${error.message}`);
  return agregarPorRider((data ?? []) as DriverDailyStat[]);
}

/** Rendimiento de UN centro (por su id real en Closer CRM) agregado para una semana ISO (año + número de semana). */
export async function obtenerRendimientoSemanal(centroId: number, year: number, week: number): Promise<DriverPerformance[]> {
  const supabase = createAdminClient();
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const lunes = new Date(simple);
  lunes.setUTCDate(simple.getUTCDate() - ((dow + 6) % 7));
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const { data, error } = await supabase.rpc('get_center_data', { p_centro_id: centroId, p_date_from: fmt(lunes), p_date_to: fmt(domingo) });
  if (error) throw new Error(`Supabase respondió con error al pedir métricas: ${error.message}`);
  return agregarPorRider((data ?? []) as DriverDailyStat[]);
}
