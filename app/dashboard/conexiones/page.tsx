import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { NuevaConexionModal } from '@/components/conexiones/NuevaConexionModal';
import { ExportarConexionesButton } from '@/components/conexiones/ExportarConexionesButton';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { Pagination } from '@/components/dashboard/Pagination';
import { formatFechaCorta, formatFecha } from '@/lib/utils';
import { urlArchivoDrive } from '@/lib/driveUrl';

const PAGE_SIZE = 10;

export default async function ConexionesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const supabase = createClient();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('conexiones_fuera_zona')
    .select('*, centros(nombre), admins:created_by(usuario)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchParams.centro) query = query.eq('centro_id', Number(searchParams.centro));
  if (searchParams.desde) query = query.gte('fecha', searchParams.desde);
  if (searchParams.hasta) query = query.lte('fecha', searchParams.hasta);
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
  }
  if (searchParams.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(searchParams.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const [{ data: conexiones, count }, zona] = await Promise.all([query, ciudadesYCentrosDeMiZona()]);
  const centros = zona.centros;
  const ciudades = zona.ciudades;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const filas = (conexiones ?? []).map((c) => ({
    ...c,
    screenshotSignedUrl: urlArchivoDrive(c.screenshot_url),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Conexiones fuera de zona</h1>
          <p className="text-sm text-ink-muted">{count ?? 0} resultado(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportarConexionesButton />
          <NuevaConexionModal />
        </div>
      </div>

      <TableFilters
        searchPlaceholder="Buscar rider o DNI..."
        ciudades={ciudades ?? []}
        centros={centros ?? []}
        showDateRange
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {filas.length === 0 ? (
          <EmptyState title="No hay conexiones fuera de zona registradas" />
        ) : (
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Centro</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Captura</th>
                <th className="px-4 py-3">Observaciones</th>
                <th className="px-4 py-3">Registrado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{c.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{c.dni}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{(c.centros as unknown as { nombre: string } | null)?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{formatFechaCorta(c.fecha)}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.screenshotSignedUrl ? (
                      <a href={c.screenshotSignedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Ver captura
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-ink-muted">{c.observaciones || '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {(c.admins as unknown as { usuario: string } | null)?.usuario ?? '—'}
                    <br />
                    {formatFecha(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/conexiones" searchParams={searchParams} />
    </div>
  );
}
