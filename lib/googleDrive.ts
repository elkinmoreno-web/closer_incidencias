import 'server-only';
import { google } from 'googleapis';
import { Readable } from 'stream';

/**
 * Cliente de Google Drive para guardar los archivos adjuntos
 * (capturas de incidencias, justificantes de ausencias, evidencias de
 * conexiones fuera de zona) en el Drive de la empresa (Google
 * Workspace), en vez de en Supabase Storage.
 *
 * Autenticación: OAuth con refresh token de larga duración (el mismo
 * patrón que usa rclone). El token se generó UNA VEZ de forma manual —
 * ver README, sección "Google Drive" — y desde entonces esta app pide
 * un access token nuevo automáticamente en cada uso, sin intervención
 * humana, igual que ya lo hace tu otro proyecto con GitHub Actions.
 *
 * Variables de entorno necesarias (en Vercel, nunca en el código):
 *   GOOGLE_DRIVE_CLIENT_ID
 *   GOOGLE_DRIVE_CLIENT_SECRET
 *   GOOGLE_DRIVE_REFRESH_TOKEN
 *   GOOGLE_DRIVE_FOLDER_ID   (carpeta raíz "Closer CRM - Archivos")
 *
 * Privacidad: los archivos se crean SIN compartir con nadie (ni
 * siquiera "cualquiera con el enlace"). Para mostrarlos en el panel, el
 * servidor los descarga bajo demanda con este mismo cliente y se los
 * entrega al navegador ya autenticado — el archivo en Drive nunca queda
 * expuesto por un enlace público.
 */

let clienteCache: ReturnType<typeof google.drive> | null = null;

function obtenerClienteDrive() {
  if (clienteCache) return clienteCache;

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Faltan variables de entorno de Google Drive (GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN)');
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  clienteCache = google.drive({ version: 'v3', auth });
  return clienteCache;
}

// Cache en memoria del proceso para no crear la misma carpeta dos veces
// en la misma ejecución (p. ej. varias fotos de la misma incidencia).
const carpetaCache = new Map<string, string>();

/**
 * Busca (o crea si no existe) una carpeta por nombre dentro de un padre.
 * Devuelve el ID de la carpeta.
 */
async function obtenerOCrearCarpeta(nombre: string, padreId: string): Promise<string> {
  const clave = `${padreId}/${nombre}`;
  const enCache = carpetaCache.get(clave);
  if (enCache) return enCache;

  const drive = obtenerClienteDrive();
  const q = `name = '${nombre.replace(/'/g, "\\'")}' and '${padreId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const { data } = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });

  if (data.files && data.files.length > 0 && data.files[0].id) {
    carpetaCache.set(clave, data.files[0].id);
    return data.files[0].id;
  }

  const { data: creada } = await drive.files.create({
    requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padreId] },
    fields: 'id',
  });
  if (!creada.id) throw new Error('No se pudo crear la carpeta en Drive');
  carpetaCache.set(clave, creada.id);
  return creada.id;
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
  const drive = obtenerClienteDrive();
  const carpetaId = await carpetaDelMes(categoria);

  const { data } = await drive.files.create({
    requestBody: { name: nombreArchivo, parents: [carpetaId] },
    media: { mimeType, body: Readable.from(contenido) },
    fields: 'id',
  });
  if (!data.id) throw new Error('No se pudo subir el archivo a Drive');
  return data.id;
}

/**
 * Descarga el contenido de un archivo de Drive por su ID, para
 * mostrarlo/servirlo desde nuestro propio servidor (el archivo en Drive
 * permanece privado; nunca se comparte con un enlace público).
 */
export async function descargarArchivoDrive(fileId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const drive = obtenerClienteDrive();
    const [contenido, metadata] = await Promise.all([
      drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }),
      drive.files.get({ fileId, fields: 'mimeType' }),
    ]);
    return {
      buffer: Buffer.from(contenido.data as ArrayBuffer),
      mimeType: metadata.data.mimeType ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/** Borra un archivo de Drive (por si se necesita en el futuro, ej. al eliminar un registro). */
export async function borrarArchivoDrive(fileId: string): Promise<void> {
  try {
    const drive = obtenerClienteDrive();
    await drive.files.delete({ fileId });
  } catch {
    // Si ya no existe o falla, no bloqueamos la operación principal.
  }
}
