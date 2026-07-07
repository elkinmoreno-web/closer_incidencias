import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { NuevaConexionModal } from '@/components/conexiones/NuevaConexionModal';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { Pagination } from '@/components/dashboard/Pagination';
import { formatFechaCorta, formatFecha } from '@/lib/utils';
import { getSignedUrl } from '@/lib/storage';

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

  const [{ data: conexiones, count }, { data: riders }, { data: centros }, { data: ciudades }] = await Promise.all([
    query,
    supabase.from('riders').select('nombre, dni, centros(nombre)').eq('activo', true).order('nombre'),
    supabase.from('centros').select('*').eq('activo', true).order('nombre'),
    supabase.from('ciudades').select('*').order('nombre'),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const filas = await Promise.all(
    (conexiones ?? []).map(async (c) => ({
      ...c,
      screenshotSignedUrl: c.screenshot_url ? await getSignedUrl('conexiones', c.screenshot_url) : null,
    }))
  );

  const ridersParaModal = (riders ?? []).map((r) => ({
    nombre: r.nombre,
    dni: r.dni,
    centro: (r.centros as unknown as { nombre: string } | null)?.nombre ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Conexiones fuera de zona</h1>
          <p className="text-sm text-ink-muted">{count ?? 0} resultado(s)</p>
        </div>
        <NuevaConexionModal riders={ridersParaModal} />
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
