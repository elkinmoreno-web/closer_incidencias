import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Punto de entrada: manda a cada quien a su portal según su sesión.
 * Sin sesión -> portal del rider (el admin entra por /gestor/login,
 * una URL que no se enlaza desde ningún sitio visible).
 */
export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (admin) redirect('/dashboard');

    const { data: rider } = await supabase
      .from('riders')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (rider) redirect('/rider/dashboard');
  }

  redirect('/rider/login');
}
