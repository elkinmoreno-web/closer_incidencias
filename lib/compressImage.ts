/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla.
 *
 * Objetivo: dejar el archivo lo más ligero posible SIN perder
 * legibilidad. Una captura de incidencia o un justificante de ausencia
 * solo necesita leerse en un móvil, no calidad de imprenta:
 *   - Ancho máximo 1280px: suficiente para leer texto de una captura o
 *     un documento fotografiado; una foto de móvil suele venir a 3000-
 *     4000px de ancho, así que esto sola ya recorta muchísimo.
 *   - Calidad JPEG 0.65: comprime fuerte pero el texto sigue nítido.
 *
 * Una foto de móvil de 4-8 MB acaba en torno a 100-250 KB. Los PDF se
 * dejan intactos (no son imágenes y suelen ser justificantes oficiales).
 *
 * Si en algún caso el resultado quedara ilegible, sube `maxWidth` a 1600
 * o `quality` a 0.75 — es el punto donde se equilibra peso vs nitidez.
 */
export async function compressImageIfNeeded(file: File, maxWidth = 1280, quality = 0.65): Promise<File> {
  // Los PDF y cualquier cosa que no sea imagen se dejan tal cual.
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // si algo falla, seguimos con el archivo original

  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  // Fondo blanco: si la imagen original tuviera transparencia (PNG),
  // al pasar a JPEG el transparente se vería negro sin esto.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return file;

  // Nos quedamos con el comprimido salvo que, por lo que sea, saliera
  // más grande que el original (imágenes ya muy optimizadas).
  if (blob.size >= file.size) return file;

  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
