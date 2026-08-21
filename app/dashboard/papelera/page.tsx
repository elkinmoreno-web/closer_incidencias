import { createClient } from '@/lib/supabase/server';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { RecoverButton } from '@/components/dashboard/RecoverButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { formatFecha } from '@/lib/utils';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor, nombreSegunIdioma } from '@/lib/i18n/traducir';

export default async function PapeleraPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const idioma = await resolverIdioma();
  const t = crearTraductor(idioma);
  const supabase = createClient();

  let query = supabase
    .from('incidencias')
    .select('*, centros(nombre), motivos(nombre, nombre_en), admins:eliminado_por_id(usuario)')
    .eq('estado', 'papelera')
    .order('fecha_eliminacion', { ascending: false });

  if (searchParams.centro) query = query.eq('centro_id', Number(searchParams.centro));
  if (searchParams.desde) query = query.gte('fecha_eliminacion', `${searchParams.desde}T00:00:00`);
  if (searchParams.hasta) query = query.lte('fecha_eliminacion', `${searchParams.hasta}T23:59:59`);
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
  }
  if (searchParams.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(searchParams.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const [{ data: incidencias }, zona] = await Promise.all([
    query,
    ciudadesYCentrosDeMiZona(),
  ]);
  const centros = zona.centros;
  const ciudades = zona.ciudades;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('papelera.titulo')}</h1>
        <p className="text-sm text-ink-muted">{t('papelera.descripcion')}</p>
      </div>

      <TableFilters searchPlaceholder={t('papelera.buscarPlaceholder')} ciudades={ciudades ?? []} centros={centros ?? []} showDateRange />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!incidencias || incidencias.length === 0 ? (
          <EmptyState title={t('papelera.vacia')} />
        ) : (
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">{t('papelera.colRider')}</th>
                <th className="px-4 py-3">{t('papelera.colCentro')}</th>
                <th className="px-4 py-3">{t('papelera.colMotivo')}</th>
                <th className="px-4 py-3">{t('papelera.colEliminadoPor')}</th>
                <th className="px-4 py-3">{t('papelera.colFecha')}</th>
                <th className="px-4 py-3 text-right">{t('papelera.colAcciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidencias.map((i: any) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{i.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{i.dni}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{i.centros?.nombre ?? '—'}</td>
                  <td className="px-4 py-3">{i.motivos ? nombreSegunIdioma(idioma, i.motivos.nombre, i.motivos.nombre_en) : '—'}</td>
                  <td className="px-4 py-3">{i.admins?.usuario ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{formatFecha(i.fecha_eliminacion)}</td>
                  <td className="px-4 py-3 text-right">
                    <RecoverButton id={i.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
