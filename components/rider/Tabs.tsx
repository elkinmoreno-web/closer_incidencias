'use client';

import { useState } from 'react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

export function Tabs({
  incidenciaPanel,
  ausenciaPanel,
  metricasPanel,
  zonaPanel,
}: {
  incidenciaPanel: React.ReactNode;
  ausenciaPanel: React.ReactNode;
  metricasPanel: React.ReactNode;
  zonaPanel: React.ReactNode;
}) {
  const { t } = useIdioma();
  const [tab, setTab] = useState<'incidencia' | 'ausencia' | 'metricas' | 'zona'>('incidencia');

  return (
    <div>
      <div className="mb-5 flex gap-1 rounded-full bg-bg p-1">
        <button
          onClick={() => setTab('incidencia')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'incidencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.incidencia')}
        </button>
        <button
          onClick={() => setTab('ausencia')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'ausencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.ausencia')}
        </button>
        <button
          onClick={() => setTab('metricas')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'metricas' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.metricas')}
        </button>
        <button
          onClick={() => setTab('zona')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'zona' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.zona')}
        </button>
      </div>
      {tab === 'incidencia' && incidenciaPanel}
      {tab === 'ausencia' && ausenciaPanel}
      {tab === 'metricas' && metricasPanel}
      {tab === 'zona' && zonaPanel}
    </div>
  );
}
