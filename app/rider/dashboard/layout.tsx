import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { riderSignOut } from '@/app/rider/dashboard/actions';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';
import { RiderNotificationBell } from '@/components/rider/RiderNotificationBell';

export default async function RiderDashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/rider/login');

  const { data: rider } = await supabase
    .from('riders')
    .select('id, nombre, activo')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!rider || !rider.activo) redirect('/rider/login?error=sin_acceso');

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div>
          <div className="text-sm font-semibold text-primary">Closer Logistics</div>
          <div className="text-xs text-ink-muted">Hola, {rider.nombre}</div>
        </div>
        <div className="flex items-center gap-3">
          <RiderNotificationBell riderId={rider.id} />
          <form action={riderSignOut}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-danger hover:text-danger"
            >
              <LogOut size={16} />
              Salir
            </button>
          </form>
        </div>
      </header>
      <AnnouncementBanner />
      <main className="mx-auto max-w-2xl p-6">{children}</main>
    </div>
  );
}
