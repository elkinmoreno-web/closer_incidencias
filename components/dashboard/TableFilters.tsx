'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Centro, Ciudad, Gestor } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

interface Opcion {
  value: string;
  label: string;
}

interface MotivoOpcion {
  id: number;
  nombre: string;
  nombre_en?: string | null;
}

export function TableFilters({
  searchPlaceholder,
  estados,
  ciudades,
  centros,
  motivos,
  motivoLabel,
  gestores,
  showDateRange = false,
}: {
  searchPlaceholder?: string;
  estados?: Opcion[];
  ciudades?: Ciudad[];
  centros?: Centro[];
  motivos?: MotivoOpcion[];
  motivoLabel?: string;
  gestores?: Gestor[];
  showDateRange?: boolean;
}) {
  const { t, idioma } = useIdioma();
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

  // Igual que setParam, pero para cuando hace falta cambiar VARIOS
  // parámetros a la vez (ej. ciudad + limpiar centro): dos llamadas
  // seguidas a setParam pisaban una a la otra, porque cada una
  // construye su URL desde el mismo searchParams "viejo" — la segunda
  // ganaba y la primera se perdía (bug real: el filtro de ciudad
  // nunca llegaba a aplicarse en Riders).
  const setParams = useCallback(
    (cambios: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(cambios)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
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

  const etiquetaMotivo = motivoLabel ?? t('admIncidencias.colMotivo');

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
          <option value="">{t('filtros.todosLosEstados')}</option>
          {estados.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {gestores && (
        <select
          defaultValue={searchParams.get('gestor') ?? ''}
          onChange={(e) => setParam('gestor', e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">{t('filtros.todosLosGestores')}</option>
          {gestores.map((g) => (
            <option key={g.id} value={g.id}>{g.nombre}</option>
          ))}
        </select>
      )}

      {ciudades && (
        <select
          value={ciudadSeleccionada}
          onChange={(e) => {
            setCiudadSeleccionada(e.target.value);
            setParams({ ciudad: e.target.value, centro: '' }); // al cambiar de ciudad, no arrastramos un centro de otra ciudad
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">{t('filtros.todasLasCiudades')}</option>
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
          <option value="">{t('filtros.todosLosCentros')}</option>
          <option value="sin-centro">{t('filtros.sinCentroAsignado')}</option>
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
          <option value="">{`${t('filtros.todosMotivo')} (${etiquetaMotivo.toLowerCase()})`}</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>{nombreSegunIdioma(idioma, m.nombre, m.nombre_en)}</option>
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
            title={t('filtros.desde')}
          />
          <input
            type="date"
            defaultValue={searchParams.get('hasta') ?? ''}
            onChange={(e) => setParam('hasta', e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            title={t('filtros.hasta')}
          />
        </>
      )}
    </div>
  );
}
