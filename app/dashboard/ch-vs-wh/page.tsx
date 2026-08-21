import { ChVsWhPanel } from '@/components/overtime/ChVsWhPanel';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';

export default async function ChVsWhPage() {
  const t = crearTraductor(await resolverIdioma());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('chVsWh.titulo')}</h1>
        <p className="text-sm text-ink-muted">{t('chVsWh.subtitulo')}</p>
      </div>
      <ChVsWhPanel />
    </div>
  );
}
