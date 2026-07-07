import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/gestor/login');

  // Segunda comprobación aquí además del middleware: "defensa en profundidad".
  // Si en el futuro alguien quita el middleware por error, esta capa sigue en pie.
  const { data: admin } = await supabase
    .from('admins')
    .select('id, usuario, rol, activo')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!admin || !admin.activo) redirect('/login?error=sin_acceso');

  const { count: pendientesCount } = await supabase
    .from('incidencias')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente');

  return (
    <div className="flex min-h-screen">
      <Sidebar rol={admin.rol} pendientesCount={pendientesCount ?? 0} />
      <div className="flex flex-1 flex-col">
        <Topbar adminId={admin.id} usuario={admin.usuario} rol={admin.rol} />
        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto bg-bg p-6 pt-16 md:pt-6">{children}</main>
      </div>
    </div>
  );
}
