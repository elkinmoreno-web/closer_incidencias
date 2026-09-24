import { tipoDeArchivo } from '@/lib/validations';
/**
 * Valida tipo y tamaño de un archivo ANTES de intentar subirlo — al
 * instante, en el propio teléfono, sin tocar la red. Sin esto, un
 * archivo rechazado (ej. un video elegido por error) se subía entero al
 * servidor antes de que la validación pudiera rechazarlo, y con datos
 * móviles lentos eso podía tardar minutos sin ningún indicio visual de
 * que algo se estaba moviendo — parecía que la app se había congelado.
 */
export function validarArchivoCliente(file: File, allowed: string[], maxBytes = 10 * 1024 * 1024): string | null {
  // Se usa el tipo DEDUCIDO, no el que declara el navegador: los
  // selectores de Android entregan muchos archivos con `type` vacío y un
  // JPG normal se rechazaba como "formato desconocido" (ver tipoDeArchivo).
  const tipo = tipoDeArchivo(file);
  if (!allowed.includes(tipo)) {
    const tipos = allowed.includes('application/pdf') ? 'una imagen (JPG/PNG) o un PDF' : 'una imagen (JPG/PNG)';
    return `Este archivo no se puede subir (${tipo || 'formato desconocido'}). Selecciona ${tipos}.`;
  }
  if (file.size > maxBytes) {
    return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB — el máximo permitido es ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`;
  }
  return null;
}

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
async function compressImageIfNeeded(file: File, maxWidth = 1280, quality = 0.65): Promise<File | null> {
  // Se usa el tipo DEDUCIDO, no `file.type`: los selectores de Android
  // entregan muchas fotos con el tipo vacío, y con `file.type` esas se
  // colaban por aquí sin comprimir y subían a 4-8 MB.
  if (!tipoDeArchivo(file).startsWith('image/')) return null;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null; // si algo falla, se sube el original

  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Fondo blanco: si la imagen original tuviera transparencia (PNG),
  // al pasar a JPEG el transparente se vería negro sin esto.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return null;

  // Nos quedamos con el comprimido salvo que, por lo que sea, saliera
  // más grande que el original (imágenes ya muy optimizadas).
  if (blob.size >= file.size) return null;

  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

/**
 * Se lanza cuando el móvil ya no puede entregar los bytes del archivo
 * elegido. Los formularios la distinguen para decirle al rider que lo
 * vuelva a seleccionar, en vez de soltarle un error técnico.
 */
export class ArchivoNoDisponibleError extends Error {
  constructor(public readonly nombre: string) {
    super(`No se pudo leer ${nombre}`);
    this.name = 'ArchivoNoDisponibleError';
  }
}

/**
 * Deja el archivo listo para enviar: comprimido si es una imagen y, en
 * todo caso, DESPEGADO del almacenamiento del teléfono.
 *
 * Lo segundo arregla un fallo real de producción: Chrome en Android
 * abortaba el envío con `net::ERR_UPLOAD_FILE_CHANGED` y el formulario
 * moría con un `TypeError: Failed to fetch`.
 *
 * El motivo es que un File salido del selector NO contiene los bytes:
 * contiene una ruta, más el tamaño y la fecha que tenía al elegirlo.
 * Cuando sale el POST, Chrome vuelve a abrir ese fichero y, si algo de
 * eso ha cambiado, cancela la subida entera. En Android cambia
 * constantemente — la galería reescribe la foto al generar la
 * miniatura, Google Fotos la sincroniza, el proveedor de "Archivos
 * recientes" regenera su copia temporal — y entre que el rider elige el
 * justificante y pulsa enviar pasan segundos de sobra.
 *
 * Al leer los bytes aquí, lo que viaja ya no apunta a ningún fichero:
 * no queda nada que pueda cambiar por debajo. Las imágenes ya salían
 * despegadas (el comprimido nace de un canvas); esto cubre los PDF y
 * los casos en que la compresión se salta.
 */
export async function prepararArchivoParaSubir(file: File): Promise<File> {
  const comprimido = await compressImageIfNeeded(file);
  if (comprimido) return comprimido;

  try {
    const bytes = await file.arrayBuffer();
    return new File([bytes], file.name, { type: tipoDeArchivo(file), lastModified: file.lastModified });
  } catch {
    throw new ArchivoNoDisponibleError(file.name);
  }
}
