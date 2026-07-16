/**
 * Agregación de métricas operativas diarias (driver_daily_stats) en un
 * resumen semanal. Es la misma lógica que ya usaba el panel de Vite
 * (src/lib/data.js: summarizeRows), portada tal cual: horas y conteos
 * se suman, tasas/porcentajes se promedian.
 */

export interface FilaMetricaDiaria {
  day: string;
  city: string | null;
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

export interface ResumenSemanal {
  days: number;
  sh: number;
  active_hours: number;
  utilization_rate: number | null;
  tph: number | null;
  tpuh: number | null;
  pct_accept: number | null;
  pct_cancel: number | null;
  total_dispatches: number;
  accepted: number;
  completed_trips: number;
  rejected: number;
  non_legit_cancel: number;
  legit_cancel: number;
}

export function summarizeRows(rows: FilaMetricaDiaria[]): ResumenSemanal | null {
  if (!rows || rows.length === 0) return null;

  const mean = (key: keyof FilaMetricaDiaria): number | null => {
    const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const sum = (key: keyof FilaMetricaDiaria): number => {
    const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return vals.reduce((a, b) => a + b, 0);
  };

  return {
    days: rows.length,
    sh: sum('sh'),
    active_hours: sum('active_hours'),
    utilization_rate: mean('utilization_rate'),
    tph: mean('tph'),
    tpuh: mean('tpuh'),
    pct_accept: mean('pct_accept'),
    pct_cancel: mean('pct_cancel'),
    total_dispatches: sum('total_dispatches'),
    accepted: sum('accepted'),
    completed_trips: sum('completed_trips'),
    rejected: sum('rejected'),
    non_legit_cancel: sum('non_legit_cancel'),
    legit_cancel: sum('legit_cancel'),
  };
}

/** Lunes (ISO yyyy-mm-dd) de la semana de una fecha dada. */
export function lunesDe(fechaIso: string): string {
  const d = new Date(fechaIso + 'T12:00:00Z');
  const off = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - off);
  return d.toISOString().split('T')[0];
}

export function domingoDe(lunes: string): string {
  const d = new Date(lunes + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}

export function fmtDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Fecha límite para las métricas: los últimos 2 días no se muestran
 * porque los datos de Fleet Manager tardan ese margen en asentarse del
 * todo. Si hoy es jueves 16, el día más reciente visible es el martes 14.
 */
export function fechaLimiteMetricas(): string {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().split('T')[0];
}

/** Número de semana ISO-8601 de una fecha (para pedir el rendimiento semanal a Fleet Manager). */
export function semanaIsoDe(fecha: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}
