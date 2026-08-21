import { createClient } from '@/lib/supabase/server';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { formatFecha } from '@/lib/utils';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';

const PAGE_SIZE = 30;

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const t = crearTraductor(await resolverIdioma());
  const supabase = createClient();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('auditoria')
    .select('id, accion, detalles, created_at, admins(usuario), centros(nombre)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchParams.desde) query = query.gte('created_at', `${searchParams.desde}T00:00:00`);
  if (searchParams.hasta) query = query.lte('created_at', `${searchParams.hasta}T23:59:59`);
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(`accion.ilike.%${q}%,detalles.ilike.%${q}%`);
  }
  if (searchParams.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(searchParams.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const [{ data: eventos, count }, zona] = await Promise.all([query, ciudadesYCentrosDeMiZona()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('auditoria.titulo')}</h1>
        <p className="text-sm text-ink-muted">
          {t('auditoria.descripcion')}
          {!zona.esSuperAdmin && t('auditoria.soloTusCiudades')}.
        </p>
      </div>

      <TableFilters searchPlaceholder={t('auditoria.buscarPlaceholder')} ciudades={zona.ciudades} showDateRange />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!eventos || eventos.length === 0 ? (
          <EmptyState title={t('auditoria.sinActividad')} />
        ) : (
          <table className="w-full min-w-[700px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">{t('auditoria.colAdmin')}</th>
                <th className="px-4 py-3">{t('auditoria.colAccion')}</th>
                <th className="px-4 py-3">{t('auditoria.colCentro')}</th>
                <th className="px-4 py-3">{t('auditoria.colDetalles')}</th>
                <th className="px-4 py-3">{t('auditoria.colFecha')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {(e.admins as unknown as { usuario: string } | null)?.usuario ?? '—'}
                  </td>
                  <td className="px-4 py-3">{e.accion}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {(e.centros as unknown as { nombre: string } | null)?.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{e.detalles}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{formatFecha(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(count ?? 0) > PAGE_SIZE && (
        <p className="text-center text-xs text-ink-muted">
          {t('auditoria.mostrandoRecientes').replace('{n}', String(PAGE_SIZE)).replace('{total}', String(count))}
        </p>
      )}
    </div>
  );
}
