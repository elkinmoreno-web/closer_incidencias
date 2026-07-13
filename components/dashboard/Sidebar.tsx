'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, AlertTriangle, CalendarOff, Trash2, Settings, Users, BarChart3, ClipboardList, MapPinOff, Menu, X, Clock, Scale } from 'lucide-react';
import type { RolAdmin } from '@/lib/types';
import { PendingBadge } from '@/components/dashboard/PendingBadge';

const NAV = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/incidencias', label: 'Incidencias', icon: AlertTriangle, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/ausencias', label: 'Ausencias', icon: CalendarOff, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/riders', label: 'Riders', icon: Users, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/conexiones', label: 'Conexiones fuera de zona', icon: MapPinOff, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/overtime', label: 'Horas extra', icon: Clock, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/ch-vs-wh', label: 'CH vs WH', icon: Scale, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/reportes', label: 'Reportes', icon: BarChart3, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/auditoria', label: 'Auditoría', icon: ClipboardList, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/papelera', label: 'Papelera', icon: Trash2, roles: ['super_admin', 'administrador', 'moderador', 'admin_zona'] },
  { href: '/dashboard/configuracion', label: 'Configuración', icon: Settings, roles: ['super_admin', 'administrador'] },
] as const;

export function Sidebar({ rol, pendientesCount }: { rol: RolAdmin; pendientesCount: number }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  const items = NAV.filter((item) => (item.roles as readonly string[]).includes(rol));

  const enlaces = (
    <>
      <div className="mb-4 flex items-center justify-between px-2">
        <Image src="/logo-closer.png" alt="Closer Logistics" width={160} height={38} className="h-9 w-auto" priority />
        <button onClick={() => setAbierto(false)} className="text-ink-muted md:hidden" aria-label="Cerrar menú">
          <X size={20} />
        </button>
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setAbierto(false)}
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
    </>
  );

  return (
    <>
      {/* Botón de menú — solo en móvil */}
      <button
        onClick={() => setAbierto(true)}
        className="fixed left-4 top-4 z-40 rounded-lg border border-border bg-surface p-2 text-ink shadow-sm md:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Sidebar fijo en escritorio */}
      <nav className="hidden h-full w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 md:flex">
        {enlaces}
      </nav>

      {/* Cajón deslizable en móvil */}
      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <nav className="absolute left-0 top-0 flex h-full w-64 flex-col gap-1 border-r border-border bg-surface p-4">
            {enlaces}
          </nav>
        </div>
      )}
    </>
  );
}
