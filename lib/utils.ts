import type { EstadoIncidencia, EstadoAusencia } from '@/lib/types';

export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(new Date(iso));
}

export function formatFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(new Date(iso));
}

const ESTADO_INCIDENCIA_LABEL: Record<EstadoIncidencia, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  papelera: 'En papelera',
};

const ESTADO_INCIDENCIA_COLOR: Record<EstadoIncidencia, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-red-100 text-red-800',
  papelera: 'bg-slate-200 text-slate-600',
};

export function estadoIncidenciaLabel(estado: EstadoIncidencia): string {
  return ESTADO_INCIDENCIA_LABEL[estado];
}

export function estadoIncidenciaColor(estado: EstadoIncidencia): string {
  return ESTADO_INCIDENCIA_COLOR[estado];
}

const ESTADO_AUSENCIA_LABEL: Record<EstadoAusencia, string> = {
  pendiente: 'Pendiente de revisar',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  revisada: 'Revisada', // en desuso, se conserva por compatibilidad de tipos
};

const ESTADO_AUSENCIA_COLOR: Record<EstadoAusencia, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-red-100 text-red-800',
  revisada: 'bg-emerald-100 text-emerald-800',
};

export function estadoAusenciaLabel(estado: EstadoAusencia): string {
  return ESTADO_AUSENCIA_LABEL[estado];
}

export function estadoAusenciaColor(estado: EstadoAusencia): string {
  return ESTADO_AUSENCIA_COLOR[estado];
}

/** Normaliza un nombre a "Primera Letra Mayúscula" por palabra, como en el sistema original. */
export function normalizeName(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

/** Inicio del día de hoy en horario de Madrid, en formato ISO (para filtrar consultas). */
export function startOfTodayMadridISO(): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${ymd}T00:00:00`).toISOString();
}

/** ISO de hace N días desde ahora (para rangos tipo "última semana"). */
export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Lunes de esta semana (hora de Madrid), en ISO, para "solo esta semana". */
export function inicioSemanaActualISO(): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const hoy = new Date(`${ymd}T00:00:00`);
  const diaSemana = hoy.getDay() === 0 ? 7 : hoy.getDay(); // 1 = lunes ... 7 = domingo
  hoy.setDate(hoy.getDate() - (diaSemana - 1));
  return hoy.toISOString();
}

/**
 * Contraseña de rider a partir de su nombre: primera letra del nombre
 * en mayúscula + primera letra del apellido en minúscula + "123456".
 * Ej: "Luis Gonzales" -> "Lg123456". Si solo hay una palabra, usa su
 * segunda letra como si fuera el apellido (mejor que un valor fijo).
 */
export function generarPasswordRider(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  const nombre = partes[0] ?? 'x';
  const apellido = partes[1] ?? (nombre[1] ?? 'x');
  const letra1 = (nombre[0] ?? 'x').toUpperCase();
  const letra2 = (apellido[0] ?? 'x').toLowerCase();
  return `${letra1}${letra2}123456`;
}

