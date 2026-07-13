import 'server-only';

/**
 * Cliente para la API externa de Closer Logistics (Backoffice, API
 * Platform con paginación Hydra), que antes se llamaba desde Google
 * Apps Script.
 *
 * OJO CON EL RENDIMIENTO: esta API no tiene un endpoint "en bloque" para
 * pedir varios drivers a la vez (/drivers/{uuid} es uno por uno), así
 * que la única palanca real que tenemos aquí es NO pedir en serie lo que
 * se puede pedir en paralelo, y cachear lo que no cambia. Este archivo
 * paraleliza (Promise.all con límite de concurrencia) en vez de usar
 * bucles secuenciales con await uno detrás de otro, que es lo que hacía
 * lento el código anterior. La caché persistente (qué no hace falta
 * volver a pedir) vive en Supabase y la gestionan los actions.ts de cada
 * módulo, no este archivo — aquí solo hay llamadas HTTP puras.
 *
 * OVERTIME_API_USERNAME / OVERTIME_API_PASSWORD deben configurarse en
 * las variables de entorno de Vercel (no van en el código ni en el
 * repositorio).
 */

const API_BASE_URL = 'https://api-backoffice.ondemand.closerlogistics.com';

// Token cacheado en memoria del proceso serverless. Cada instancia de
// función puede tener el suyo; no pasa nada, simplemente se pide de
// nuevo si hace falta. Dura como mucho el tiempo de vida del proceso.
let tokenCache: { token: string; expira: number } | null = null;
const TOKEN_TTL_MS = 45 * 60 * 1000; // 45 min (el token real dura más; renovamos con margen)

async function obtenerToken(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now()) return tokenCache.token;

  const username = process.env.OVERTIME_API_USERNAME;
  const password = process.env.OVERTIME_API_PASSWORD;
  if (!username || !password) {
    throw new Error('Faltan las variables de entorno OVERTIME_API_USERNAME / OVERTIME_API_PASSWORD');
  }

  const resp = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) throw new Error(`No se pudo iniciar sesión en la API externa (HTTP ${resp.status})`);

  const data = await resp.json();
  if (!data.token) throw new Error('La API externa no devolvió token');

  tokenCache = { token: data.token, expira: Date.now() + TOKEN_TTL_MS };
  return data.token;
}

/** Ejecuta tareas async con un límite de concurrencia (no lanza todo a la vez, no va una por una). */
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

interface HorarioSlot {
  overtime?: boolean | string;
  enabled?: boolean | string;
  fromHour?: string;
  toHour?: string;
  workingZone?: string | null;
}

interface EmpleadoApi {
  username?: string;
  firstName?: string;
  lastName?: string;
  uuid?: string;
  id?: string;
  contractHours?: number;
  weeklyWorkMinutes?: number;
  schedules?: HorarioSlot[];
  employeeSchedule?: { schedules?: HorarioSlot[] };
  scheduleEvents?: Array<{ type?: string | { name?: string }; name?: string }>;
}

/** Sigue toda la paginación Hydra ("hydra:view" → "hydra:next") de una URL inicial, en secuencia (una página depende de la anterior). */
async function seguirPaginacionHydra(urlInicial: string, token: string): Promise<EmpleadoApi[]> {
  const resultado: EmpleadoApi[] = [];
  let url: string | null = urlInicial;
  let paginas = 0;
  while (url && paginas < 5) {
    paginas++;
    const resp: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) break;
    const json = await resp.json();
    resultado.push(...((json['hydra:member'] as EmpleadoApi[]) || []));
    const siguiente = json['hydra:view']?.['hydra:next'];
    url = siguiente ? `${API_BASE_URL}${siguiente}` : null;
  }
  return resultado;
}

/**
 * Descarga los horarios de un centro para los 7 días de una semana. Los
 * 7 días se piden EN PARALELO (antes se pedían uno detrás de otro, que
 * es 7x más lento); dentro de cada día, si hay varias páginas, esas sí
 * se siguen en orden porque cada una depende de la anterior.
 */
async function descargarHorariosSemana(apiCentroId: number, fechaLunes: string): Promise<{ empleado: EmpleadoApi; fecha: string; dia: string }[]> {
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const base = new Date(fechaLunes + 'T12:00:00Z');
  const fechas = DIAS.map((nombre, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return { str: d.toISOString().split('T')[0], nombre };
  });

  const token = await obtenerToken();

  const porDia = await Promise.all(
    fechas.map(async (fecha) => {
      const urlInicial = `${API_BASE_URL}/drivers/schedules?itemsPerPage=500&date=${fecha.str}&employee.center=${apiCentroId}`;
      const empleados = await seguirPaginacionHydra(urlInicial, token);
      return empleados.map((empleado) => ({ empleado, fecha: fecha.str, dia: fecha.nombre }));
    })
  );

  return porDia.flat();
}

function minutosSlot(s: HorarioSlot): number {
  if (!s.fromHour || !s.toHour) return 0;
  const [hi, mi] = s.fromHour.split(':').map(Number);
  const [hf, mf] = s.toHour.split(':').map(Number);
  let m = hf * 60 + mf - (hi * 60 + mi);
  if (m < 0) m += 1440;
  return m;
}

export interface RegistroOvertime {
  usuario: string;
  nombre: string;
  apellido: string;
  fecha: string;
  dia: string;
  zona: 'Uber' | 'OnDemand' | 'Mixto';
  horario: string;
  horasUber: number;
  horasOnDemand: number;
  horasTotal: number;
}

/** Descarga y agrega las horas EXTRA de un centro/semana (para el módulo Overtime). */
export async function obtenerOvertimeCentro(apiCentroId: number, fechaLunes: string): Promise<RegistroOvertime[]> {
  const filas = await descargarHorariosSemana(apiCentroId, fechaLunes);
  const resultado: RegistroOvertime[] = [];

  for (const { empleado, fecha, dia } of filas) {
    const usuario = (empleado.username || '').trim();
    if (!usuario) continue;

    const horarios = empleado.schedules || empleado.employeeSchedule?.schedules || [];
    const slots = horarios.filter((s) => {
      const esOvertime = s.overtime === true || s.overtime === 'true';
      const desactivada = s.enabled === false || s.enabled === 'false' || (s.enabled as unknown) === 0;
      return esOvertime && !desactivada && s.fromHour && s.toHour;
    });
    if (slots.length === 0) continue;

    let minUber = 0;
    let minOnDemand = 0;
    slots.forEach((s) => {
      const m = minutosSlot(s);
      if (m <= 0) return;
      const esUber = s.workingZone === null || s.workingZone === undefined || s.workingZone === '';
      if (esUber) minUber += m;
      else minOnDemand += m;
    });
    if (minUber + minOnDemand === 0) continue;

    resultado.push({
      usuario,
      nombre: (empleado.firstName || '').trim(),
      apellido: (empleado.lastName || '').trim(),
      fecha,
      dia,
      zona: minUber > 0 && minOnDemand > 0 ? 'Mixto' : minUber > 0 ? 'Uber' : 'OnDemand',
      horario: slots.map((s) => `${s.fromHour}-${s.toHour}`).join(' / '),
      horasUber: Number((minUber / 60).toFixed(2)),
      horasOnDemand: Number((minOnDemand / 60).toFixed(2)),
      horasTotal: Number(((minUber + minOnDemand) / 60).toFixed(2)),
    });
  }

  return resultado;
}

/** Datos agregados de CH vs WH de un rider para la semana, SIN "calcula horario" todavía (eso se resuelve aparte, con caché). */
export interface AgregadoChVsWh {
  usuario: string;
  nombre: string;
  apellido: string;
  ch: number;
  wh: number;
  balance: number;
  horasExtra: number;
  eventos: string;
  diasIncidencia: number;
  uuidExterno: string | null;
}

/**
 * Descarga y agrega CH vs WH de un centro/semana. NO resuelve "calcula
 * horario" aquí (eso requiere una llamada por rider y tiene su propia
 * caché persistente — ver `obtenerCalculaHorarioBulk` más abajo, usado
 * desde el actions.ts que sí tiene acceso a la base de datos).
 */
export async function obtenerChVsWhCentro(apiCentroId: number, fechaLunes: string): Promise<AgregadoChVsWh[]> {
  const filas = await descargarHorariosSemana(apiCentroId, fechaLunes);

  interface Acumulado {
    nombre: string;
    apellido: string;
    ch: number;
    wh: number;
    uuid: string | null;
    minExtra: number;
    eventos: Set<string>;
    diasConEvento: number;
  }
  const porUsuario = new Map<string, Acumulado>();

  for (const { empleado } of filas) {
    const usuario = (empleado.username || '').trim();
    if (!usuario) continue;

    if (!porUsuario.has(usuario)) {
      porUsuario.set(usuario, {
        nombre: (empleado.firstName || '').trim(),
        apellido: (empleado.lastName || '').trim(),
        ch: empleado.contractHours || 0,
        wh: Number(((empleado.weeklyWorkMinutes || 0) / 60).toFixed(2)),
        uuid: empleado.uuid || empleado.id || null,
        minExtra: 0,
        eventos: new Set(),
        diasConEvento: 0,
      });
    }
    const acc = porUsuario.get(usuario)!;

    const horarios = empleado.schedules || empleado.employeeSchedule?.schedules || [];
    let minExtraDia = 0;
    horarios.forEach((s) => {
      const esExtra = s.overtime === true || s.overtime === 'true';
      const habilitado = s.enabled === true || s.enabled === 'true';
      if (esExtra && habilitado && s.fromHour && s.toHour) minExtraDia += minutosSlot(s);
    });
    acc.minExtra += minExtraDia;

    if (empleado.scheduleEvents && empleado.scheduleEvents.length > 0) {
      const nombresEvento = empleado.scheduleEvents.map((ev) => {
        if (typeof ev.type === 'object') return ev.type?.name || 'Incidencia';
        return ev.type || ev.name || 'Incidencia';
      });
      nombresEvento.forEach((n) => acc.eventos.add(n));
      acc.diasConEvento += 1;
    }
  }

  return Array.from(porUsuario.entries()).map(([usuario, acc]) => ({
    usuario,
    nombre: acc.nombre,
    apellido: acc.apellido,
    ch: acc.ch,
    wh: acc.wh,
    balance: Number((acc.wh - acc.ch).toFixed(2)),
    horasExtra: Number((acc.minExtra / 60).toFixed(2)),
    eventos: Array.from(acc.eventos).join(', '),
    diasIncidencia: acc.diasConEvento,
    uuidExterno: acc.uuid,
  }));
}

/**
 * Pide a la API si cada uno de estos UUIDs "calcula horario". Se piden
 * EN PARALELO (concurrencia limitada a 15 a la vez) porque no hay
 * endpoint en bloque para esto. Úsala SOLO para los UUIDs que no estén
 * ya en la caché persistente (`overtime_drivers_calcula`) — pedirlos
 * todos en cada clic es justo lo que hacía lento el sistema antes.
 */
export async function obtenerCalculaHorarioBulk(uuids: string[]): Promise<Map<string, boolean>> {
  if (uuids.length === 0) return new Map();
  const token = await obtenerToken();
  const resultado = new Map<string, boolean>();

  await conConcurrencia(uuids, 15, async (uuid) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/drivers/${uuid}`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const j = await resp.json();
        resultado.set(uuid, j.calculateSchedule === true);
      } else {
        resultado.set(uuid, false);
      }
    } catch {
      resultado.set(uuid, false);
    }
  });

  return resultado;
}
