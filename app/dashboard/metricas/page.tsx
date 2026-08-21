import { MetricasAdminPanel } from '@/components/metricas/MetricasAdminPanel';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';

export default async function MetricasPage() {
  const t = crearTraductor(await resolverIdioma());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('admMetricas.titulo')}</h1>
        <p className="text-sm text-ink-muted">{t('admMetricas.subtitulo')}</p>
      </div>
      <MetricasAdminPanel />
    </div>
  );
}
