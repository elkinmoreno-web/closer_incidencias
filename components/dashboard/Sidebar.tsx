'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, AlertTriangle, CalendarOff, Trash2, Settings, Users, BarChart3, ClipboardList, MapPinOff } from 'lucide-react';
import type { RolAdmin } from '@/lib/types';
import { PendingBadge } from '@/components/dashboard/PendingBadge';

const NAV = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/incidencias', label: 'Incidencias', icon: AlertTriangle, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/ausencias', label: 'Ausencias', icon: CalendarOff, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/riders', label: 'Riders', icon: Users, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/conexiones', label: 'Conexiones fuera de zona', icon: MapPinOff, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/reportes', label: 'Reportes', icon: BarChart3, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/auditoria', label: 'Auditoría', icon: ClipboardList, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/papelera', label: 'Papelera', icon: Trash2, roles: ['super_admin', 'moderador', 'admin_zona'] },
  { href: '/dashboard/configuracion', label: 'Configuración', icon: Settings, roles: ['super_admin'] },
] as const;

export function Sidebar({ rol, pendientesCount }: { rol: RolAdmin; pendientesCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4">
      <div className="mb-4 px-2 text-lg font-semibold text-primary">Closer Logistics</div>
      {NAV.filter((item) => (item.roles as readonly string[]).includes(rol)).map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              active ? 'bg-primary text-white' : 'text-ink-muted hover:bg-bg hover:text-ink'
            )}
          >
            <Icon size={18} />
            {item.label}
            {item.href === '/dashboard/incidencias' && <PendingBadge initialCount={pendientesCount} />}
          </Link>
        );
      })}
    </nav>
  );
}
