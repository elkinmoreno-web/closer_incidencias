import * as XLSX from 'xlsx';

export interface RiderExcelRow {
  nombre: string;
  dni: string;
  email: string;
  nacionalidad: string | null;
  genero: string | null;
  centro: string | null;
  empresaContratante: string | null;
  provincia: string | null;
  puesto: string | null;
  fechaAlta: string | null;
  fechaBaja: string | null;
  tipoBaja: string | null;
  motivoBaja: string | null;
  fechaNacimiento: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  vehiculo: string | null;
  horasTrabajo: number | null;
  turno: string | null;
  gestor: string | null;
}

// Cabeceras esperadas del Excel (normalizadas: minúsculas, sin tildes).
const HEADER_MAP: Record<string, string> = {
  empleado: 'nombre',
  dni: 'dni',
  email: 'email',
  nacionalidad: 'nacionalidad',
  genero: 'genero',
  centro: 'centro',
  'empresa contratante': 'empresaContratante',
  provincia: 'provincia',
  puesto: 'puesto',
  'fecha de alta': 'fechaAlta',
  'fecha de baja': 'fechaBaja',
  'tipo de baja': 'tipoBaja',
  'motivo de baja': 'motivoBaja',
  'fecha de nacimiento': 'fechaNacimiento',
  telefono: 'telefono',
  direccion: 'direccion',
  estado: 'estado',
  'tipo de vehiculo': 'vehiculo',
  'horas de trabajo': 'horasTrabajo',
  turno: 'turno',
  gestor: 'gestor',
};

function normKey(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '-' ? null : s;
}

/** Acepta Date (de SheetJS con cellDates), número de serie de Excel, o texto DD/MM/AAAA. */
function fechaOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const utcDays = Math.floor(v - 25569);
    const utcMs = utcDays * 86400 * 1000;
    const d = new Date(utcMs);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return null;
}

/** Lee el primer sheet de un archivo .xlsx y devuelve filas como objetos { cabecera: valor }. */
export async function leerArchivoExcel(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: null });
}

export function mapearFilasExcel(filasCrudas: Record<string, unknown>[]): {
  validas: RiderExcelRow[];
  errores: string[];
} {
  const validas: RiderExcelRow[] = [];
  const errores: string[] = [];

  filasCrudas.forEach((cruda, idx) => {
    const fila: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cruda)) {
      const destino = HEADER_MAP[normKey(k)];
      if (destino) fila[destino] = v;
    }

    const nombre = strOrNull(fila.nombre);
    const dni = strOrNull(fila.dni)?.toUpperCase() ?? null;
    const email = strOrNull(fila.email)?.toLowerCase() ?? null;

    if (!nombre || !dni || !email) {
      errores.push(`Fila ${idx + 2}: falta Empleado, DNI o Email`);
      return;
    }

    const estadoTexto = (strOrNull(fila.estado) ?? '').toLowerCase();

    validas.push({
      nombre,
      dni,
      email,
      nacionalidad: strOrNull(fila.nacionalidad),
      genero: strOrNull(fila.genero),
      centro: strOrNull(fila.centro),
      empresaContratante: strOrNull(fila.empresaContratante),
      provincia: strOrNull(fila.provincia),
      puesto: strOrNull(fila.puesto),
      fechaAlta: fechaOrNull(fila.fechaAlta),
      fechaBaja: fechaOrNull(fila.fechaBaja),
      tipoBaja: strOrNull(fila.tipoBaja),
      motivoBaja: strOrNull(fila.motivoBaja),
      fechaNacimiento: fechaOrNull(fila.fechaNacimiento),
      telefono: strOrNull(fila.telefono),
      direccion: strOrNull(fila.direccion),
      activo: estadoTexto === '' || estadoTexto === 'activo',
      vehiculo: strOrNull(fila.vehiculo),
      horasTrabajo: fila.horasTrabajo ? Number(fila.horasTrabajo) : null,
      turno: strOrNull(fila.turno),
      gestor: strOrNull(fila.gestor),
    });
  });

  return { validas, errores };
}
