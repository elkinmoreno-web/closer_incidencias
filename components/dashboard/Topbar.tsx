import { LogOut } from 'lucide-react';
import { ConnectedAdmins } from '@/components/dashboard/ConnectedAdmins';
import { NotificationCenter } from '@/components/dashboard/NotificationCenter';
import { signOut } from '@/app/dashboard/actions';

export function Topbar({
  adminId,
  usuario,
  rol,
}: {
  adminId: string;
  usuario: string;
  rol: string;
}) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-4 pl-16 md:px-6 md:pl-6">
      <div className="min-w-0">
        <div className="truncate text-sm text-ink-muted">
          <span className="hidden sm:inline">Bienvenido, </span>
          <span className="font-semibold text-ink">{usuario}</span>
          <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-ink-muted">
            {rol === 'super_admin'
              ? 'Super Admin'
              : rol === 'administrador'
              ? 'Administrador'
              : rol === 'admin_zona'
              ? 'Moderador'
              : 'Moderador'}
          </span>
        </div>
        <ConnectedAdmins adminId={adminId} usuario={usuario} />
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <NotificationCenter />
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-ink-muted transition hover:border-danger hover:text-danger md:px-4"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </form>
      </div>
    </header>
  );
}
