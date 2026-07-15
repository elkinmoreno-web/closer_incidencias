import 'server-only';
import { semanaIsoDe } from '@/lib/metricas';

export { semanaIsoDe };

/**
 * Cliente para la API de Fleet Manager
 * (fleet-manager.ondemand.closerlogistics.com), que sustituye por
 * completo al pipeline anterior de parquet + Apps Script + Edge
 * Function. Aquí se piden los datos EN VIVO cada vez, sin guardarlos en
 * nuestra base de datos (salvo una caché corta de 30 min, ver más abajo,
 * para no golpear la API en cada clic).
 *
 * Autenticación: login con DNI + contraseña (una cuenta de servicio
 * dedicada, guardada en variables de entorno) que devuelve una cookie
 * de sesión. Las peticiones siguientes son GET normales — no parece
 * necesitar el csrf_token para lectura (eso suele exigirse solo en
 * peticiones que modifican datos, que aquí no hacemos). Si esto
 * resultara no ser así al probarlo en real, el error HTTP lo dirá
 * claramente (401/403) y se ajusta.
 *
 * Variables de entorno necesarias:
 *   FLEET_MANAGER_USERNAME  (DNI de la cuenta de servicio)
 *   FLEET_MANAGER_PASSWORD
 */

const API_BASE_URL = 'https://fleet-manager.ondemand.closerlogistics.com/api';

let cookieCache: { cookie: string; expira: number } | null = null;
const SESION_TTL_MS = 30 * 60 * 1000; // 30 min de margen; se vuelve a loguear si expira

async function obtenerCookieSesion(): Promise<string> {
  if (cookieCache && cookieCache.expira > Date.now()) return cookieCache.cookie;

  const username = process.env.FLEET_MANAGER_USERNAME;
  const password = process.env.FLEET_MANAGER_PASSWORD;
  if (!username || !password) {
    throw new Error('Faltan las variables de entorno FLEET_MANAGER_USERNAME / FLEET_MANAGER_PASSWORD');
  }

  const resp = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) throw new Error(`No se pudo iniciar sesión en Fleet Manager (HTTP ${resp.status})`);

  const data = await resp.json();
  if (!data.ok) throw new Error('Fleet Manager rechazó el login (ok:false)');

  // Node/undici expone todas las Set-Cookie combinadas; nos quedamos con
  // el par nombre=valor de cada una (sin los atributos Path/Expires...).
  const setCookie = resp.headers.get('set-cookie');
  if (!setCookie) throw new Error('Fleet Manager no devolvió cookie de sesión en el login');
  const cookie = setCookie
    .split(/,(?=\s*[^;,\s]+?=)/) // separar varias cookies si vienen juntas
    .map((c) => c.split(';')[0].trim())
    .join('; ');

  cookieCache = { cookie, expira: Date.now() + SESION_TTL_MS };
  return cookie;
}

async function fetchApi<T>(path: string): Promise<T> {
  const cookie = await obtenerCookieSesion();
  const resp = await fetch(`${API_BASE_URL}${path}`, { headers: { Cookie: cookie } });
  if (resp.status === 401 || resp.status === 403) {
    // La sesión pudo caducar antes de tiempo: reintentar una vez con login nuevo.
    cookieCache = null;
    const cookieNueva = await obtenerCookieSesion();
    const reintento = await fetch(`${API_BASE_URL}${path}`, { headers: { Cookie: cookieNueva } });
    if (!reintento.ok) throw new Error(`Fleet Manager respondió ${reintento.status} en ${path}`);
    return reintento.json();
  }
  if (!resp.ok) throw new Error(`Fleet Manager respondió ${resp.status} en ${path}`);
  return resp.json();
}

export interface CentroFleetManager {
  id: number;
  name: string;
  company_name: string;
  enabled: boolean;
}

/** Todos los centros de Fleet Manager (de cualquier empresa en la plataforma). */
export async function obtenerCentrosFleetManager(): Promise<CentroFleetManager[]> {
  return fetchApi<CentroFleetManager[]>('/centers');
}

export interface DriverPerformance {
  document_number: string; // DNI — el identificador que usamos para emparejar con nuestros riders
  driver_name: string;
  driver_number: string; // teléfono
  driver_uuid: string;
  center_id: number;
  center_name: string;
  city_name: string;
  form_factor: string;
  num_of_trips: number;
  accept_trips: number;
  reject_trips: number;
  cancel_trips: number;
  cancel_not_at_fault_trips: number;
  acceptance_rate: number;
  cancelation_rate: number;
  completion_rate: number;
  online_hours: number;
  active_hours: number;
  utilization_rate: number;
  tph: number;
  days_count?: number; // solo viene en el endpoint semanal
}

/** Rendimiento de un centro para UN día concreto (yyyy-mm-dd). */
export async function obtenerRendimientoDiario(centerId: number, fechaIso: string): Promise<DriverPerformance[]> {
  const data = await fetchApi<{ date: string; drivers: DriverPerformance[] }>(`/performance?center_id=${centerId}&date=${fechaIso}`);
  return data.drivers ?? [];
}

/** Rendimiento de un centro agregado para una semana ISO (año + número de semana). */
export async function obtenerRendimientoSemanal(centerId: number, year: number, week: number): Promise<DriverPerformance[]> {
  const data = await fetchApi<{ drivers: DriverPerformance[] }>(`/performance_week?center_id=${centerId}&year=${year}&week=${week}`);
  return data.drivers ?? [];
}
