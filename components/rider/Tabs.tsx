'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function Tabs({
  incidenciaPanel,
  ausenciaPanel,
  metricasPanel,
}: {
  incidenciaPanel: React.ReactNode;
  ausenciaPanel: React.ReactNode;
  metricasPanel: React.ReactNode;
}) {
  const [tab, setTab] = useState<'incidencia' | 'ausencia' | 'metricas'>('incidencia');
  const t = useTranslations('RiderTabs');

  return (
    <div>
      <div className="mb-5 flex gap-1 rounded-full bg-bg p-1">
        <button
          onClick={() => setTab('incidencia')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'incidencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('incidencia')}
        </button>
        <button
          onClick={() => setTab('ausencia')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'ausencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('ausencia')}
        </button>
        <button
          onClick={() => setTab('metricas')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'metricas' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('metricas')}
        </button>
      </div>
      {tab === 'incidencia' && incidenciaPanel}
      {tab === 'ausencia' && ausenciaPanel}
      {tab === 'metricas' && metricasPanel}
    </div>
  );
}
