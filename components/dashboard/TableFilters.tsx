'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Centro, Ciudad } from '@/lib/types';

interface Opcion {
  value: string;
  label: string;
}

interface MotivoOpcion {
  id: number;
  nombre: string;
}

export function TableFilters({
  searchPlaceholder,
  estados,
  ciudades,
  centros,
  motivos,
  motivoLabel = 'Motivo',
  showDateRange = false,
}: {
  searchPlaceholder?: string;
  estados?: Opcion[];
  ciudades?: Ciudad[];
  centros?: Centro[];
  motivos?: MotivoOpcion[];
  motivoLabel?: string;
  showDateRange?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState(searchParams.get('ciudad') ?? '');

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.set('page', '1');
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams]
  );

  const centrosFiltrados = useMemo(() => {
    if (!centros) return [];
    if (!ciudadSeleccionada) return centros;
    return centros.filter((c) => String(c.ciudad_id) === ciudadSeleccionada);
  }, [centros, ciudadSeleccionada]);

  return (
    <div
      className="grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))` }}
    >
      {searchPlaceholder && (
        <input
          type="search"
          placeholder={searchPlaceholder}
          defaultValue={searchParams.get('q') ?? ''}
          onChange={(e) => setParam('q', e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none sm:col-span-2"
        />
      )}

      {estados && (
        <select
          defaultValue={searchParams.get('estado') ?? ''}
          onChange={(e) => setParam('estado', e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Todos los estados</option>
          {estados.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {ciudades && (
        <select
          value={ciudadSeleccionada}
          onChange={(e) => {
            setCiudadSeleccionada(e.target.value);
            setParam('ciudad', e.target.value);
            setParam('centro', ''); // al cambiar de ciudad, no arrastramos un centro de otra ciudad
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      )}

      {centros && (
        <select
          defaultValue={searchParams.get('centro') ?? ''}
          onChange={(e) => setParam('centro', e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Todos los centros</option>
          {centrosFiltrados.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      )}

      {motivos && (
        <select
          defaultValue={searchParams.get('motivo') ?? ''}
          onChange={(e) => setParam('motivo', e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">{`Todos (${motivoLabel.toLowerCase()})`}</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
      )}

      {showDateRange && (
        <>
          <input
            type="date"
            defaultValue={searchParams.get('desde') ?? ''}
            onChange={(e) => setParam('desde', e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            title="Desde"
          />
          <input
            type="date"
            defaultValue={searchParams.get('hasta') ?? ''}
            onChange={(e) => setParam('hasta', e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            title="Hasta"
          />
        </>
      )}
    </div>
  );
}
