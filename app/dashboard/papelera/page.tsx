import { createClient } from '@/lib/supabase/server';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { RecoverButton } from '@/components/dashboard/RecoverButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { Pagination } from '@/components/dashboard/Pagination';
import { formatFecha } from '@/lib/utils';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor, nombreSegunIdioma } from '@/lib/i18n/traducir';

const PAGE_SIZE = 20;

export default async function PapeleraPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const idioma = await resolverIdioma();
  const t = crearTraductor(idioma);
  const supabase = createClient();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // La papelera mezcla incidencias Y ausencias. Se leen de la vista
  // papelera_items (un UNION de ambas tablas) en vez de consultar cada
  // tabla y mezclarlas aquí: así se puede ordenar y paginar sobre el
  // conjunto. Mezclándolas en memoria no había forma de paginar bien y
  // se topaba el límite de 1.000 filas de PostgREST — con 4.847
  // incidencias en papelera, el resto no se veía.
  // La vista es security_invoker, así que sigue aplicando el RLS de
  // incidencias/ausencias: cada gestor solo ve lo de sus centros.
  let query = supabase
    .from('papelera_items')
    .select('*', { count: 'exact' })
    .order('fecha_eliminacion', { ascending: false })
    .range(from, to);

  if (searchParams.tipo === 'incidencia' || searchParams.tipo === 'ausencia') {
    query = query.eq('tipo', searchParams.tipo);
  }
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

  const [{ data: filas, count }, zona] = await Promise.all([query, ciudadesYCentrosDeMiZona()]);
  const centros = zona.centros;
  const ciudades = zona.ciudades;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('papelera.titulo')}</h1>
        <p className="text-sm text-ink-muted">
          {count ?? 0} {t('admIncidencias.resultados')} — {t('papelera.descripcion')}
        </p>
      </div>

      <TableFilters
        searchPlaceholder={t('papelera.buscarPlaceholder')}
        tipos={[
          { value: 'incidencia', label: t('papelera.tipoIncidencia') },
          { value: 'ausencia', label: t('papelera.tipoAusencia') },
        ]}
        ciudades={ciudades ?? []}
        centros={centros ?? []}
        showDateRange
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {(filas ?? []).length === 0 ? (
          <EmptyState title={t('papelera.vacia')} />
        ) : (
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">{t('papelera.colRider')}</th>
                <th className="px-4 py-3">{t('papelera.colTipo')}</th>
                <th className="px-4 py-3">{t('papelera.colCentro')}</th>
                <th className="px-4 py-3">{t('papelera.colMotivo')}</th>
                <th className="px-4 py-3">{t('papelera.colEliminadoPor')}</th>
                <th className="px-4 py-3">{t('papelera.colFecha')}</th>
                <th className="px-4 py-3 text-right">{t('papelera.colAcciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(filas ?? []).map((i) => (
                <tr key={`${i.tipo}-${i.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{i.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{i.dni}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${i.tipo === 'ausencia' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {i.tipo === 'ausencia' ? t('papelera.tipoAusencia') : t('papelera.tipoIncidencia')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{i.centro_nombre ?? '—'}</td>
                  <td className="px-4 py-3">{i.motivo_nombre ? nombreSegunIdioma(idioma, i.motivo_nombre, i.motivo_nombre_en) : '—'}</td>
                  <td className="px-4 py-3">{i.eliminado_por ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{formatFecha(i.fecha_eliminacion)}</td>
                  <td className="px-4 py-3 text-right">
                    <RecoverButton id={i.id} tipo={i.tipo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/papelera" searchParams={searchParams} />
    </div>
  );
}
