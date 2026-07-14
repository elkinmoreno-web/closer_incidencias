/**
 * Construye la URL para ver/descargar un archivo guardado en Google
 * Drive a través de nuestro propio servidor (ver
 * app/api/drive-file/route.ts). A diferencia de las URLs firmadas de
 * Supabase Storage, esta no caduca por sí sola — la privacidad la da la
 * sesión (hay que estar autenticado como admin para que el servidor
 * acepte devolver el archivo), no un token temporal en la URL.
 */
export function urlArchivoDrive(fileId: string | null | undefined): string | null {
  if (!fileId) return null;
  return `/api/drive-file?id=${encodeURIComponent(fileId)}`;
}
