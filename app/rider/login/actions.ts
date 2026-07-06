'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dniSchema } from '@/lib/validations';
import { z } from 'zod';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Introduce un email válido'),
  dni: dniSchema,
});

export type RiderLoginState = { error?: string } | undefined;

export async function loginRider(_prev: RiderLoginState, formData: FormData): Promise<RiderLoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    dni: formData.get('dni'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = createClient();

  // El DNI hace de contraseña, igual que en el sistema anterior. Supabase
  // Auth aplica sus límites de intentos por email/IP a este método.
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.dni,
  });

  if (error || !data.user) {
    // Distinguimos el motivo real en vez de un mensaje genérico: así se
    // puede diagnosticar sin adivinar. "Email o DNI incorrectos" solo
    // aparece cuando de verdad es eso.
    if (error?.message === 'Email not confirmed') {
      return { error: 'Esta cuenta no tiene el email confirmado. Revísalo en Supabase (Authentication > Users).' };
    }
    if (error?.message?.toLowerCase().includes('invalid login credentials')) {
      return { error: 'Email o DNI incorrectos' };
    }
    return { error: `No se pudo iniciar sesión (${error?.message ?? 'motivo desconocido'})` };
  }

  const { data: rider } = await supabase
    .from('riders')
    .select('id, activo')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  if (!rider || !rider.activo) {
    await supabase.auth.signOut();
    return { error: 'Esta cuenta no tiene acceso al portal de riders' };
  }

  redirect('/rider/dashboard');
}
