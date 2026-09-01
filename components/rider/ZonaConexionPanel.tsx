'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

// Leaflet usa `window` — debe cargarse solo en cliente, nunca en SSR.
const MapaZonaConexion = dynamic(() => import('@/components/rider/MapaZonaConexion').then((m) => m.MapaZonaConexion), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl border border-border bg-bg" />,
});

/**
 * Muestra el mapa real de la zona de conexión del centro del rider —
 * el polígono viene sincronizado semanalmente (cada lunes) desde el
 * mapa oficial en Drive, ver lib/zonasConexion.ts. Reemplaza al
 * sistema anterior de imagen estática subida a mano por centro.
 */
export function ZonaConexionPanel({ poligonos, nombreZona, nombreCentro }: { poligonos: [number, number][][] | null; nombreZona: string | null; nombreCentro: string | null }) {
  const { t } = useIdioma();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-ink">
          {t('zonaConexion.titulo')}
          {nombreCentro ? ` — ${nombreCentro}` : ''}
        </h2>
      </div>

      {poligonos && poligonos.length > 0 ? (
        <>
          <MapaZonaConexion poligonos={poligonos} />
          {nombreZona && <p className="text-center text-xs text-ink-muted">{nombreZona}</p>}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border py-14 text-center text-ink-muted">
          <MapPin size={20} className="mb-1 opacity-40" />
          <p className="text-sm font-medium">{t('zonaConexion.sinImagenTitulo')}</p>
          <p className="text-xs">{t('zonaConexion.sinImagenDesc')}</p>
        </div>
      )}
    </div>
  );
}
