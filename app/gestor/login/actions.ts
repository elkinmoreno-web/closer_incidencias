'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/validations';

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = createClient();

  // Supabase Auth ya aplica límites de intentos por email/IP a este método,
  // así que no necesitamos reinventar un contador de intentos fallidos.
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    // Mensaje genérico a propósito: no revelamos si el email existe o no.
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('id, activo')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  if (!admin || !admin.activo) {
    await supabase.auth.signOut();
    return { error: 'Esta cuenta no tiene acceso al panel de administración' };
  }

  redirect('/dashboard');
}
