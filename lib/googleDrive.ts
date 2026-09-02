import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Cliente de Google Drive para los archivos adjuntos (incidencias,
 * ausencias, conexiones fuera de zona). Usa OAuth con Client ID/Secret
 * propios + refresh_token; renueva el access_token directamente cuando
 * hace falta, sin procesos externos.
 *
 * Variables de entorno: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
 * GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID.
 *
 * La carpeta raíz debe estar compartida (Editor) con la cuenta que
 * autorizó el refresh_token.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let tokenCache: { token: string; expira: number } | null = null;

async function obtenerAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now()) return tokenCache.token;

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Faltan variables de entorno de Google Drive (GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN)');
  }

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });

  if (!resp.ok) throw new Error(`No se pudo renovar el token de Google Drive (HTTP ${resp.status}): ${await resp.text()}`);

  const data = await resp.json();
  if (!data.access_token) throw new Error('Google no devolvió un access_token al renovar');

  const expiraEnMs = (data.expires_in ?? 3600) * 1000;
  tokenCache = { token: data.access_token, expira: Date.now() + expiraEnMs - 5 * 60 * 1000 };
  return data.access_token;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function driveFetch(url: string, init: RequestInit = {}, reintentos = 2): Promise<Response> {
  const token = await obtenerAccessToken();
  const resp = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });

  if (resp.status === 403 && reintentos > 0) {
    const cuerpo = await resp.clone().text();
    if (cuerpo.includes('rateLimitExceeded') || cuerpo.includes('userRateLimitExceeded') || cuerpo.includes('Quota exceeded')) {
      await esperar(2000 * (3 - reintentos));
      return driveFetch(url, init, reintentos - 1);
    }
  }

  if (resp.status === 401 && reintentos > 0) {
    tokenCache = null;
    return driveFetch(url, init, reintentos - 1);
  }

  return resp;
}

/** Caché persistente (Supabase) de carpetas ya resueltas, para no repetir la búsqueda en cada subida. */
async function obtenerOCrearCarpeta(nombre: string, padreId: string): Promise<string> {
  const clave = `${padreId}/${nombre}`;
  const admin = createAdminClient();

  const { data: enCache } = await admin.from('google_drive_folder_cache').select('folder_id').eq('clave', clave).maybeSingle();
  if (enCache) return enCache.folder_id;

  // supportsAllDrives/includeItemsFromAllDrives: sin esto, ni la
  // búsqueda ni la creación funcionan cuando la carpeta padre está en
  // "Compartido conmigo" (compartida por otra cuenta) en vez de "Mi
  // unidad" — mismo defecto real ya confirmado y corregido antes en
  // buscarArchivoPorNombre() para el mapa de zonas de conexión.
  const q = `name = '${nombre.replace(/'/g, "\\'")}' and '${padreId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const resp = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`);
  if (!resp.ok) throw new Error(`No se pudo buscar la carpeta "${nombre}" en Drive (HTTP ${resp.status})`);
  const data = await resp.json();

  if (data.files && data.files.length > 0 && data.files[0].id) {
    await admin.from('google_drive_folder_cache').upsert({ clave, folder_id: data.files[0].id }, { onConflict: 'clave' });
    return data.files[0].id;
  }

  const creada = await driveFetch(`${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padreId] }),
  });
  if (!creada.ok) throw new Error(`No se pudo crear la carpeta "${nombre}" en Drive (HTTP ${creada.status})`);
  const creadaData = await creada.json();
  if (!creadaData.id) throw new Error('No se pudo crear la carpeta en Drive');
  await admin.from('google_drive_folder_cache').upsert({ clave, folder_id: creadaData.id }, { onConflict: 'clave' });
  return creadaData.id;
}

async function carpetaDelMes(categoria: 'Incidencias' | 'Ausencias' | 'Conexiones' | 'Fichas'): Promise<string> {
  const raizId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raizId) throw new Error('Falta la variable de entorno GOOGLE_DRIVE_FOLDER_ID');

  const categoriaId = await obtenerOCrearCarpeta(categoria, raizId);
  const ahora = new Date();
  const mesStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  return obtenerOCrearCarpeta(mesStr, categoriaId);
}

/** Sube un archivo a la carpeta del mes actual de la categoría. Devuelve el ID del archivo en Drive. */
export async function subirArchivoDrive(
  categoria: 'Incidencias' | 'Ausencias' | 'Conexiones' | 'Fichas',
  nombreArchivo: string,
  contenido: Buffer,
  mimeType: string
): Promise<string> {
  const carpetaId = await carpetaDelMes(categoria);
  return subirBufferACarpeta(carpetaId, nombreArchivo, contenido, mimeType);
}

/**
 * Carpeta "ZonasConexion" en la raíz, SIN subcarpeta de mes — a
 * diferencia de incidencias/ausencias/conexiones, aquí no se acumulan
 * archivos con el tiempo (una imagen por centro, que se reemplaza de
 * vez en cuando), así que agruparla por mes solo dificultaría
 * encontrarla a mano en Drive si algún día hace falta.
 */
async function carpetaZonasConexion(): Promise<string> {
  const raizId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raizId) throw new Error('Falta la variable de entorno GOOGLE_DRIVE_FOLDER_ID');
  return obtenerOCrearCarpeta('ZonasConexion', raizId);
}

export async function subirImagenZonaConexion(nombreArchivo: string, contenido: Buffer, mimeType: string): Promise<string> {
  const carpetaId = await carpetaZonasConexion();
  return subirBufferACarpeta(carpetaId, nombreArchivo, contenido, mimeType);
}

/**
 * Carpeta de fichas del módulo de Stock — tiene su PROPIA raíz
 * (distinta de GOOGLE_DRIVE_FOLDER_ID que usa Incidencias/Ausencias/
 * Conexiones), confirmada por el usuario, y se organiza por GESTOR
 * (el texto libre de centros.gestor_carpeta, ej. "Marta / Nati"), no
 * por mes.
 *
 * Las 10 carpetas de gestor YA EXISTEN, creadas a mano en Drive, con
 * IDs confirmados directamente por el usuario — se usan esos IDs FIJOS
 * en vez de buscar/crear por nombre. Se intentó primero con búsqueda
 * por nombre (igual que el mapa de zonas), pero seguía dando 404
 * incluso con supportsAllDrives, así que se optó por la vía más
 * confiable: IDs directos, sin ambigüedad.
 *
 * Si el gestor del centro no coincide con ninguno de estos 10 (texto
 * distinto, vacío, o centro sin gestor asignado), se cae a
 * obtenerOCrearCarpeta() con el nombre tal cual, creando/buscando
 * "Sin gestor asignado" (o el nombre que sea) dentro de la raíz — así
 * nunca se pierde un PDF por no encontrar la carpeta exacta.
 */
const IDS_CARPETA_GESTOR: Record<string, string> = {
  vanessa: '12RLmg-Zi1U2kmnFwN_uBNsXGB6DV_Be-',
  'tamara/javier': '1umNUEOR06q8wm-lQuoWISlsfgHwN3WhR',
  'paty/didier': '13m2WKjMYVk-q_RIqpS1ij8vbf8_Ybdz6',
  'marta/nati': '1_YRTKWTlielhXAiNIvX-I9ySCWSaHwVT',
  'hector/ali': '1dZAA0a6Vnwjz2S23Oy-ujw8ZtSkAQ3c1',
  // El dato migrado en centros.gestor_carpeta (viene del CSV original)
  // dice "Hector/Ali Daniel", pero la carpeta real en Drive se llama
  // solo "Hector/Ali" — se mapean ambas variantes al mismo ID, para
  // que el nombre tal cual quedó guardado en la base siga
  // encontrando la carpeta correcta.
  'hector/ali daniel': '1dZAA0a6Vnwjz2S23Oy-ujw8ZtSkAQ3c1',
  'ender/walter': '1wJOQhQtZceMVz4HZTVaT8RwxcPQzWZFR',
  'cristina/glenmar': '19h0q3FD6CMzhhgB2BSDv1vtxIyfVN_4T',
  carlos: '1MHl0sP-IVvp73Pk9WTAmgMI4-5MaZ37x',
  madrid: '1TO7hIDVwcpUG7TxanPxOvZbZptoiNoTf',
  alemania: '1Kofj6yaO-3cxvKhh3aOxFiZTnRfuRh8B',
};

/** Normaliza para comparar contra IDS_CARPETA_GESTOR: minúsculas, sin espacios alrededor de "/", sin espacios de sobra. */
function normalizarClaveGestor(s: string): string {
  return s.trim().toLowerCase().replace(/\s*\/\s*/g, '/');
}

async function carpetaFichaPorGestor(gestorCarpeta: string | null): Promise<string> {
  const raizId = process.env.GOOGLE_DRIVE_FICHAS_FOLDER_ID;
  if (!raizId) throw new Error('Falta la variable de entorno GOOGLE_DRIVE_FICHAS_FOLDER_ID');

  if (gestorCarpeta) {
    const idConocido = IDS_CARPETA_GESTOR[normalizarClaveGestor(gestorCarpeta)];
    if (idConocido) return idConocido;
  }

  // Respaldo: gestor sin ID conocido (nombre nuevo, o centro sin
  // gestor) — se busca/crea por nombre dentro de la raíz, igual que
  // antes, para no perder el archivo.
  const nombreCarpeta = gestorCarpeta?.trim().replace(/\s*\/\s*/g, '/') || 'Sin gestor asignado';
  return obtenerOCrearCarpeta(nombreCarpeta, raizId);
}

export async function subirFichaStock(gestorCarpeta: string | null, nombreArchivo: string, contenido: Buffer, mimeType: string): Promise<string> {
  const carpetaId = await carpetaFichaPorGestor(gestorCarpeta);
  return subirBufferACarpeta(carpetaId, nombreArchivo, contenido, mimeType);
}

async function subirBufferACarpeta(carpetaId: string, nombreArchivo: string, contenido: Buffer, mimeType: string): Promise<string> {

  const boundary = `closer_crm_${Date.now()}`;
  const metadata = JSON.stringify({ name: nombreArchivo, parents: [carpetaId] });
  const cuerpo = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    contenido,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const resp = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: cuerpo,
  });
  if (!resp.ok) throw new Error(`No se pudo subir el archivo a Drive (HTTP ${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  if (!data.id) throw new Error('No se pudo subir el archivo a Drive');
  return data.id;
}

/** Descarga un archivo por su ID. Devuelve null solo si Drive confirma un 404 real. */
export async function descargarArchivoDrive(fileId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const [contenidoResp, metaResp] = await Promise.all([
    driveFetch(`${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`),
    driveFetch(`${DRIVE_API}/files/${fileId}?fields=mimeType&supportsAllDrives=true`),
  ]);

  if (contenidoResp.status === 404 || metaResp.status === 404) return null;

  if (!contenidoResp.ok) throw new Error(`Drive respondió ${contenidoResp.status} al pedir el contenido del archivo: ${await contenidoResp.text()}`);
  if (!metaResp.ok) throw new Error(`Drive respondió ${metaResp.status} al pedir los metadatos del archivo: ${await metaResp.text()}`);

  const [buffer, meta] = await Promise.all([contenidoResp.arrayBuffer(), metaResp.json()]);
  return { buffer: Buffer.from(buffer), mimeType: meta.mimeType ?? 'application/octet-stream' };
}

export async function borrarArchivoDrive(fileId: string): Promise<void> {
  try {
    await driveFetch(`${DRIVE_API}/files/${fileId}?supportsAllDrives=true`, { method: 'DELETE' });
  } catch {
    // No bloquea la operación principal si falla el borrado.
  }
}

/**
 * Busca un archivo por NOMBRE exacto en toda la unidad de Drive
 * (Google Drive: My Drive) accesible con estas credenciales — sin
 * cachear el ID, a propósito: el archivo se re-sube/reescribe
 * periódicamente con un ID nuevo cada vez, así que cachear el ID
 * antiguo rompería la búsqueda la semana siguiente. Se usa para el
 * mapa de zonas de conexión (ver lib/zonasConexion.ts), que se busca
 * por nombre en vez de por ID fijo.
 *
 * Si hay varias coincidencias (ej. una copia vieja sin borrar), toma
 * la de modificación más reciente.
 */
export async function buscarArchivoPorNombre(nombreExacto: string): Promise<string | null> {
  const q = `name = '${nombreExacto.replace(/'/g, "\\'")}' and trashed = false`;
  // includeItemsFromAllDrives + supportsAllDrives: sin esto, la
  // búsqueda por defecto de la API de Drive SOLO mira "Mi unidad" de
  // la cuenta autenticada — un archivo que solo está en "Compartido
  // conmigo" (compartido por otra cuenta, ej. una cuenta de servicio
  // externa) no aparece aunque la cuenta autenticada sí pueda verlo
  // y abrirlo desde el navegador. Confirmado como causa real: el mapa
  // de zonas de conexión es editado por una cuenta de servicio
  // distinta y vive en "Compartido conmigo".
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&spaces=drive&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`;
  const resp = await driveFetch(url);
  if (!resp.ok) throw new Error(`No se pudo buscar el archivo "${nombreExacto}" en Drive (HTTP ${resp.status})`);
  const data = await resp.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Confirma que un fileId concreto sigue siendo válido y accesible —
 * usado como intento rápido antes de recurrir a buscarArchivoPorNombre,
 * porque Drive normalmente CONSERVA el ID de un archivo cuando solo se
 * edita su contenido (solo cambia si se borra y se vuelve a subir).
 * Devuelve null si el archivo no existe o no es accesible con estas
 * credenciales (404/403), sin lanzar error — es una comprobación, no
 * una operación que deba interrumpir el flujo si falla.
 */
export async function archivoExisteYEsAccesible(fileId: string): Promise<boolean> {
  try {
    const resp = await driveFetch(`${DRIVE_API}/files/${fileId}?fields=id&supportsAllDrives=true`);
    return resp.ok;
  } catch {
    return false;
  }
}
