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

export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_DOC_MIME = [...ALLOWED_IMAGE_MIME, 'application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
