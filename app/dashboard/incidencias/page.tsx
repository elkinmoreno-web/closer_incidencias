import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FiltersBar } from '@/components/dashboard/FiltersBar';
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
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(
      `nombre_rider.ilike.%${q}%,codigo_pedido.ilike.%${q}%,dni.ilike.%${q}%,observaciones.ilike.%${q}%`
    );
  }

  const [{ data: incidencias, count }, { data: centros }, { data: motivos }, { data: riders }] = await Promise.all([
    query,
    supabase.from('centros').select('*').eq('activo', true).order('nombre'),
    supabase.from('motivos').select('*').eq('activo', true).order('nombre'),
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

      <FiltersBar centros={centros ?? []} motivos={motivos ?? []} />

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
                      {!i.screenshotSignedUrl && !i.evidenciaSignedUrl && '—'}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
            <Link
              key={p}
              href={`/dashboard/incidencias?${new URLSearchParams({ ...searchParams, page: String(p) } as Record<string, string>).toString()}`}
              className={`rounded-full px-3 py-1.5 ${
                p === page ? 'bg-primary text-white' : 'text-ink-muted hover:bg-surface'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
