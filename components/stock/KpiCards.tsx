'use client';

import type { StockDisponible } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

function Kpi({ label, value, desc, tono }: { label: string; value: number; desc: string; tono?: 'blue' | 'green' | 'red' }) {
  const color = tono === 'blue' ? 'text-blue-600' : tono === 'green' ? 'text-emerald-600' : tono === 'red' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${color}`}>{Math.round(value).toLocaleString()}</div>
      <div className="mt-0.5 text-xs text-ink-muted">{desc}</div>
    </div>
  );
}

/** Las 4 tarjetas de resumen del material activo — mismo set que #st-res del panel de Sheets. */
export function KpiCards({ stock }: { stock: StockDisponible[] }) {
  const { t } = useIdioma();

  const fisico = stock.reduce((acc, s) => acc + s.disponible, 0);
  const enCamino = stock.reduce((acc, s) => acc + s.transito_entrante, 0);
  const enCalle = stock.reduce((acc, s) => acc + s.en_calle, 0);
  const rotasPerdidas = stock.reduce((acc, s) => acc + s.merma + s.perdida, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Kpi label={t('stock.kpiFisico')} value={fisico} desc={t('stock.kpiFisicoDesc')} />
      <Kpi label={t('stock.kpiEnCamino')} value={enCamino} desc={t('stock.kpiEnCaminoDesc')} tono="blue" />
      <Kpi label={t('stock.kpiEntregadas')} value={enCalle} desc={t('stock.kpiEntregadasDesc')} tono="green" />
      <Kpi label={t('stock.kpiRotasPerdidas')} value={rotasPerdidas} desc={t('stock.kpiRotasPerdidasDesc')} tono="red" />
    </div>
  );
}
