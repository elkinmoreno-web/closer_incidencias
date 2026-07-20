import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Cliente de Google Drive para guardar los archivos adjuntos
 * (capturas de incidencias, justificantes de ausencias, evidencias de
 * conexiones fuera de zona) en el Drive de la empresa.
 *
 * Usa un Client ID/Secret de OAuth propios (creados con una cuenta de
 * Google DISTINTA a la del Workspace de la empresa — no requiere tocar
 * nada en la cuenta corporativa) + un refresh_token de larga duración.
 * Con esto, ESTA MISMA APP renueva su access_token cuando lo necesita,
 * en una sola llamada de menos de 1 segundo — no depende de ningún
 * proceso externo (GitHub Actions, rclone, etc.) para funcionar.
 *
 * Por qué se dejó de usar el client_id compartido de rclone: dos
 * problemas reales de fondo que un panel de uso constante no puede
 * tener: (1) la renovación dependía de un GitHub Action con
 * `schedule`, que GitHub documenta como "best effort" — a veces no
 * corre a tiempo; (2) la cuota de peticiones por minuto es COMPARTIDA
 * entre todos los usuarios de rclone en el mundo con ese client_id por
 * defecto, así que terceros ajenos podían tumbarnos la cuota. Con
 * credenciales propias, ambos problemas desaparecen: la cuota es
 * nuestra, y la renovación la hacemos nosotros mismos al instante.
 *
 * Variables de entorno necesarias:
 *   GOOGLE_DRIVE_CLIENT_ID
 *   GOOGLE_DRIVE_CLIENT_SECRET
 *   GOOGLE_DRIVE_REFRESH_TOKEN
 *   GOOGLE_DRIVE_FOLDER_ID (carpeta raíz "Closer CRM - Archivos")
 *
 * IMPORTANTE: la carpeta raíz debe estar COMPARTIDA (permiso Editor)
 * con la cuenta de Google que autorizó este refresh_token — si no, las
 * llamadas fallarán con 403/404 aunque el token en sí sea válido.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let tokenCache: { token: string; expira: number } | null = null;

/**
 * Renueva (o reutiliza si sigue vigente) el access_token, directamente
 * con Google — sin ningún intermediario externo. Cachea en memoria del
 * proceso hasta ~5 min antes de que caduque de verdad, con margen.
 */
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
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const detalle = await resp.text();
    throw new Error(`No se pudo renovar el token de Google Drive (HTTP ${resp.status}): ${detalle}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error('Google no devolvió un access_token al renovar');

  const expiraEnMs = (data.expires_in ?? 3600) * 1000;
  tokenCache = { token: data.access_token, expira: Date.now() + expiraEnMs - 5 * 60 * 1000 }; // 5 min de margen
  return data.access_token;
}

/**
 * Dispara el GitHub Action de renovación al instante, vía su API (en
 * vez de esperar al próximo cron). Requiere GITHUB_PAT (un Personal
 * Access Token con permiso "Actions: Read and write" limitado a este
 * repo) y GITHUB_REPO (formato "usuario/repositorio"). Si no están
 * configuradas, no hace nada — el llamador simplemente no obtiene
 * autocorrección y ve el error normal.
 */
async function dispararRenovacionToken(): Promise<boolean> {
  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO;
  if (!pat || !repo) return false;

  const archivo = process.env.GITHUB_WORKFLOW_FILE || 'refrescar-drive-token.yml';
  const rama = process.env.GITHUB_BRANCH || 'main';

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${archivo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: rama }),
    });
    return resp.status === 204;
  } catch {
    return false;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

  // Límite de cuota transitorio (ahora es NUESTRA propia cuota, así que
  // debería ser raro, pero no cuesta nada tener el reintento).
  if (resp.status === 403 && reintentos > 0) {
    const cuerpo = await resp.clone().text();
    if (cuerpo.includes('rateLimitExceeded') || cuerpo.includes('userRateLimitExceeded') || cuerpo.includes('Quota exceeded')) {
      await esperar(2000 * (3 - reintentos));
      return driveFetch(url, init, reintentos - 1);
    }
  }

  // Con token propio esto no debería pasar casi nunca (renovamos antes
  // de que caduque), pero por si el token se invalidó por otro motivo
  // (ej. se revocó manualmente), reintentamos una vez con uno nuevo.
  if (resp.status === 401 && reintentos > 0) {
    tokenCache = null;
    return driveFetch(url, init, reintentos - 1);
  }

  return resp;
}

/**
 * Caché PERSISTENTE (en Supabase, no en memoria) de las carpetas de
 * Drive ya resueltas, para no repetir innecesariamente la misma
 * búsqueda/creación de carpeta en cada subida.
 */
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
 * genuinamente no existe (404 real) — cualquier otro fallo se deja
 * propagar con su mensaje real.
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
