'use client';

import { useEffect, useState } from 'react';
import { MetricasAdminPanel } from '@/components/metricas/MetricasAdminPanel';
import { AlertasRidersPanel } from '@/components/metricas/AlertasRidersPanel';
import { obtenerUltimaActualizacionMetricas } from '@/app/dashboard/metricas/actions';
import { formatFecha } from '@/lib/utils';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

type Tab = 'metricas' | 'alertas';

export function MetricasTabs() {
  const { t } = useIdioma();
  const [tab, setTab] = useState<Tab>('metricas');
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);

  // Ambas pestañas (Performance y Alertas) leen la misma tabla
  // driver_daily_stats, que llena un pipeline externo (fuera de este
  // repo) en horarios no siempre puntuales — de ahí el aviso de cuándo
  // se tocó por última vez, para que quede claro si el dato es de hoy o
  // se quedó atrás.
  useEffect(() => {
    obtenerUltimaActualizacionMetricas().then(setUltimaActualizacion);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <div className="flex gap-4">
          <button
            onClick={() => setTab('metricas')}
            className={`border-b-2 px-1 pb-2 text-sm font-semibold transition ${tab === 'metricas' ? 'border-primary text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {t('admMetricas.tabPerformance')}
          </button>
          <button
            onClick={() => setTab('alertas')}
            className={`border-b-2 px-1 pb-2 text-sm font-semibold transition ${tab === 'alertas' ? 'border-primary text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {t('admAlertas.tab')}
          </button>
        </div>
        {ultimaActualizacion && <p className="pb-2 text-xs text-ink-muted">{t('admMetricas.actualizadoEl')}: {formatFecha(ultimaActualizacion)}</p>}
      </div>

      {tab === 'metricas' ? <MetricasAdminPanel /> : <AlertasRidersPanel />}
    </div>
  );
}
