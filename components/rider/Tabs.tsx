'use client';

import { useState } from 'react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

export function Tabs({
  incidenciaPanel,
  ausenciaPanel,
  reclamacionPanel,
  metricasPanel,
  zonaPanel,
  visibles,
}: {
  incidenciaPanel: React.ReactNode;
  ausenciaPanel: React.ReactNode;
  reclamacionPanel: React.ReactNode;
  metricasPanel: React.ReactNode;
  zonaPanel: React.ReactNode;
  /** Claves de pestaña encendidas (ver lib/modulos.ts). */
  visibles: string[];
}) {
  const { t } = useIdioma();
  const orden = ['incidencia', 'ausencia', 'reclamacion', 'metricas', 'zona'] as const;
  type Pestana = (typeof orden)[number];
  const CLAVE_MODULO: Record<Pestana, string> = {
    incidencia: 'rider_incidencia',
    ausencia: 'rider_ausencia',
    reclamacion: 'rider_reclamacion',
    metricas: 'rider_metricas',
    zona: 'rider_zona',
  };
  const encendidas = orden.filter((p) => visibles.includes(CLAVE_MODULO[p]));
  // La primera encendida es la de inicio: si "incidencia" estuviera
  // apagada, arrancar en ella dejaría el panel en blanco.
  const [tab, setTab] = useState<Pestana>(encendidas[0] ?? 'incidencia');

  return (
    <div>
      <div className="mb-5 flex gap-1 rounded-full bg-bg p-1">
        {encendidas.includes('incidencia') && (
        <button
          onClick={() => setTab('incidencia')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'incidencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.incidencia')}
        </button>
        )}
        {encendidas.includes('ausencia') && (
        <button
          onClick={() => setTab('ausencia')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'ausencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.ausencia')}
        </button>
        )}
        {encendidas.includes('reclamacion') && (
        <button
          onClick={() => setTab('reclamacion')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'reclamacion' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.reclamacion')}
        </button>
        )}
        {encendidas.includes('metricas') && (
        <button
          onClick={() => setTab('metricas')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'metricas' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.metricas')}
        </button>
        )}
        {encendidas.includes('zona') && (
        <button
          onClick={() => setTab('zona')}
          className={`flex-1 rounded-full py-2.5 text-xs font-semibold transition sm:text-sm ${
            tab === 'zona' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          {t('tabs.zona')}
        </button>
        )}
      </div>
      {tab === 'incidencia' && incidenciaPanel}
      {tab === 'ausencia' && ausenciaPanel}
      {tab === 'reclamacion' && reclamacionPanel}
      {tab === 'metricas' && metricasPanel}
      {tab === 'zona' && zonaPanel}
    </div>
  );
}
