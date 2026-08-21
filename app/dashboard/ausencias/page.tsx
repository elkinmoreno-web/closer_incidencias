import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { AusenciaActions } from '@/components/dashboard/AusenciaActions';
import { Pagination } from '@/components/dashboard/Pagination';
import { NuevaAusenciaModal } from '@/components/dashboard/NuevaAusenciaModal';
import { ExportarAusenciasButton } from '@/components/dashboard/ExportarAusenciasButton';
import { LiveRefresh } from '@/components/dashboard/LiveRefresh';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { VerTextoCompleto } from '@/components/shared/VerTextoCompleto';
import { estadoAusenciaColor, estadoAusenciaLabel, formatFecha, formatFechaCorta } from '@/lib/utils';
import { urlArchivoDrive } from '@/lib/driveUrl';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor, nombreSegunIdioma } from '@/lib/i18n/traducir';

const PAGE_SIZE = 10;

export default async function AusenciasPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const idioma = await resolverIdioma();
  const t = crearTraductor(idioma);
  const ESTADOS = [
    { value: 'pendiente', label: t('admIncidencias.estadoPendiente') },
    { value: 'aprobada', label: t('admIncidencias.estadoAprobada') },
    { value: 'rechazada', label: t('admIncidencias.estadoRechazada') },
  ];

  const supabase = createClient();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('ausencias')
    .select('*, motivos_ausencia(nombre, nombre_en), admins:revisado_por_id(usuario), centros(nombre)', { count: 'exact' })
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

  const [{ data: ausencias, count }, { data: motivosAusencia }, { data: gestores }, zona] =
    await Promise.all([
      query,
      supabase.from('motivos_ausencia').select('*').eq('activo', true).order('nombre'),
      supabase.from('gestores').select('*').order('nombre'),
      ciudadesYCentrosDeMiZona(),
    ]);
  const centros = zona.centros;
  const ciudades = zona.ciudades;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const filas = (ausencias ?? []).map((a) => ({
    ...a,
    archivos: (a.archivo_ids ?? []).map((fileId: string, idx: number) => ({
      name: `${t('admAusencias.justificante')} ${idx + 1}`,
      url: urlArchivoDrive(fileId),
    })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <LiveRefresh table="ausencias" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('admAusencias.titulo')}</h1>
          <p className="text-sm text-ink-muted">
            {count ?? 0} {t('admIncidencias.resultados')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportarAusenciasButton />
          <NuevaAusenciaModal motivos={motivosAusencia ?? []} />
        </div>
      </div>

      <TableFilters
        searchPlaceholder={t('admAusencias.buscarPlaceholder')}
        estados={ESTADOS}
        ciudades={ciudades ?? []}
        centros={centros ?? []}
        motivos={motivosAusencia ?? []}
        motivoLabel={t('admAusencias.colMotivo')}
        gestores={gestores ?? []}
        showDateRange
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {filas.length === 0 ? (
          <EmptyState title={t('admAusencias.sinResultados')} />
        ) : (
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">{t('admAusencias.colRider')}</th>
                <th className="px-4 py-3">{t('admAusencias.colCentro')}</th>
                <th className="px-4 py-3">{t('admAusencias.colMotivo')}</th>
                <th className="px-4 py-3">{t('admAusencias.colRango')}</th>
                <th className="px-4 py-3">{t('admAusencias.colCreado')}</th>
                <th className="px-4 py-3">{t('admAusencias.colJustificantes')}</th>
                <th className="px-4 py-3">{t('admAusencias.colEstado')}</th>
                <th className="px-4 py-3">{t('admAusencias.colGestionadoPor')}</th>
                <th className="px-4 py-3 text-right">{t('admAusencias.colAcciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((a) => {
                const motivo = a.motivos_ausencia as unknown as { nombre: string; nombre_en: string | null } | null;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{a.nombre_rider}</div>
                      <div className="text-xs text-ink-muted">{a.dni}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{(a.centros as unknown as { nombre: string } | null)?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {motivo ? nombreSegunIdioma(idioma, motivo.nombre, motivo.nombre_en) : '—'}
                      {a.estado === 'rechazada' && a.motivo_rechazo && (
                        <div className="mt-1 flex items-start gap-1 rounded bg-red-50 px-2 py-1">
                          <div className="line-clamp-2 text-danger">
                            {t('admAusencias.rechazo')}: {a.motivo_rechazo}
                          </div>
                          {a.motivo_rechazo.length > 80 && <VerTextoCompleto titulo={t('admAusencias.motivoRechazo')} texto={a.motivo_rechazo} />}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {formatFechaCorta(a.fecha_inicio)} → {formatFechaCorta(a.fecha_fin)}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{formatFecha(a.created_at)}</td>
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
                      <Badge className={estadoAusenciaColor(a.estado)}>{estadoAusenciaLabel(a.estado, idioma)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {(a.admins as unknown as { usuario: string } | null)?.usuario ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <AusenciaActions id={a.id} estado={a.estado} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/ausencias" searchParams={searchParams} />
    </div>
  );
}
