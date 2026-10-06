import { createClient } from '@/lib/supabase/server';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { Pagination } from '@/components/dashboard/Pagination';
import { ReclamacionActions } from '@/components/dashboard/ReclamacionActions';
import { ExportarReclamacionesButton } from '@/components/dashboard/ExportarReclamacionesButton';
import { formatFecha } from '@/lib/utils';
import { VerTextoCompleto } from '@/components/shared/VerTextoCompleto';
import { AvisoRrhhButton } from '@/components/dashboard/AvisoRrhhButton';
import { CORREOS_AVISO_RRHH } from '@/lib/utils';
import { getAdminActual } from '@/lib/supabase/server';
import { urlArchivoDrive } from '@/lib/driveUrl';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor, nombreSegunIdioma } from '@/lib/i18n/traducir';
import type { EstadoReclamacion } from '@/lib/types';
import { exigirModuloAdmin } from '@/lib/modulos';

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
  // Solo RRHH ve el botón de avisar al gestor (la acción lo comprueba otra vez).
  const yo = await getAdminActual();
  const puedeAvisarRrhh = !!yo?.email && CORREOS_AVISO_RRHH.includes(yo.email);

  // El super admin puede apagar este módulo desde Configuración.
  // Esconderlo del menú no basta: sin esto se entraría por la URL.
  await exigirModuloAdmin('reclamaciones');

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
          // 7 columnas, no 12: con todo en su propia columna la tabla pedía
          // 1.200 px y obligaba a hacer scroll horizontal. Lo que va junto
          // (centro con el rider, mes con el concepto, importes con su vía de
          // pago, revisor con el estado) se agrupa en la misma celda.
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-3">{t('admIncidencias.colRider')}</th>
                <th className="px-3 py-3">{t('admReclamaciones.colConcepto')}</th>
                <th className="px-3 py-3 text-right">{t('admReclamaciones.colImporte')}</th>
                <th className="px-3 py-3">{t('admReclamaciones.colNomina')}</th>
                <th className="px-3 py-3">{t('admIncidencias.colEstado')}</th>
                <th className="px-3 py-3">{t('admReclamaciones.colRespuesta')}</th>
                <th className="px-3 py-3 text-right">{t('admIncidencias.colAcciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((r: any) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-ink">{r.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{r.dni}</div>
                    <div className="text-xs text-ink-muted">{r.centros?.nombre ?? '—'}</div>
                    <div className="text-xs text-ink-muted">{formatFecha(r.created_at)}</div>
                  </td>
                  <td className="max-w-[18rem] px-3 py-3">
                    <div className="font-medium text-ink">
                      {r.motivos_reclamacion
                        ? nombreSegunIdioma(idioma, r.motivos_reclamacion.nombre, r.motivos_reclamacion.nombre_en)
                        : '—'}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {t('admReclamaciones.colPeriodo')}: {String(r.periodo).slice(0, 7)}
                    </div>
                    {r.comentario && (
                      <>
                        <div className="mt-1 line-clamp-2 text-xs text-ink-muted">{r.comentario}</div>
                        {r.comentario.length > 90 && (
                          <VerTextoCompleto titulo={t('admReclamaciones.colConcepto')} texto={r.comentario} />
                        )}
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <div className="font-medium">
                      {r.importe === null ? '—' : `${Number(r.importe).toFixed(2).replace('.', ',')} €`}
                    </div>
                    {r.importe_aprobado !== null && (
                      <div className="text-xs font-semibold text-emerald-700">
                        {t('admReclamaciones.colImporteAprobado')}: {Number(r.importe_aprobado).toFixed(2).replace('.', ',')} €
                      </div>
                    )}
                    {r.via_pago && (
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          r.via_pago === 'primera_remesa' ? 'bg-violet-100 text-violet-800' : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {r.via_pago === 'primera_remesa' ? t('accReclamacion.primeraRemesa') : t('accReclamacion.siguienteNomina')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
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
                            className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                          >
                            {t('admReclamaciones.verNomina')} {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[r.estado as EstadoReclamacion]}`}
                    >
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
                    {/* Quién la resolvió va con el estado, y siempre se ve: antes
                        solo aparecía debajo de la respuesta escrita. */}
                    {r.admins?.usuario && (
                      <div className="mt-1 text-xs">
                        <div className="font-medium text-ink">{r.admins.usuario}</div>
                        {r.fecha_gestion && <div className="text-ink-muted">{formatFecha(r.fecha_gestion)}</div>}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[14rem] px-3 py-3 text-xs">
                    {r.respuesta ? (
                      <>
                        <div className="line-clamp-2 text-ink">{r.respuesta}</div>
                        {r.respuesta.length > 70 && (
                          <VerTextoCompleto titulo={t('admReclamaciones.colRespuesta')} texto={r.respuesta} />
                        )}
                      </>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                    {puedeAvisarRrhh && <AvisoRrhhButton id={r.id} gestor={r.admins?.usuario ?? null} />}
                    <ReclamacionActions
                      id={r.id}
                      estado={r.estado}
                      respuesta={r.respuesta}
                      importe={r.importe === null ? null : Number(r.importe)}
                      importeAprobado={r.importe_aprobado === null ? null : Number(r.importe_aprobado)}
                      viaPago={r.via_pago}
                    />
                    </div>
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
