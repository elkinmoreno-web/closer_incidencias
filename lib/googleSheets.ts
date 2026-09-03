import { obtenerAccessToken } from '@/lib/googleDrive';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const ID_SHEET_RIDERS = '1FuujbPP7plKGsE5Y8xi4_aN-EHuT644Y3SR-YKpUwHE';
const NOMBRE_PESTANA_RIDERS = 'BBDD';

/**
 * Lee toda la pestaña "BBDD" del Google Sheets de RRHH y la convierte
 * en objetos {encabezado: valor}, listos para pasar directo a
 * mapearFilasExcel() (lib/xlsxImport.ts) — reutiliza el mismo mapeo de
 * columnas y validación que ya usa la importación manual, sin
 * duplicar esa lógica.
 *
 * Usa el mismo token OAuth de Drive/Docs — necesita el scope de
 * Sheets habilitado en Cloud Console (igual que se hizo con Docs API).
 */
export async function leerHojaRidersGoogleSheets(): Promise<Record<string, unknown>[]> {
  const token = await obtenerAccessToken();
  // Rango amplio (columnas A a Z) para no depender de saber cuántas
  // columnas trae exactamente — las columnas de más quedan vacías y
  // mapearFilasExcel() ya ignora cualquier encabezado que no reconozca.
  const resp = await fetch(`${SHEETS_API}/${ID_SHEET_RIDERS}/values/${encodeURIComponent(NOMBRE_PESTANA_RIDERS)}!A:Z`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`No se pudo leer el Google Sheets de riders (HTTP ${resp.status}): ${await resp.text()}`);

  const data = await resp.json();
  const filas: string[][] = data.values ?? [];
  if (filas.length < 2) return []; // sin encabezado o sin filas de datos

  const encabezados = filas[0];
  return filas.slice(1).map((fila) => {
    const obj: Record<string, unknown> = {};
    encabezados.forEach((encabezado, i) => {
      if (encabezado) obj[encabezado] = fila[i] ?? '';
    });
    return obj;
  });
}
