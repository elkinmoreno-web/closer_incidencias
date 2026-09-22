import { z } from 'zod';

// DNI/NIE español, o un identificador genérico alfanumérico para riders
// de otros países (ej. Alemania, donde el "documento" que usa RRHH no es
// un DNI/NIE español sino un código interno tipo "W5942941").
const dniRegex = /^[0-9]{8}[A-Z]$/;
const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
const idExtranjeroRegex = /^[A-Z0-9]{5,15}$/;

export const dniSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => dniRegex.test(v) || nieRegex.test(v) || idExtranjeroRegex.test(v), 'Documento no válido');

export const incidenciaSchema = z.object({
  dni: dniSchema,
  motivoId: z.number().int().positive(),
  codigoPedido: z.string().trim().max(100).optional().nullable(),
  observaciones: z.string().trim().max(1000).optional().nullable(),
  direccionRecogida: z.string().trim().max(300).optional().nullable(),
  direccionEntrega: z.string().trim().max(300).optional().nullable(),
});

/**
 * Reclamación de nómina.
 *
 * `periodo` es el mes al que se refiere la nómina, en formato aaaa-mm
 * (lo que devuelve un <input type="month">). Se guarda como el día 1 de
 * ese mes para poder filtrar y agrupar con operadores de fecha normales.
 *
 * `importe` es opcional a propósito: el rider muchas veces sabe que le
 * falta un concepto pero no cuánto, y obligarle a poner una cifra le
 * empujaría a inventarse una.
 */
export const reclamacionSchema = z.object({
  dni: dniSchema,
  motivoId: z.number().int().positive({ message: 'Selecciona qué reclamas' }),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, { message: 'Indica el mes de la nómina' }),
  importe: z.number().nonnegative().max(99999999).optional().nullable(),
  comentario: z.string().trim().max(1000).optional().nullable(),
});

export const ausenciaSchema = z
  .object({
    dni: dniSchema,
    motivoId: z.number().int().positive({ message: 'Selecciona un motivo' }),
    fechaInicio: z.string().date(),
    fechaFin: z.string().date(),
    comentario: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((v) => v.fechaFin >= v.fechaInicio, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['fechaFin'],
  });

export const loginSchema = z.object({
  email: z.string().trim().email('Introduce un email válido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

// Se admiten HEIC/HEIF: es el formato por defecto de las fotos de iPhone.
// El navegador no sabe convertirlos, así que llegan tal cual y se guardan tal cual.
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const ALLOWED_DOC_MIME = [...ALLOWED_IMAGE_MIME, 'application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Tipo real de un archivo, deduciéndolo de la extensión cuando el
 * navegador no lo informa.
 *
 * Los selectores de Android (Drive, "Archivos recientes", Smart Connect,
 * los gestores de ficheros de cada fabricante) entregan muy a menudo el
 * archivo con `type` vacío o como 'application/octet-stream'. Comparar
 * ese valor contra la lista de permitidos lo rechazaba con "formato
 * desconocido" aunque fuese un JPG perfectamente válido — y como un solo
 * archivo rechazado tiraba la selección entera, el rider veía que "no
 * deja subir varios archivos".
 *
 * También cubre HEIC/HEIF, el formato por defecto de las fotos de iPhone.
 */
const TIPO_POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

export function tipoDeArchivo(file: { name: string; type?: string }): string {
  const declarado = (file.type ?? '').toLowerCase();
  // 'application/octet-stream' es el "no sé qué es esto" de muchos
  // selectores: no aporta nada, así que se mira la extensión igual.
  if (declarado && declarado !== 'application/octet-stream') return declarado;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return TIPO_POR_EXTENSION[ext] ?? declarado;
}

/** Valida tipo y tamaño de un archivo del lado del servidor (ver también validarArchivoCliente en lib/compressImage.ts para la validación instantánea del lado del navegador). */
export function validarArchivo(file: File | null, allowed: string[]): string | null {
  if (!file || file.size === 0) return null;
  if (!allowed.includes(tipoDeArchivo(file))) return 'Formato de archivo no permitido';
  if (file.size > MAX_FILE_BYTES) return 'El archivo supera los 10 MB';
  return null;
}
