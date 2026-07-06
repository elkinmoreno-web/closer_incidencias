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
    <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
      <div>
        <div className="text-sm text-ink-muted">
          Bienvenido, <span className="font-semibold text-ink">{usuario}</span>
          <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-ink-muted">
            {rol === 'super_admin' ? 'Super Admin' : rol === 'admin_zona' ? 'Admin de zona' : 'Moderador'}
          </span>
        </div>
        <ConnectedAdmins adminId={adminId} usuario={usuario} />
      </div>
      <div className="flex items-center gap-3">
        <NotificationCenter />
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-danger hover:text-danger"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
