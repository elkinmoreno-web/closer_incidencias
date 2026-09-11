'use client';

import { useState } from 'react';
import { MetricasAdminPanel } from '@/components/metricas/MetricasAdminPanel';
import { AlertasRidersPanel } from '@/components/metricas/AlertasRidersPanel';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

type Tab = 'metricas' | 'alertas';

export function MetricasTabs() {
  const { t } = useIdioma();
  const [tab, setTab] = useState<Tab>('metricas');

  return (
    <div className="space-y-4">
      <div className="flex gap-4 border-b border-border">
        <button
          onClick={() => setTab('metricas')}
          className={`border-b-2 px-1 pb-2 text-sm font-semibold transition ${tab === 'metricas' ? 'border-primary text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
        >
          {t('admMetricas.titulo')}
        </button>
        <button
          onClick={() => setTab('alertas')}
          className={`border-b-2 px-1 pb-2 text-sm font-semibold transition ${tab === 'alertas' ? 'border-primary text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
        >
          {t('admAlertas.tab')}
        </button>
      </div>

      {tab === 'metricas' ? <MetricasAdminPanel /> : <AlertasRidersPanel />}
    </div>
  );
}
