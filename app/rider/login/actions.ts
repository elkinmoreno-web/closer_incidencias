'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { dniSchema } from '@/lib/validations';
import { z } from 'zod';

const schema = z.object({
  dni: dniSchema,
  password: z.string().min(1, 'Introduce tu contraseña'),
});

export type RiderLoginState = { error?: string } | undefined;

export async function loginRider(_prev: RiderLoginState, formData: FormData): Promise<RiderLoginState> {
  const parsed = schema.safeParse({
    dni: formData.get('dni'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  // El rider solo teclea su DNI, pero Supabase Auth necesita un email
  // para iniciar sesión. Lo buscamos con el cliente de privilegios
  // elevados porque, por diseño, un usuario anónimo no puede leer la
  // tabla `riders` (RLS lo bloquea).
  const admin = createAdminClient();
  const { data: rider } = await admin.from('riders').select('email, activo').eq('dni', parsed.data.dni).maybeSingle();

  if (!rider || !rider.activo) {
    return { error: 'DNI o contraseña incorrectos' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: rider.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: 'DNI o contraseña incorrectos' };
  }

  redirect('/rider/dashboard');
}
