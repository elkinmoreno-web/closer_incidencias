import { createClient } from '@/lib/supabase/server';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { Pagination } from '@/components/dashboard/Pagination';
import { IncidenciaActions } from '@/components/dashboard/IncidenciaActions';
import { EditIncidenciaModal } from '@/components/dashboard/EditIncidenciaModal';
import { NuevaIncidenciaModal } from '@/components/dashboard/NuevaIncidenciaModal';
import { LiveRefresh } from '@/components/dashboard/LiveRefresh';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { estadoIncidenciaColor, estadoIncidenciaLabel, formatFecha } from '@/lib/utils';
import { getSignedUrl } from '@/lib/storage';
import type { Incidencia } from '@/lib/types';

const PAGE_SIZE = 10;

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
];

export default async function IncidenciasPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const supabase = createClient();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('incidencias')
    .select('*, centros(nombre), motivos(nombre), admins:gestor_id(usuario)', { count: 'exact' })
    .neq('estado', 'papelera')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  if (searchParams.centro) query = query.eq('centro_id', Number(searchParams.centro));
  if (searchParams.motivo) query = query.eq('motivo_id', Number(searchParams.motivo));
  if (searchParams.desde) query = query.gte('created_at', `${searchParams.desde}T00:00:00`);
  if (searchParams.hasta) query = query.lte('created_at', `${searchParams.hasta}T23:59:59`);
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(
      `nombre_rider.ilike.%${q}%,codigo_pedido.ilike.%${q}%,dni.ilike.%${q}%,observaciones.ilike.%${q}%`
    );
  }

  // El filtro por ciudad se resuelve antes: sacamos los centros de esa
  // ciudad y filtramos por esos IDs (PostgREST no filtra directo por una
  // columna de una relación anidada sin usar joins internos).
  if (searchParams.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(searchParams.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }
  if (searchParams.gestor) {
    const { data: ciudadesDelGestor } = await supabase.from('gestor_ciudades').select('ciudad_id').eq('gestor_id', Number(searchParams.gestor));
    const idsCiudad = (ciudadesDelGestor ?? []).map((c) => c.ciudad_id);
    const { data: centrosDelGestor } = await supabase.from('centros').select('id').in('ciudad_id', idsCiudad);
    query = query.in('centro_id', (centrosDelGestor ?? []).map((c) => c.id));
  }

  const [{ data: incidencias, count }, { data: centros }, { data: motivos }, { data: ciudades }, { data: gestores }, { data: riders }] =
    await Promise.all([
      query,
      supabase.from('centros').select('*').eq('activo', true).order('nombre'),
      supabase.from('motivos').select('*').eq('activo', true).order('nombre'),
      supabase.from('ciudades').select('*').order('nombre'),
      supabase.from('gestores').select('*').order('nombre'),
      supabase.from('riders').select('nombre, dni').eq('activo', true).order('nombre'),
    ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const filas = await Promise.all(
    ((incidencias ?? []) as unknown as (Incidencia & {
      centros: { nombre: string } | null;
      motivos: { nombre: string } | null;
      admins: { usuario: string } | null;
    })[]).map(async (i) => ({
      ...i,
      screenshotSignedUrl: i.screenshot_url ? await getSignedUrl('incidencias', i.screenshot_url) : null,
      evidenciaSignedUrl: i.evidencia_url ? await getSignedUrl('incidencias', i.evidencia_url) : null,
    }))
  );

  return (
    <div className="flex flex-col gap-4">
      <LiveRefresh table="incidencias" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Incidencias</h1>
          <p className="text-sm text-ink-muted">{count ?? 0} resultado(s)</p>
        </div>
        <NuevaIncidenciaModal riders={riders ?? []} motivos={motivos ?? []} />
      </div>

      <TableFilters
        searchPlaceholder="Buscar rider, DNI o código..."
        estados={ESTADOS}
        ciudades={ciudades ?? []}
        centros={centros ?? []}
        motivos={motivos ?? []}
        gestores={gestores ?? []}
        showDateRange
      />

      <div className="table-scroll overflow-x-auto rounded-card border border-border bg-surface">
        {filas.length === 0 ? (
          <EmptyState title="No hay incidencias con estos filtros" description="Prueba a ampliar la búsqueda." />
        ) : (
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Centro</th>
                <th className="px-4 py-3">Evidencia</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Gestionado por</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{i.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{i.dni}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <div>{i.motivos?.nombre ?? '—'}</div>
                    {i.observaciones && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{i.observaciones}</div>
                    )}
                    {i.estado === 'rechazada' && i.motivo_rechazo && (
                      <div className="mt-1 line-clamp-2 rounded bg-red-50 px-2 py-1 text-xs text-danger">
                        Rechazo: {i.motivo_rechazo}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{i.codigo_pedido || '—'}</td>
                  <td className="px-4 py-3">{i.centros?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    <div className="flex flex-col gap-1">
                      {i.screenshotSignedUrl && (
                        <a href={i.screenshotSignedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Ver captura
                        </a>
                      )}
                      {i.evidenciaSignedUrl && (
                        <a href={i.evidenciaSignedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Ver evidencia
                        </a>
                      )}
                      {!i.screenshotSignedUrl && !i.evidenciaSignedUrl &&
                        (i.archivos_purgados ? (
                          <span className="text-ink-muted" title="Los archivos se borran automáticamente tras 2 meses">
                            Archivo eliminado por antigüedad
                          </span>
                        ) : (
                          '—'
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{formatFecha(i.created_at)}</td>
                  <td className="px-4 py-3">
                    <Badge className={estadoIncidenciaColor(i.estado)}>{estadoIncidenciaLabel(i.estado)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {i.admins?.usuario ? (
                      <>
                        {i.admins.usuario}
                        <br />
                        {formatFecha(i.fecha_gestion)}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <EditIncidenciaModal incidencia={i} centros={centros ?? []} motivos={motivos ?? []} />
                      <IncidenciaActions id={i.id} estado={i.estado} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/incidencias" searchParams={searchParams} />
    </div>
  );
}
