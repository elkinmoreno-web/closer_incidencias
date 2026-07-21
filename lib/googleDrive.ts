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

  const q = `name = '${nombre.replace(/'/g, "\\'")}' and '${padreId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const resp = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  if (!resp.ok) throw new Error(`No se pudo buscar la carpeta "${nombre}" en Drive (HTTP ${resp.status})`);
  const data = await resp.json();

  if (data.files && data.files.length > 0 && data.files[0].id) {
    await admin.from('google_drive_folder_cache').upsert({ clave, folder_id: data.files[0].id }, { onConflict: 'clave' });
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
  await admin.from('google_drive_folder_cache').upsert({ clave, folder_id: creadaData.id }, { onConflict: 'clave' });
  return creadaData.id;
}

async function carpetaDelMes(categoria: 'Incidencias' | 'Ausencias' | 'Conexiones'): Promise<string> {
  const raizId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raizId) throw new Error('Falta la variable de entorno GOOGLE_DRIVE_FOLDER_ID');

  const categoriaId = await obtenerOCrearCarpeta(categoria, raizId);
  const ahora = new Date();
  const mesStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
  return obtenerOCrearCarpeta(mesStr, categoriaId);
}

/** Sube un archivo a la carpeta del mes actual de la categoría. Devuelve el ID del archivo en Drive. */
export async function subirArchivoDrive(
  categoria: 'Incidencias' | 'Ausencias' | 'Conexiones',
  nombreArchivo: string,
  contenido: Buffer,
  mimeType: string
): Promise<string> {
  const carpetaId = await carpetaDelMes(categoria);

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

/** Descarga un archivo por su ID. Devuelve null solo si Drive confirma un 404 real. */
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

export async function borrarArchivoDrive(fileId: string): Promise<void> {
  try {
    await driveFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  } catch {
    // No bloquea la operación principal si falla el borrado.
  }
}
