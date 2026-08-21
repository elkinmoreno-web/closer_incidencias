import { OvertimePanel } from '@/components/overtime/OvertimePanel';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';

export default async function OvertimePage() {
  const t = crearTraductor(await resolverIdioma());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('overtime.titulo')}</h1>
        <p className="text-sm text-ink-muted">{t('overtime.subtitulo')}</p>
      </div>
      <OvertimePanel />
    </div>
  );
}
