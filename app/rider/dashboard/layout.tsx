import { redirect } from 'next/navigation';
import Image from 'next/image';
import { LogOut } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getRiderActual } from '@/lib/supabase/server';
import { riderSignOut } from '@/app/rider/dashboard/actions';
import { AnnouncementBanner } from '@/components/shared/AnnouncementBanner';
import { RiderNotificationBell } from '@/components/rider/RiderNotificationBell';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

export default async function RiderDashboardLayout({ children }: { children: React.ReactNode }) {
  const rider = await getRiderActual();
  if (!rider || !rider.activo) redirect('/rider/login?error=sin_acceso');

  const t = await getTranslations('RiderHeader');

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <Image src="/logo-closer.png" alt="Closer Logistics" width={150} height={36} className="h-7 w-auto sm:h-8" priority />
          <div className="mt-1 truncate text-xs text-ink-muted">{t('hola', { nombre: rider.nombre })}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <RiderNotificationBell riderId={rider.id} />
          <form action={riderSignOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-ink-muted transition hover:border-danger hover:text-danger sm:gap-2 sm:px-4 sm:text-sm"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">{t('salir')}</span>
            </button>
          </form>
        </div>
      </header>
      <AnnouncementBanner />
      <main className="mx-auto max-w-2xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
