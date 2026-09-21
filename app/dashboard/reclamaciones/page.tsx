import { createClient } from '@/lib/supabase/server';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { Pagination } from '@/components/dashboard/Pagination';
import { ReclamacionActions } from '@/components/dashboard/ReclamacionActions';
import { ExportarReclamacionesButton } from '@/components/dashboard/ExportarReclamacionesButton';
import { formatFecha } from '@/lib/utils';
import { urlArchivoDrive } from '@/lib/driveUrl';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor, nombreSegunIdioma } from '@/lib/i18n/traducir';
import type { EstadoReclamacion } from '@/lib/types';

const PAGE_SIZE = 20;

const COLOR_ESTADO: Record<EstadoReclamacion, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  en_tramite: 'bg-sky-100 text-sky-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-red-100 text-red-800',
  papelera: 'bg-slate-200 text-slate-600',
};

export default async function ReclamacionesPage({
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

  let query = supabase
    .from('reclamaciones')
    .select(
      '*, centros(id, nombre), motivos_reclamacion(id, nombre, nombre_en), admins:revisado_por_id(usuario)',
      { count: 'exact' }
    )
    // Las enviadas a la papelera se ven (y se recuperan) en /dashboard/papelera.
    .neq('estado', 'papelera')
    // Las pendientes arriba: son las únicas sobre las que hay que hacer algo.
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchParams.estado) query = query.eq('estado', searchParams.estado);
  if (searchParams.centro) query = query.eq('centro_id', Number(searchParams.centro));
  if (searchParams.motivo) query = query.eq('motivo_id', Number(searchParams.motivo));
  // El periodo llega como aaaa-mm y en la tabla es el día 1 de ese mes.
  if (searchParams.periodo) query = query.eq('periodo', `${searchParams.periodo}-01`);
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
  }
  if (searchParams.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(searchParams.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const [{ data: reclamaciones, count }, { data: motivos }, zona] = await Promise.all([
    query,
    supabase.from('motivos_reclamacion').select('id, nombre, nombre_en').eq('activo', true).order('orden'),
    ciudadesYCentrosDeMiZona(),
  ]);

  const filas = reclamaciones ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Suma de lo reclamado en la página visible. No es el total del filtro
  // entero — eso exigiría una segunda consulta — así que se etiqueta como
  // lo que es para no confundir a quien lo lea.
  const totalPagina = filas.reduce((acc, r) => acc + Number(r.importe ?? 0), 0);

  const estados = [
    { value: 'pendiente', label: t('reclamacion.estadoPendiente') },
    { value: 'en_tramite', label: t('reclamacion.estadoEnTramite') },
    { value: 'aprobada', label: t('reclamacion.estadoAprobada') },
    { value: 'rechazada', label: t('reclamacion.estadoRechazada') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('admReclamaciones.titulo')}</h1>
          <p className="text-sm text-ink-muted">
            {count ?? 0} {t('admIncidencias.resultados')}
            {totalPagina > 0 && ` · ${t('admReclamaciones.totalReclamado')} (${filas.length}): ${totalPagina.toFixed(2).replace('.', ',')} €`}
          </p>
        </div>
        <ExportarReclamacionesButton />
      </div>

      <TableFilters
        searchPlaceholder={t('admReclamaciones.buscarPlaceholder')}
        estados={estados}
        motivos={motivos ?? []}
        motivoLabel={t('admReclamaciones.colConcepto')}
        ciudades={zona.ciudades ?? []}
        centros={zona.centros ?? []}
        showMonth
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {filas.length === 0 ? (
          <EmptyState title={t('admReclamaciones.sinResultadosTitulo')} description={t('admReclamaciones.sinResultadosDesc')} />
        ) : (
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">{t('admIncidencias.colRider')}</th>
                <th className="px-4 py-3">{t('admIncidencias.colCentro')}</th>
                <th className="px-4 py-3">{t('admReclamaciones.colPeriodo')}</th>
                <th className="px-4 py-3">{t('admReclamaciones.colConcepto')}</th>
                <th className="px-4 py-3 text-right">{t('admReclamaciones.colImporte')}</th>
                <th className="px-4 py-3 text-right">{t('admReclamaciones.colImporteAprobado')}</th>
                <th className="px-4 py-3">{t('admReclamaciones.colViaPago')}</th>
                <th className="px-4 py-3">{t('admReclamaciones.colNomina')}</th>
                <th className="px-4 py-3">{t('admIncidencias.colEstado')}</th>
                <th className="px-4 py-3">{t('admReclamaciones.colRespuesta')}</th>
                <th className="px-4 py-3 text-right">{t('admIncidencias.colAcciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((r: any) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{r.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{r.dni}</div>
                    <div className="text-xs text-ink-muted">{formatFecha(r.created_at)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.centros?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{String(r.periodo).slice(0, 7)}</td>
                  <td className="px-4 py-3">
                    {r.motivos_reclamacion
                      ? nombreSegunIdioma(idioma, r.motivos_reclamacion.nombre, r.motivos_reclamacion.nombre_en)
                      : '—'}
                    {r.comentario && <div className="mt-0.5 text-xs text-ink-muted">{r.comentario}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {r.importe === null ? '—' : `${Number(r.importe).toFixed(2).replace('.', ',')} €`}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                    {r.importe_aprobado === null ? '—' : `${Number(r.importe_aprobado).toFixed(2).replace('.', ',')} €`}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.via_pago === 'primera_remesa' ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-800">
                        {t('accReclamacion.primeraRemesa')}
                      </span>
                    ) : r.via_pago === 'siguiente_nomina' ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-800">
                        {t('accReclamacion.siguienteNomina')}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(r.archivo_ids ?? []).length === 0 ? (
                      <span className="text-xs text-ink-muted">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {(r.archivo_ids as string[]).map((id, i) => (
                          <a
                            key={id}
                            href={urlArchivoDrive(id) ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {t('admReclamaciones.verNomina')} {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[r.estado as EstadoReclamacion]}`}>
                      {t(
                        r.estado === 'aprobada'
                          ? 'reclamacion.estadoAprobada'
                          : r.estado === 'rechazada'
                            ? 'reclamacion.estadoRechazada'
                            : r.estado === 'en_tramite'
                              ? 'reclamacion.estadoEnTramite'
                              : 'reclamacion.estadoPendiente'
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.respuesta ? (
                      <>
                        <div className="max-w-[16rem] text-ink">{r.respuesta}</div>
                        {r.admins?.usuario && (
                          <div className="mt-0.5 text-ink-muted">— {r.admins.usuario}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ReclamacionActions
                      id={r.id}
                      estado={r.estado}
                      respuesta={r.respuesta}
                      importe={r.importe === null ? null : Number(r.importe)}
                      importeAprobado={r.importe_aprobado === null ? null : Number(r.importe_aprobado)}
                      viaPago={r.via_pago}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/reclamaciones" searchParams={searchParams} />
    </div>
  );
}
