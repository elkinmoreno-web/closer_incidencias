import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { AusenciaActions } from '@/components/dashboard/AusenciaActions';
import { Pagination } from '@/components/dashboard/Pagination';
import { NuevaAusenciaModal } from '@/components/dashboard/NuevaAusenciaModal';
import { LiveRefresh } from '@/components/dashboard/LiveRefresh';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { estadoAusenciaColor, estadoAusenciaLabel, formatFechaCorta } from '@/lib/utils';
import { listSignedUrls } from '@/lib/storage';

const PAGE_SIZE = 10;

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
];

export default async function AusenciasPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const supabase = createClient();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('ausencias')
    .select('*, motivos_ausencia(nombre), admins:revisado_por_id(usuario), centros(nombre)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  if (searchParams.centro) query = query.eq('centro_id', Number(searchParams.centro));
  if (searchParams.motivo) query = query.eq('motivo_id', Number(searchParams.motivo));
  if (searchParams.desde) query = query.gte('fecha_inicio', searchParams.desde);
  if (searchParams.hasta) query = query.lte('fecha_inicio', searchParams.hasta);
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
  }
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

  const [{ data: ausencias, count }, { data: riders }, { data: motivosAusencia }, { data: gestores }, zona] =
    await Promise.all([
      query,
      supabase.from('riders').select('nombre, dni').eq('activo', true).order('nombre'),
      supabase.from('motivos_ausencia').select('*').eq('activo', true).order('nombre'),
      supabase.from('gestores').select('*').order('nombre'),
      ciudadesYCentrosDeMiZona(),
    ]);
  const centros = zona.centros;
  const ciudades = zona.ciudades;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const filas = await Promise.all(
    (ausencias ?? []).map(async (a) => ({
      ...a,
      archivos: a.storage_prefix ? await listSignedUrls('ausencias', a.storage_prefix) : [],
    }))
  );

  return (
    <div className="flex flex-col gap-4">
      <LiveRefresh table="ausencias" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Ausencias</h1>
          <p className="text-sm text-ink-muted">{count ?? 0} resultado(s)</p>
        </div>
        <NuevaAusenciaModal riders={riders ?? []} motivos={motivosAusencia ?? []} />
      </div>

      <TableFilters
        searchPlaceholder="Buscar rider o DNI..."
        estados={ESTADOS}
        ciudades={ciudades ?? []}
        centros={centros ?? []}
        motivos={motivosAusencia ?? []}
        motivoLabel="motivo"
        gestores={gestores ?? []}
        showDateRange
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {filas.length === 0 ? (
          <EmptyState title="No hay ausencias con estos filtros" />
        ) : (
          <table className="w-full min-w-[950px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Centro</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Rango</th>
                <th className="px-4 py-3">Justificantes</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Gestionado por</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{a.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{a.dni}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{(a.centros as unknown as { nombre: string } | null)?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {(a.motivos_ausencia as unknown as { nombre: string } | null)?.nombre ?? '—'}
                    {a.estado === 'rechazada' && a.motivo_rechazo && (
                      <div className="mt-1 rounded bg-red-50 px-2 py-1 text-danger">Rechazo: {a.motivo_rechazo}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {formatFechaCorta(a.fecha_inicio)} → {formatFechaCorta(a.fecha_fin)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.archivos.length === 0 ? (
                      '—'
                    ) : (
                      <div className="flex flex-col gap-1">
                        {a.archivos.map((f: { name: string; url: string | null }) =>
                          f.url ? (
                            <a key={f.name} href={f.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {f.name}
                            </a>
                          ) : (
                            <span key={f.name}>{f.name}</span>
                          )
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={estadoAusenciaColor(a.estado)}>{estadoAusenciaLabel(a.estado)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {(a.admins as unknown as { usuario: string } | null)?.usuario ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <AusenciaActions id={a.id} estado={a.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/ausencias" searchParams={searchParams} />
    </div>
  );
}
