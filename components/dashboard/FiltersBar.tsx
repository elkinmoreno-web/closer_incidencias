'use client';

import { useCallback, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Centro, Motivo } from '@/lib/types';

export function FiltersBar({ centros, motivos }: { centros: Centro[]; motivos: Motivo[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.set('page', '1'); // cualquier cambio de filtro reinicia la paginación
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input
        type="search"
        placeholder="Buscar rider, DNI o código..."
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => setParam('q', e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none lg:col-span-2"
      />

      <select
        defaultValue={searchParams.get('estado') ?? ''}
        onChange={(e) => setParam('estado', e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
      >
        <option value="">Todos los estados</option>
        <option value="pendiente">Pendiente</option>
        <option value="aprobada">Aprobada</option>
        <option value="rechazada">Rechazada</option>
      </select>

      <select
        defaultValue={searchParams.get('centro') ?? ''}
        onChange={(e) => setParam('centro', e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
      >
        <option value="">Todos los centros</option>
        {centros.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get('motivo') ?? ''}
        onChange={(e) => setParam('motivo', e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
      >
        <option value="">Todos los motivos</option>
        {motivos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
