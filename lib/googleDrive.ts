import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Cliente de Google Drive para guardar los archivos adjuntos
 * (capturas de incidencias, justificantes de ausencias, evidencias de
 * conexiones fuera de zona) en el Drive de la empresa.
 *
 * IMPORTANTE — por qué esto NO usa OAuth2Client con Client ID/Secret:
 * crear un Client ID propio en Google Cloud Console requiere permisos
 * de administrador de Google Workspace que en esta empresa no están
 * disponibles. En vez de eso:
 *
 *   1. En tu propio ordenador, rclone YA mantiene una sesión válida con
 *      Google Drive (usando su propio client_id interno, de forma
 *      legítima — es su uso normal).
 *   2. Un GitHub Action programado (ver .github/workflows/refrescar-drive-token.yml)
 *      corre cada ~45 min, deja que rclone renueve el token si hace
 *      falta, y guarda ese access_token vigente en la tabla
 *      `google_drive_token` de Supabase.
 *   3. Esta app SOLO LEE ese token de la tabla y lo usa directo como
 *      Bearer token contra la API REST de Drive — nunca intenta
 *      renovarlo por su cuenta, así que nunca necesita Client ID/Secret.
 *
 * El token dura ~60 minutos y el GitHub Action lo refresca cada 45, así
 * que siempre debería haber uno vigente. Si por lo que sea el Action no
 * ha corrido a tiempo y el token ya caducó, las llamadas a Drive
 * devuelven 401 y se lanza un error claro para poder diagnosticarlo.
 *
 * Variable de entorno necesaria: GOOGLE_DRIVE_FOLDER_ID (carpeta raíz
 * "Closer CRM - Archivos"). Ya no hacen falta CLIENT_ID/CLIENT_SECRET/
 * REFRESH_TOKEN.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let tokenCache: { token: string; expira: number; actualizadoEn: string } | null = null;

/**
 * Lee el access_token guardado por el GitHub Action, y lo entrega
 * siempre para que se intente usar — NUNCA lo rechazamos aquí solo por
 * cuánto tiempo lleva guardado. Los cron de GitHub Actions son "best
 * effort" y pueden atrasarse varios minutos sin avisar, así que un
 * límite de tiempo adivinado (ej. "más de 55 min, seguro caducó") puede
 * rechazar un token que en realidad todavía es válido. La única forma
 * confiable de saber si un token sirve es probarlo de verdad contra
 * Google — si Google lo rechaza (401), ahí sí se informa con claridad.
 * Cachea unos segundos en memoria del proceso para no golpear Supabase
 * en cada operación de una misma request.
 */
async function obtenerAccessToken(): Promise<{ token: string; actualizadoEn: string }> {
  if (tokenCache && tokenCache.expira > Date.now()) return { token: tokenCache.token, actualizadoEn: tokenCache.actualizadoEn };

  const admin = createAdminClient();
  const { data, error } = await admin.from('google_drive_token').select('access_token, actualizado_en').eq('id', true).single();

  if (error || !data) {
    throw new Error('No hay token de Google Drive guardado todavía. Revisa que el GitHub Action de renovación haya corrido al menos una vez.');
  }

  tokenCache = { token: data.access_token, expira: Date.now() + 60 * 1000, actualizadoEn: data.actualizado_en };
  return { token: data.access_token, actualizadoEn: data.actualizado_en };
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { token, actualizadoEn } = await obtenerAccessToken();
  const resp = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (resp.status === 401) {
    tokenCache = null; // el token pudo caducar justo ahora; no reintentamos aquí, el próximo intento leerá uno fresco si ya se renovó
    const minutos = Math.round((Date.now() - new Date(actualizadoEn).getTime()) / 60000);
    throw new Error(
      `Google Drive rechazó el token (401) — caducó de verdad. Se guardó hace ${minutos} minutos. Revisa que el GitHub Action "refrescar-drive-token" se esté ejecutando (cada ~45 min); si está corriendo bien pero sigue pasando, puede que GitHub esté atrasando el cron y convenga bajar el intervalo.`
    );
  }
  return resp;
}

// Cache en memoria del proceso para no crear la misma carpeta dos veces
// en la misma ejecución (p. ej. varias fotos de la misma incidencia).
const carpetaCache = new Map<string, string>();

/** Busca (o crea si no existe) una carpeta por nombre dentro de un padre. Devuelve el ID de la carpeta. */
async function obtenerOCrearCarpeta(nombre: string, padreId: string): Promise<string> {
  const clave = `${padreId}/${nombre}`;
  const enCache = carpetaCache.get(clave);
  if (enCache) return enCache;

  const q = `name = '${nombre.replace(/'/g, "\\'")}' and '${padreId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const resp = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  if (!resp.ok) throw new Error(`No se pudo buscar la carpeta "${nombre}" en Drive (HTTP ${resp.status})`);
  const data = await resp.json();

  if (data.files && data.files.length > 0 && data.files[0].id) {
    carpetaCache.set(clave, data.files[0].id);
    return data.files[0].id;
  }

  const creada = await driveFetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padreId] }),
  });
  if (!creada.ok) throw new Error(`No se pudo crear la carpeta "${nombre}" en Drive (HTTP ${creada.status})`);
  const creadaData = await creada.json();
  if (!creadaData.id) throw new Error('No se pudo crear la carpeta en Drive');
  carpetaCache.set(clave, creadaData.id);
  return creadaData.id;
}

/** Carpeta del mes actual dentro de una categoría (Incidencias/Ausencias/Conexiones), creando lo que falte. */
async function carpetaDelMes(categoria: 'Incidencias' | 'Ausencias' | 'Conexiones'): Promise<string> {
  const raizId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raizId) throw new Error('Falta la variable de entorno GOOGLE_DRIVE_FOLDER_ID');

  const categoriaId = await obtenerOCrearCarpeta(categoria, raizId);
  const ahora = new Date();
  const mesStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  return obtenerOCrearCarpeta(mesStr, categoriaId);
}

/**
 * Sube un archivo a Drive dentro de la carpeta del mes actual de la
 * categoría indicada. Devuelve el ID del archivo en Drive (esto es lo
 * que se guarda en la base de datos, no una ruta de carpeta).
 */
export async function subirArchivoDrive(
  categoria: 'Incidencias' | 'Ausencias' | 'Conexiones',
  nombreArchivo: string,
  contenido: Buffer,
  mimeType: string
): Promise<string> {
  const carpetaId = await carpetaDelMes(categoria);

  // Subida multipart: una parte con los metadatos (nombre, carpeta) y
  // otra con el contenido del archivo, en una sola petición.
  const boundary = `closer_crm_${Date.now()}`;
  const metadata = JSON.stringify({ name: nombreArchivo, parents: [carpetaId] });
  const cuerpo = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    contenido,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const resp = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: cuerpo,
  });
  if (!resp.ok) throw new Error(`No se pudo subir el archivo a Drive (HTTP ${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  if (!data.id) throw new Error('No se pudo subir el archivo a Drive');
  return data.id;
}

/**
 * Descarga el contenido de un archivo de Drive por su ID, para
 * mostrarlo/servirlo desde nuestro propio servidor (el archivo en Drive
 * permanece privado; nunca se comparte con un enlace público).
 *
 * Devuelve `null` SOLO cuando Drive confirma que el archivo
 * genuinamente no existe (404 real) — cualquier otro fallo (token
 * caducado, sin permiso, error de red) se deja propagar con su mensaje
 * real, en vez de disfrazarlo todo como "no encontrado" como pasaba
 * antes (lo que hacía imposible saber si el archivo de verdad no
 * estaba, o si era otra cosa, como el mismo problema del token).
 */
export async function descargarArchivoDrive(fileId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const [contenidoResp, metaResp] = await Promise.all([
    driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`),
    driveFetch(`${DRIVE_API}/files/${fileId}?fields=mimeType`),
  ]);

  if (contenidoResp.status === 404 || metaResp.status === 404) return null;

  if (!contenidoResp.ok) throw new Error(`Drive respondió ${contenidoResp.status} al pedir el contenido del archivo: ${await contenidoResp.text()}`);
  if (!metaResp.ok) throw new Error(`Drive respondió ${metaResp.status} al pedir los metadatos del archivo: ${await metaResp.text()}`);

  const [buffer, meta] = await Promise.all([contenidoResp.arrayBuffer(), metaResp.json()]);
  return { buffer: Buffer.from(buffer), mimeType: meta.mimeType ?? 'application/octet-stream' };
}

/** Borra un archivo de Drive (por si se necesita en el futuro, ej. al eliminar un registro). */
export async function borrarArchivoDrive(fileId: string): Promise<void> {
  try {
    await driveFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  } catch {
    // Si ya no existe o falla, no bloqueamos la operación principal.
  }
}
