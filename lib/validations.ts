import { z } from 'zod';

// Reutilizamos la misma validación de DNI/NIE que ya usamos en el
// formulario de ausencias, para mantener consistencia en todo el sistema.
const dniRegex = /^[0-9]{8}[A-Z]$/;
const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;

export const dniSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => dniRegex.test(v) || nieRegex.test(v), 'DNI/NIE no válido');

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
