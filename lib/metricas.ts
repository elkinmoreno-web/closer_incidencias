/**
 * Agregación de métricas operativas diarias (driver_daily_stats) en un
 * resumen semanal. Es la misma lógica que ya usaba el panel de Vite
 * (src/lib/data.js: summarizeRows), portada tal cual: horas y conteos
 * se suman, tasas/porcentajes se promedian.
 */

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
 * Fecha de hoy en yyyy-mm-dd, según la hora LOCAL (no UTC: a las 00:30 de
 * Madrid, toISOString() todavía devolvería el día anterior).
 */
export function hoyIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Fecha límite para las métricas: los últimos 2 días no se muestran
 * porque los datos tardan ese margen en asentarse del todo (el día D entra
 * parcial durante el propio día D y se completa el D+1).
 *
 * Solo la usa el panel del RIDER. Los paneles de admin (Performance y
 * Alertas) muestran hasta hoy: quien gestiona prefiere ver el dato de hoy
 * aunque venga incompleto a no verlo.
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

/**
 * Semana más antigua que se puede navegar en el selector de métricas:
 * la semana actual (en curso) y, como máximo, la inmediatamente
 * anterior — nunca semanas más viejas que esa. No depende de en qué
 * día de la semana se esté (lunes o viernes da el mismo resultado).
 */
export function semanaIsoMasAntiguaPermitida(): { year: number; week: number } {
  const hoy = new Date();
  const haceUnaSemana = new Date(hoy);
  haceUnaSemana.setDate(hoy.getDate() - 7);
  return semanaIsoDe(haceUnaSemana);
}

/** ¿La semana (year, week) es más vieja que la más antigua permitida? */
export function semanaEsMuyAntigua(year: number, week: number): boolean {
  const limite = semanaIsoMasAntiguaPermitida();
  return year < limite.year || (year === limite.year && week < limite.week);
}
