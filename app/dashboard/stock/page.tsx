import { redirect } from 'next/navigation';
import { StockPanel } from '@/components/stock/StockPanel';
import { listarMaterialesStock } from '@/app/dashboard/stock/actions';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';
import { getAdminActual } from '@/lib/supabase/server';
import { CORREOS_ACCESO_STOCK_TEMPORAL } from '@/lib/utils';

export default async function StockPage() {
  // TEMPORAL: ver CORREOS_ACCESO_STOCK_TEMPORAL en lib/utils.ts.
  const admin = await getAdminActual();
  if (!admin?.email || !CORREOS_ACCESO_STOCK_TEMPORAL.includes(admin.email)) redirect('/dashboard');

  const t = crearTraductor(await resolverIdioma());
  const [materiales, zona] = await Promise.all([listarMaterialesStock(), ciudadesYCentrosDeMiZona()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('stock.titulo')}</h1>
        <p className="text-sm text-ink-muted">{t('stock.subtitulo')}</p>
      </div>
      <StockPanel materiales={materiales} centros={zona.centros} esSuperAdmin={zona.esSuperAdmin} />
    </div>
  );
}
