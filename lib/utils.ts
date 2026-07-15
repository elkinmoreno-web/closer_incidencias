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
 * [VERSIÓN CORREGIDA — 15 jul 2026] Genera la contraseña inicial de un
 * rider: inicial del nombre (mayús) + inicial del primer apellido
 * (minús) + "123456".
 *
 * Si ves un comentario distinto a este arriba de esta función, o si el
 * cuerpo usa `partes[1]` directamente como apellido sin más lógica, es
 * la versión VIEJA con el bug — este archivo no se actualizó bien en
 * el repositorio.
 *
 * En español el nombre completo casi siempre trae los DOS apellidos al
 * final: "Erwin Miguel Hernandez Coronado" = Erwin+Miguel (nombres) +
 * Hernandez+Coronado (apellidos). El primer apellido es por tanto la
 * PENÚLTIMA palabra, no la segunda — si tomáramos la segunda palabra a
 * secas, en ese ejemplo cogeríamos "Miguel" (un segundo nombre) en vez
 * de "Hernandez".
 *
 * Casos:
 * - 1 palabra sola (raro): se reutiliza esa misma palabra.
 * - 2 palabras ("Luis Gonzales"): nombre + apellido tal cual.
 * - 3+ palabras: se asume que las últimas 2 son los apellidos, así que
 *   el primer apellido es la penúltima palabra.
 */
export function generarPasswordRider(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  const nombre = partes[0] ?? 'x';

  let apellido: string;
  if (partes.length <= 1) {
    apellido = nombre;
  } else if (partes.length === 2) {
    apellido = partes[1];
  } else {
    apellido = partes[partes.length - 2];
  }

  const letra1 = (nombre[0] ?? 'x').toUpperCase();
  const letra2 = (apellido[0] ?? 'x').toLowerCase();
  return `${letra1}${letra2}123456`;
}