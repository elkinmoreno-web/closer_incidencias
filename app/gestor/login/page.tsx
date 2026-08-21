import Image from 'next/image';
import { LoginForm } from '@/components/auth/LoginForm';
import { resolverIdiomaSinSesion } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';

export default function LoginPage() {
  const t = crearTraductor(resolverIdiomaSinSesion());
  return (
    <div className="flex min-h-screen">
      {/* Panel de marca — solo visible en pantallas medianas o más grandes */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-primary p-12 text-white md:flex">
        <Image src="/logo-closer-transparente.png" alt="Closer Logistics" width={160} height={38} className="h-auto max-w-[200px] brightness-0 invert" priority />
        <div>
          <h1 className="text-3xl font-semibold leading-snug">{t('loginGestor.tituloPanel')}</h1>
          <p className="mt-4 max-w-sm text-white/85">{t('loginGestor.subtituloPanel')}</p>
        </div>
        <p className="text-xs text-white/70">{t('loginGestor.accesoRestringido')}</p>
      </div>

      {/* Formulario */}
      <div className="flex w-full flex-1 items-center justify-center bg-bg p-6 md:w-1/2">
        <div className="w-full max-w-sm rounded-card bg-surface p-8 shadow-sm">
          <Image src="/logo-closer-transparente.png" alt="Closer Logistics" width={150} height={36} className="mb-6 h-8 w-auto" priority />
          <h2 className="text-xl font-semibold text-ink">{t('loginGestor.iniciarSesion')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('loginGestor.subtitulo')}</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
