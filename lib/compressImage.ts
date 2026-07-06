/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla.
 * Una foto de móvil sin tratar puede pesar 4-8 MB; tras esto, unos
 * cientos de KB. Reduce mucho el consumo de Supabase Storage y acelera
 * la subida en datos móviles. Los PDF se dejan tal cual (no son imágenes).
 */
export async function compressImageIfNeeded(file: File, maxWidth = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/webp') {
    // WebP ya viene comprimido de fábrica en la mayoría de móviles modernos;
    // no merece la pena volver a codificarlo.
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
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob || blob.size >= file.size) return file; // si no mejora, nos quedamos con el original

  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
