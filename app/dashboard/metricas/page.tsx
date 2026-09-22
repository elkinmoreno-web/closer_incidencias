import { MetricasTabs } from '@/components/metricas/MetricasTabs';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';
import { exigirModuloAdmin } from '@/lib/modulos';

export default async function MetricasPage() {
  // El super admin puede apagar este módulo desde Configuración.
  // Esconderlo del menú no basta: sin esto se entraría por la URL.
  await exigirModuloAdmin('metricas');

  const t = crearTraductor(await resolverIdioma());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('admMetricas.titulo')}</h1>
        <p className="text-sm text-ink-muted">{t('admMetricas.subtitulo')}</p>
      </div>
      <MetricasTabs />
    </div>
  );
}
