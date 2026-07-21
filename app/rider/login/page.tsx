import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { RiderLoginForm } from '@/components/auth/RiderLoginForm';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

export default async function RiderLoginPage() {
  const t = await getTranslations('RiderLogin');

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 shadow-sm">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-6 text-center">
          <Image src="/logo-closer.png" alt="Closer Logistics" width={200} height={48} className="mx-auto h-11 w-auto" priority />
          <h1 className="mt-4 text-xl font-semibold text-ink">{t('titulo')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('subtitulo')}</p>
        </div>
        <RiderLoginForm />
      </div>
    </div>
  );
}
