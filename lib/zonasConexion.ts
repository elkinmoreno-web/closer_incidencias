import { createAdminClient } from '@/lib/supabase/server';
import { buscarArchivoPorNombre, descargarArchivoDrive, archivoExisteYEsAccesible } from '@/lib/googleDrive';
import { normalizarNombreCentro } from '@/lib/utils';

const NOMBRE_ARCHIVO_MAPA = 'CLOSERLOGISTICS_areas.html';
// ID confirmado manualmente por el usuario (el archivo vive en
// "Compartido conmigo", editado por una cuenta de servicio externa —
// no aparecía en la búsqueda por nombre porque esa búsqueda, antes de
// este cambio, no incluía archivos compartidos). Se intenta primero
// por este ID directo — Drive normalmente lo conserva cuando solo se
// edita el CONTENIDO del archivo — y si deja de ser válido, se cae a
// la búsqueda por nombre (ya corregida para incluir compartidos).
// ID de la COPIA automática del mapa vigente HOY (no el original) —
// el archivo real vive en una carpeta compartida a la que la cuenta
// OAuth del CRM no tiene acceso (comparten solo a cuentas
// empresariales, no a la personal usada para el token). Un Apps
// Script en la cuenta personal copia el archivo semanalmente a una
// carpeta que el CRM sí puede leer, usando makeCopy() — lo cual
// genera un ID NUEVO en cada ejecución, así que este valor solo es
// válido hasta la próxima copia. Por eso es solo el primer intento,
// rápido; si deja de ser válido, se cae automáticamente a
// buscarArchivoPorNombre() más abajo, que encuentra la copia vigente
// por su nombre fijo sin depender de este ID.
const FILE_ID_CONOCIDO = '1rmR5Q8O99D5Q2hHSdkKgJwQ-BqpSknie';

export interface ZonaParseada {
  nombre: string; // tal cual el mapa, en mayúsculas (ej. "MADRID ALCORCÓN MÓSTOLES")
  poligonos: [number, number][][]; // uno o más polígonos por zona — confirmado con datos reales que una zona puede tener varias áreas separadas
}

/**
 * Extrae las zonas y sus polígonos del HTML exportado por Folium/
 * Leaflet. Portado literal de la exploración hecha sobre el archivo
 * real: cada polígono aparece como `var polygon_XXX = L.polygon([[lat,
 * lng], ...], {...})`, seguido más adelante (dentro de los siguientes
 * ~3000 caracteres) por `Market Boundary: NOMBRE</div>` con el nombre
 * de la zona a la que pertenece. Folium repite cada polígono varias
 * veces (capas normal/hover/highlight) con coordenadas IDÉNTICAS —
 * se deduplican por (nombre, coordenadas exactas).
 *
 * No usa un parser de HTML genérico (el archivo pesa ~15MB y tiene
 * miles de nodos de mapa; un DOM parser completo sería mucho más
 * lento y no aporta nada que el regex dirigido no cubra ya).
 */
export function parsearMapaZonas(html: string): ZonaParseada[] {
  const patronPoligono = /var (polygon_[a-f0-9]+) = L\.polygon\(\s*(\[\[[\s\S]*?\]\]),/g;
  const vistos = new Set<string>();
  const porNombre = new Map<string, [number, number][][]>();

  let m: RegExpExecArray | null;
  while ((m = patronPoligono.exec(html)) !== null) {
    const coordsStr = m[2];
    const finPoligono = patronPoligono.lastIndex;
    const ventana = html.slice(finPoligono, finPoligono + 3000);
    const nombreMatch = ventana.match(/Market Boundary:\s*([^<]+)<\/div>/) ?? ventana.match(/Market:\s*([^<]+)<\/div>/);
    if (!nombreMatch) continue;
    const nombre = nombreMatch[1].trim();

    let coords: [number, number][];
    try {
      coords = JSON.parse(coordsStr);
    } catch {
      continue; // coordenadas malformadas — se ignora ese polígono puntual, no toda la extracción
    }

    const clave = `${nombre}::${JSON.stringify(coords)}`;
    if (vistos.has(clave)) continue; // descarta las capas duplicadas de Folium (mismo polígono repetido)
    vistos.add(clave);

    const lista = porNombre.get(nombre) ?? [];
    lista.push(coords);
    porNombre.set(nombre, lista);
  }

  return Array.from(porNombre.entries()).map(([nombre, poligonos]) => ({ nombre, poligonos }));
}

export interface ResultadoSincronizacionZonas {
  exito: boolean;
  zonasProcesadas: number;
  zonasSinCentro: string[];
  centrosSinZona: string[];
  error?: string;
}

/**
 * Busca el mapa por nombre en Drive, lo descarga, lo parsea, y
 * actualiza zonas_conexion + la relación centros.zona_conexion_id.
 * Pensado para llamarse desde el cron diario (app/api/cron/
 * zonas-conexion/route.ts) y también manualmente desde el panel.
 *
 * Usa el cliente admin (service role) porque este proceso no corre en
 * el contexto de un admin autenticado — es un cron.
 */
export async function sincronizarZonasConexion(): Promise<ResultadoSincronizacionZonas> {
  const supabase = createAdminClient();

  try {
    let fileId: string | null = (await archivoExisteYEsAccesible(FILE_ID_CONOCIDO)) ? FILE_ID_CONOCIDO : null;
    if (!fileId) fileId = await buscarArchivoPorNombre(NOMBRE_ARCHIVO_MAPA);

    if (!fileId) {
      const resultado: ResultadoSincronizacionZonas = {
        exito: false,
        zonasProcesadas: 0,
        zonasSinCentro: [],
        centrosSinZona: [],
        error: `No se encontró el archivo "${NOMBRE_ARCHIVO_MAPA}" en Drive (ni por el ID conocido ni por búsqueda de nombre). Puede que el token de Google no tenga permiso para ver archivos "Compartido conmigo" — revisar el scope de GOOGLE_DRIVE_REFRESH_TOKEN.`,
      };
      await registrarLog(supabase, resultado);
      return resultado;
    }

    const archivo = await descargarArchivoDrive(fileId);
    if (!archivo) {
      const resultado: ResultadoSincronizacionZonas = {
        exito: false,
        zonasProcesadas: 0,
        zonasSinCentro: [],
        centrosSinZona: [],
        error: 'El archivo se encontró pero no se pudo descargar.',
      };
      await registrarLog(supabase, resultado);
      return resultado;
    }

    const html = archivo.buffer.toString('utf-8');
    const zonas = parsearMapaZonas(html);

    if (zonas.length === 0) {
      const resultado: ResultadoSincronizacionZonas = {
        exito: false,
        zonasProcesadas: 0,
        zonasSinCentro: [],
        centrosSinZona: [],
        error: 'El archivo se descargó pero no se encontró ninguna zona dentro (¿cambió el formato del mapa?).',
      };
      await registrarLog(supabase, resultado);
      return resultado;
    }

    // Upsert de zonas por nombre (única, según el esquema).
    const filasZonas = zonas.map((z) => ({ nombre: z.nombre, poligonos: z.poligonos, actualizado_en: new Date().toISOString() }));
    const { data: zonasGuardadas, error: errorZonas } = await supabase.from('zonas_conexion').upsert(filasZonas, { onConflict: 'nombre' }).select('id, nombre');
    if (errorZonas) throw new Error(errorZonas.message);

    const idPorNombreZona = new Map((zonasGuardadas ?? []).map((z) => [normalizarNombreCentro(z.nombre), z.id]));

    // Relaciona cada centro con su zona por nombre normalizado (sin
    // tildes/mayúsculas/espacios) — mismo criterio defensivo que el
    // resto del sistema: nunca se inventa una relación, se listan las
    // que no coinciden para revisión manual.
    const { data: centros } = await supabase.from('centros').select('id, nombre, ciudades(nombre)');
    const zonasSinCentro: string[] = [];
    const centrosSinZona: string[] = [];
    const actualizaciones: { id: number; zona_conexion_id: number }[] = [];

    for (const centro of centros ?? []) {
      const ciudad = (centro.ciudades as unknown as { nombre: string } | null)?.nombre ?? null;
      const zonaId = buscarZonaDeCentro(centro.nombre, ciudad, idPorNombreZona);
      if (zonaId) actualizaciones.push({ id: centro.id, zona_conexion_id: zonaId });
      else centrosSinZona.push(centro.nombre);
    }

    const nombresZonaUsados = new Set(actualizaciones.map((a) => a.zona_conexion_id));
    for (const z of zonasGuardadas ?? []) {
      if (!nombresZonaUsados.has(z.id)) zonasSinCentro.push(z.nombre);
    }

    for (const act of actualizaciones) {
      await supabase.from('centros').update({ zona_conexion_id: act.zona_conexion_id }).eq('id', act.id);
    }

    const resultado: ResultadoSincronizacionZonas = {
      exito: true,
      zonasProcesadas: zonas.length,
      zonasSinCentro,
      centrosSinZona,
    };
    await registrarLog(supabase, resultado);
    return resultado;
  } catch (e) {
    const resultado: ResultadoSincronizacionZonas = {
      exito: false,
      zonasProcesadas: 0,
      zonasSinCentro: [],
      centrosSinZona: [],
      error: e instanceof Error ? e.message : String(e),
    };
    await registrarLog(supabase, resultado);
    return resultado;
  }
}

/**
 * Prefijos de centros que NO son la ciudad: "MCD Soria" o "FD Cuenca" no
 * tienen por qué estar en la zona de Soria o Cuenca del mapa, así que no
 * se les quita la primera palabra para buscar.
 */
const PREFIJOS_NO_CIUDAD = new Set(['mcd', 'fd', 'nrsur']);

/**
 * Encuentra la zona del mapa que corresponde a un centro.
 *
 * El mapa y el CRM no nombran igual: el CRM antepone la ciudad
 * ("JEREZ ROTA", "MALAGA MARBELLA", "LA CORUNA FERROL") y el mapa no
 * ("ROTA", "MARBELLA", "FERROL"); el centro de la ciudad es "JEREZ
 * CENTRO" en el CRM y "JEREZ" en el mapa, o al revés ("HUELVA" frente a
 * "HUELVA CENTRO"). Solo con el nombre exacto se quedaban 26 centros sin
 * zona, entre ellos los 6 de Jerez.
 *
 * Se prueban variantes de más a menos literal y gana la primera que
 * existe tal cual. Si ninguna existe, se acepta una zona que EMPIECE por
 * la variante ("IBIZA" → "IBIZA EIVISSA"), pero solo si es la única: con
 * dos candidatas no se adivina.
 */
export function buscarZonaDeCentro(
  nombreCentro: string,
  nombreCiudad: string | null,
  idPorNombreZona: Map<string, number>
): number | undefined {
  const centro = normalizarNombreCentro(nombreCentro);
  const ciudad = nombreCiudad ? normalizarNombreCentro(nombreCiudad) : null;

  const bases = [centro];
  // Sin la ciudad delante ("la coruna ferrol" → "ferrol").
  if (ciudad && centro.startsWith(`${ciudad} `)) bases.push(centro.slice(ciudad.length + 1));
  // Sin la primera palabra, para cuando la ciudad del CRM no coincide con
  // el prefijo ("castellon villarreal", ciudad VILLARREAL).
  const [primera, ...resto] = centro.split(' ');
  if (resto.length > 0 && !PREFIJOS_NO_CIUDAD.has(primera)) bases.push(resto.join(' '));

  const variantes: string[] = [];
  for (const b of bases) {
    variantes.push(b);
    if (b.endsWith(' centro')) variantes.push(b.slice(0, -' centro'.length));
    else variantes.push(`${b} centro`);
    if (!b.startsWith('el ')) variantes.push(`el ${b}`);
  }

  for (const v of variantes) {
    const id = idPorNombreZona.get(v);
    if (id !== undefined) return id;
  }

  for (const v of variantes) {
    const candidatas = Array.from(idPorNombreZona.entries()).filter(([nombre]) => nombre.startsWith(`${v} `));
    if (candidatas.length === 1) return candidatas[0][1];
  }
  return undefined;
}

async function registrarLog(supabase: ReturnType<typeof createAdminClient>, r: ResultadoSincronizacionZonas) {
  await supabase.from('zonas_conexion_sync_log').insert({
    exito: r.exito,
    zonas_procesadas: r.zonasProcesadas,
    zonas_sin_centro: r.zonasSinCentro,
    centros_sin_zona: r.centrosSinZona,
    error: r.error ?? null,
  });
}
