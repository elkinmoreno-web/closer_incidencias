import { LogOut } from 'lucide-react';
import { ConnectedAdmins } from '@/components/dashboard/ConnectedAdmins';
import { NotificationCenter } from '@/components/dashboard/NotificationCenter';
import { signOut } from '@/app/dashboard/actions';
import type { Idioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';
import { SelectorIdioma } from '@/components/i18n/SelectorIdioma';

export function Topbar({
  adminId,
  usuario,
  rol,
  misCiudades,
  idioma,
}: {
  adminId: string;
  usuario: string;
  rol: string;
  misCiudades: string[];
  idioma: Idioma;
}) {
  const t = crearTraductor(idioma);
  const rolLabel =
    rol === 'super_admin' ? t('topbar.superAdmin') : rol === 'administrador' ? t('topbar.administrador') : t('topbar.moderador');

  return (
    <header className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-4 pl-16 md:px-6 md:pl-6">
      <div className="min-w-0">
        <div className="truncate text-sm text-ink-muted">
          <span className="hidden sm:inline">{t('topbar.bienvenido')} </span>
          <span className="font-semibold text-ink">{usuario}</span>
          <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-ink-muted">{rolLabel}</span>
        </div>
        <ConnectedAdmins adminId={adminId} usuario={usuario} rol={rol} misCiudades={misCiudades} />
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden md:block">
          <SelectorIdioma />
        </div>
        <NotificationCenter />
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-ink-muted transition hover:border-danger hover:text-danger md:px-4"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{t('topbar.cerrarSesion')}</span>
          </button>
        </form>
      </div>
    </header>
  );
}
