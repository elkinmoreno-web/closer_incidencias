'use client';

import { MapPin, ExternalLink } from 'lucide-react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Muestra el mapa de zona de conexión del centro del rider. La imagen
 * la sube el Super Admin desde Configuración → Centros (una por
 * centro); aquí solo se lee y se muestra.
 */
export function ZonaConexionPanel({ imagenUrl, nombreCentro }: { imagenUrl: string | null; nombreCentro: string | null }) {
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

      {imagenUrl ? (
        <a href={imagenUrl} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagenUrl} alt={t('zonaConexion.titulo')} className="w-full object-contain" />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
            <ExternalLink size={12} />
            {t('zonaConexion.verEnGrande')}
          </span>
        </a>
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
