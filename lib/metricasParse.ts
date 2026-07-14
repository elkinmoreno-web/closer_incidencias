/**
 * Parseo de archivos de métricas (parquet/xlsx/csv) para la subida
 * manual desde el panel de admin. Es una versión portada de la lógica
 * que ya usaba el panel de Vite (src/lib/data.js), simplificada: no se
 * hace vista previa de "qué cambiaría" contra la BD (el original la
 * tenía); aquí se parsea, se filtra a las últimas 2 semanas, se
 * deduplica y se sube directo. Pensado como respaldo manual, ya que la
 * vía principal es la sincronización automática diaria (Edge Function).
 */

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let s = String(value).trim();
  if (s === '') return null;
  if (s.endsWith('%')) s = s.slice(0, -1).trim();
  s = s.replace(/\s|\u00A0/g, '');

  if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  } else if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export const parsePercent = parseNumber;

export function parseInteger(value: unknown): number | null {
  const n = parseNumber(value);
  return n === null ? null : Math.trunc(n);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
export function formatIsoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function addDaysIso(iso: string, days: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  d.setDate(d.getDate() + days);
  return formatIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Parsea una celda de fecha: Date de JS, número serial de Excel, o texto DD/MM/AAAA o AAAA-MM-DD. */
export function parseDayCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return formatIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return null;
  }

  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const d = m[1];
    const mo = m[2];
    let y = m[3];
    if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
    return formatIsoDate(parseInt(y, 10), parseInt(mo, 10), parseInt(d, 10));
  }
  return null;
}

function parseParquetDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'bigint') {
    const ms = Number(value / BigInt(1000));
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return formatIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return parseDayCell(value);
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normalizeHeader(s: unknown): string {
  return stripAccents(String(s ?? ''))
    .toLowerCase()
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeEmail(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00A0]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}
export function normalizePhone(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stripped = String(value).replace(/\.\d*$/, '');
  return stripped.replace(/\D/g, '').slice(-9);
}

const COLUMN_PATTERNS: Record<string, string[]> = {
  day: ['day', 'dia', 'fecha', 'date'],
  city: ['city', 'ciudad'],
  name: ['name', 'nombre', 'driver', 'driver name', 'conductor', 'nombre del conductor', 'employee', 'empleado'],
  courier_uuid: ['courier uuid', 'courrier uuid', 'uuid', 'courier id', 'id del conductor'],
  email: ['email', 'correo', 'e-mail', 'email del conductor'],
  phone: ['phone', 'telefono', 'movil', 'numero'],
  flow_type: ['flow type', 'flowtype', 'tipo', 'tipo de flota', 'vehiculo', 'vehicle'],
  sh: ['sh', 'scheduled hours', 'horas programadas'],
  active_hours: ['active hours', 'active hour', 'horas activas', 'horas conectado', 'horas conectadas', 'connected hours'],
  utilization_rate: ['utilization rate', 'utilization', 'utilizacion', 'tasa de utilizacion', 'utilization%', 'utilization %'],
  tph: ['tph', 'trips per hour', 'viajes/hora', 'viajes por hora', 'trips/hour'],
  tpuh: ['tpuh', 'trips per utilized hour', 'viajes/hora utilizada'],
  pct_accept: ['% accept', 'accept %', 'pct accept', 'accept', 'acceptance', 'aceptacion', '% aceptacion', 'aceptacion %', 'tasa de aceptacion', 'accept rate'],
  pct_cancel: ['% cancel', 'cancel %', 'pct cancel', 'cancel', 'cancellation', 'cancelacion', '% cancelacion', 'cancelacion %', 'tasa de cancelacion', 'cancel rate'],
  total_dispatches: ['total dispatches', 'dispatches', 'envios', 'asignaciones', 'total asignaciones'],
  accepted: ['accepted', 'aceptados', 'aceptadas'],
  completed_trips: ['completed trips', 'completed', 'viajes completados', 'viajes hechos', 'completados'],
  rejected: ['rejected', 'total rejected', 'rechazados', 'rechazadas', 'total rechazados'],
  non_legit_cancel: ['non legit cancel', 'non-legit cancel', 'nonlegit cancel', 'cancelaciones no legitimas', 'cancel no legitima'],
  legit_cancel: ['legit cancel', 'cancelaciones legitimas', 'cancel legitima'],
};

export function buildHeaderMap(headers: string[]): Record<string, string> {
  const normalizedPatterns: Record<string, string[]> = {};
  for (const [field, variants] of Object.entries(COLUMN_PATTERNS)) {
    normalizedPatterns[field] = variants.map(normalizeHeader);
  }
  const map: Record<string, string> = {};
  for (const rawHeader of headers) {
    const norm = normalizeHeader(rawHeader);
    for (const [field, patterns] of Object.entries(normalizedPatterns)) {
      if (map[field]) continue;
      if (patterns.includes(norm)) {
        map[field] = rawHeader;
        break;
      }
    }
  }
  return map;
}

export function detectFileType(headers: string[]): 'daily' | null {
  const map = buildHeaderMap(headers);
  return map.day ? 'daily' : null;
}

const COMMON_FIELDS = ['city', 'name', 'courier_uuid', 'flow_type', 'sh', 'active_hours', 'utilization_rate', 'tph', 'tpuh', 'pct_accept', 'pct_cancel', 'total_dispatches', 'accepted', 'completed_trips', 'rejected'];
const PERCENT_FIELDS = new Set(['utilization_rate', 'pct_accept', 'pct_cancel']);
const INT_FIELDS = new Set(['total_dispatches', 'accepted', 'completed_trips', 'rejected', 'non_legit_cancel', 'legit_cancel']);
const TEXT_FIELDS = new Set(['city', 'name', 'courier_uuid', 'flow_type']);

export interface FilaMetricaParseada {
  day: string;
  email: string;
  phone: string | null;
  city: string | null;
  name: string | null;
  courier_uuid: string | null;
  flow_type: string | null;
  sh: number | null;
  active_hours: number | null;
  utilization_rate: number | null;
  tph: number | null;
  tpuh: number | null;
  pct_accept: number | null;
  pct_cancel: number | null;
  total_dispatches: number | null;
  accepted: number | null;
  completed_trips: number | null;
  rejected: number | null;
  non_legit_cancel: number | null;
  legit_cancel: number | null;
}

function mapCommonFields(rawRow: Record<string, unknown>, headerMap: Record<string, string>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  const get = (f: string) => (headerMap[f] ? rawRow[headerMap[f]] : null);
  for (const f of COMMON_FIELDS) {
    const raw = get(f);
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      out[f] = null;
      continue;
    }
    if (TEXT_FIELDS.has(f)) out[f] = String(raw).trim();
    else if (INT_FIELDS.has(f)) out[f] = parseInteger(raw);
    else if (PERCENT_FIELDS.has(f)) out[f] = parsePercent(raw);
    else out[f] = parseNumber(raw);
  }
  return out;
}

/** Mapea una fila DIARIA de xlsx/csv. Devuelve null si falta la fecha o la identidad. */
export function mapDailyRow(rawRow: Record<string, unknown>, headerMap: Record<string, string>): FilaMetricaParseada | null {
  const get = (f: string) => (headerMap[f] ? rawRow[headerMap[f]] : null);
  const day = parseDayCell(get('day'));
  if (!day) return null;

  const email = normalizeEmail(get('email'));
  const common = mapCommonFields(rawRow, headerMap);
  const uuid = common.courier_uuid as string | null;
  const phone = normalizePhone(get('phone'));
  if (!email && !uuid && !phone) return null;

  return {
    day,
    email,
    phone: phone || null,
    city: common.city as string | null,
    name: common.name as string | null,
    courier_uuid: uuid,
    flow_type: common.flow_type as string | null,
    sh: common.sh as number | null,
    active_hours: common.active_hours as number | null,
    utilization_rate: common.utilization_rate as number | null,
    tph: common.tph as number | null,
    tpuh: common.tpuh as number | null,
    pct_accept: common.pct_accept as number | null,
    pct_cancel: common.pct_cancel as number | null,
    total_dispatches: common.total_dispatches as number | null,
    accepted: common.accepted as number | null,
    completed_trips: common.completed_trips as number | null,
    rejected: common.rejected as number | null,
    non_legit_cancel: parseInteger(get('non_legit_cancel')),
    legit_cancel: parseInteger(get('legit_cancel')),
  };
}

function safeDivLocal(num: number | null, den: number | null): number | null {
  if (num === null || den === null || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

/** Mapea una fila de parquet (esquema rides_silver) a nuestro esquema. */
export function mapParquetRow(raw: Record<string, unknown>): FilaMetricaParseada | null {
  const day = parseParquetDate(raw.datestr);
  if (!day) return null;

  const email = normalizeEmail(raw.driver_email);
  const phone = normalizePhone(raw.driver_number);
  const uuid = raw.driver_uuid ? String(raw.driver_uuid).trim() : null;
  if (!email && !uuid && !phone) return null;

  const num = parseNumber(raw.num_of_trips);
  const accept = parseNumber(raw.accept_trips);
  const reject = parseNumber(raw.reject_trips);
  const cancel = parseNumber(raw.cancel_trips);
  const cancelFair = parseNumber(raw.cancel_not_at_fault_trips);
  const online = parseNumber(raw.online_hours);
  const active = parseNumber(raw.active_hours);
  const offers = (accept ?? 0) + (reject ?? 0);

  const tph = safeDivLocal(num, online);
  const tpuh = safeDivLocal(num, active);
  const utilRatio = safeDivLocal(active, online);
  const utilPct = utilRatio === null ? null : utilRatio * 100;
  const acceptPct = offers > 0 ? ((accept ?? 0) / offers) * 100 : null;
  const cancelPct = accept !== null && accept > 0 && cancel !== null ? (cancel / accept) * 100 : null;
  const legitCancel = cancelFair !== null ? Math.trunc(cancelFair) : null;
  const nonLegitCancel = cancel !== null && cancelFair !== null ? Math.trunc(cancel - cancelFair) : null;

  return {
    day,
    email,
    phone: phone || null,
    courier_uuid: uuid,
    name: raw.driver_name ? String(raw.driver_name).trim() : null,
    city: raw.city_name ? String(raw.city_name).trim() : null,
    flow_type: raw.form_factor ? String(raw.form_factor).trim() : null,
    sh: online,
    active_hours: active,
    utilization_rate: utilPct,
    tph,
    tpuh,
    pct_accept: acceptPct,
    pct_cancel: cancelPct,
    total_dispatches: offers > 0 ? Math.trunc(offers) : null,
    accepted: accept !== null ? Math.trunc(accept) : null,
    completed_trips: num !== null ? Math.trunc(num) : null,
    rejected: reject !== null ? Math.trunc(reject) : null,
    non_legit_cancel: nonLegitCancel,
    legit_cancel: legitCancel,
  };
}

function sumKey(rows: FilaMetricaParseada[], key: keyof FilaMetricaParseada): number {
  let sum = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}
function firstNonEmpty<T extends keyof FilaMetricaParseada>(rows: FilaMetricaParseada[], key: T): FilaMetricaParseada[T] | null {
  for (const r of rows) {
    const v = r[key];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

function mergeGroup(group: FilaMetricaParseada[]): FilaMetricaParseada {
  const sumSh = sumKey(group, 'sh');
  const sumActive = sumKey(group, 'active_hours');
  const sumAccepted = sumKey(group, 'accepted');
  const sumCompleted = sumKey(group, 'completed_trips');
  const sumDispatches = sumKey(group, 'total_dispatches');
  const sumRejected = sumKey(group, 'rejected');
  const sumNonLegit = sumKey(group, 'non_legit_cancel');
  const sumLegit = sumKey(group, 'legit_cancel');

  return {
    day: group[0].day,
    email: firstNonEmpty(group, 'email') || group[0].email,
    phone: firstNonEmpty(group, 'phone'),
    courier_uuid: firstNonEmpty(group, 'courier_uuid'),
    name: firstNonEmpty(group, 'name'),
    city: firstNonEmpty(group, 'city'),
    flow_type: firstNonEmpty(group, 'flow_type'),
    sh: sumSh > 0 ? sumSh : null,
    active_hours: sumActive > 0 ? sumActive : null,
    utilization_rate: safeDivLocal(sumActive, sumSh) === null ? null : (safeDivLocal(sumActive, sumSh) as number) * 100,
    tph: safeDivLocal(sumCompleted, sumSh),
    tpuh: safeDivLocal(sumCompleted, sumActive),
    pct_accept: (() => {
      const vals = group.map((r) => r.pct_accept).filter((v): v is number => typeof v === 'number');
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    })(),
    pct_cancel: (() => {
      const vals = group.map((r) => r.pct_cancel).filter((v): v is number => typeof v === 'number');
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    })(),
    total_dispatches: sumDispatches > 0 ? Math.trunc(sumDispatches) : null,
    accepted: sumAccepted > 0 ? Math.trunc(sumAccepted) : null,
    completed_trips: sumCompleted > 0 ? Math.trunc(sumCompleted) : null,
    rejected: sumRejected > 0 ? Math.trunc(sumRejected) : null,
    non_legit_cancel: sumNonLegit > 0 ? Math.trunc(sumNonLegit) : null,
    legit_cancel: sumLegit > 0 ? Math.trunc(sumLegit) : null,
  };
}

/** Junta varios turnos del mismo rider el mismo día en una sola fila. */
export function dedupeRows(rows: FilaMetricaParseada[]): { rows: FilaMetricaParseada[]; mergedDups: number } {
  const groups = new Map<string, FilaMetricaParseada[]>();
  for (const r of rows) {
    const id = r.courier_uuid || r.phone || r.email;
    if (!id) continue;
    const key = `${id}|${r.day}`;
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  }

  const out: FilaMetricaParseada[] = [];
  let mergedDups = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
    } else {
      const firstStr = JSON.stringify(group[0]);
      const allEqual = group.every((g) => JSON.stringify(g) === firstStr);
      if (allEqual) out.push(group[0]);
      else {
        out.push(mergeGroup(group));
        mergedDups += group.length - 1;
      }
    }
  }
  return { rows: out, mergedDups };
}

export function weekRange(iso: string): { start: string; end: string } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { start: iso, end: iso };
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const dayOfWeek = d.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: formatIsoDate(monday.getFullYear(), monday.getMonth() + 1, monday.getDate()),
    end: formatIsoDate(sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate()),
  };
}
