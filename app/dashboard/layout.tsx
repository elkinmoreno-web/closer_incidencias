import { redirect } from 'next/navigation';
import { createClient, getAdminActual } from '@/lib/supabase/server';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminActual();
  if (!admin || !admin.activo) redirect('/gestor/login');

  const supabase = createClient();
  const [{ count: pendientesCount }, { count: ausenciasPendientesCount }, { data: misCiudades }] = await Promise.all([
    supabase.from('incidencias').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    supabase.from('ausencias').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    supabase.from('admin_ciudades').select('ciudades(nombre)').eq('admin_id', admin.id),
  ]);
  const misCiudadesNombres = (misCiudades ?? []).map((c: any) => c.ciudades?.nombre).filter(Boolean) as string[];

  return (
    <div className="flex min-h-screen">
      <Sidebar rol={admin.rol} pendientesCount={pendientesCount ?? 0} ausenciasPendientesCount={ausenciasPendientesCount ?? 0} />
      <div className="flex flex-1 flex-col">
        <Topbar adminId={admin.id} usuario={admin.usuario} rol={admin.rol} misCiudades={misCiudadesNombres} />
        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto bg-bg p-6 pt-16 md:pt-6">{children}</main>
      </div>
    </div>
  );
}
