'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { StockMovimiento } from '@/lib/types';
import { ThFiltro, cumpleFiltroTexto, cumpleFiltroNumero, type DireccionOrden, type FiltroColumna } from '@/components/stock/ThFiltro';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import type { Traductor } from '@/lib/i18n/traducir';
import { formatFecha } from '@/lib/utils';
import { ExportarCsvButton } from '@/components/stock/ExportarCsvButton';

type MovimientoConNombres = StockMovimiento & {
  centro_origen_nombre: string | null;
  centro_destino_nombre: string | null;
  admin_usuario: string | null;
  tipo_etiqueta: string;
};

/** Texto de la columna Estado — solo los traslados tienen estado_transito; el resto de tipos queda en blanco (siempre "consumado" al registrarse). */
function textoEstado(mv: MovimientoConNombres, t: Traductor): string | null {
  if (mv.estado_transito === 'en_transito') return t('stock.estadoEnTransito');
  if (mv.estado_transito === 'anulado') return t('stock.estadoAnulado');
  if (mv.estado_transito === 'recibido') {
    const dif = (mv.unidades_recibidas ?? mv.unidades) - mv.unidades;
    if (dif === 0) return t('stock.estadoRecibido');
    return `${t('stock.estadoRecibido')} (${dif > 0 ? '+' : ''}${dif})`;
  }
  return null;
}

/** Observaciones combinadas: las de creación (notas) y las añadidas al confirmar/anular el traslado (notas_recepcion) — mismo criterio que el sistema anterior, que las concatenaba en un único campo visible en el historial. */
function textoObservaciones(mv: MovimientoConNombres): string {
  return [mv.notas, mv.notas_recepcion].filter(Boolean).join(' · ');
}

export function HistorialTab({ movimientos }: { movimientos: MovimientoConNombres[] }) {
  const { t } = useIdioma();

  const [filtrosMov, setFiltrosMov] = useState<Record<string, FiltroColumna>>({});
  const [ordenMov, setOrdenMov] = useState<{ campo: string; dir: DireccionOrden } | null>(null);
  function ordenarMovPor(campo: string, dir: DireccionOrden) {
    setOrdenMov(dir ? { campo, dir } : null);
  }
  function filtrarMovPor(campo: string, f: FiltroColumna | undefined) {
    setFiltrosMov((prev) => {
      const next = { ...prev };
      if (f) next[campo] = f;
      else delete next[campo];
      return next;
    });
  }

  const movimientosFiltrados = useMemo(() => {
    let filas = movimientos.filter((mv) => {
      if (!cumpleFiltroTexto(mv.tipo_etiqueta, filtrosMov.tipo)) return false;
      if (!cumpleFiltroTexto(mv.centro_origen_nombre ?? '', filtrosMov.origen)) return false;
      if (!cumpleFiltroTexto(mv.centro_destino_nombre ?? '', filtrosMov.destino)) return false;
      if (!cumpleFiltroNumero(mv.unidades, filtrosMov.cantidad)) return false;
      if (!cumpleFiltroTexto(mv.rider_nombre_libre ?? '', filtrosMov.rider)) return false;
      if (!cumpleFiltroTexto(mv.admin_usuario ?? '', filtrosMov.registradoPor)) return false;
      return true;
    });
    if (ordenMov) {
      const signo = ordenMov.dir === 'asc' ? 1 : -1;
      filas = [...filas].sort((a, b) => {
        const campo = ordenMov.campo;
        const va = (a as any)[campo] ?? '';
        const vb = (b as any)[campo] ?? '';
        if (typeof va === 'string') return va.localeCompare(vb) * signo;
        return (va - vb) * signo;
      });
    }
    return filas;
  }, [movimientos, filtrosMov, ordenMov]);

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink">{t('stock.historial')}</h2>
        <ExportarCsvButton
          nombreArchivo="historial_movimientos"
          filas={movimientosFiltrados.map((mv) => ({
            Fecha: formatFecha(mv.created_at),
            Tipo: mv.tipo_etiqueta,
            Origen: mv.centro_origen_nombre ?? '',
            Destino: mv.centro_destino_nombre ?? '',
            Cantidad: mv.unidades,
            Rider: mv.rider_nombre_libre ?? '',
            'Registrado por': mv.admin_usuario ?? '',
            Estado: textoEstado(mv, t) ?? '',
            Observaciones: textoObservaciones(mv),
          }))}
        />
      </div>
      {movimientos.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t('stock.sinMovimientos')}</p>
      ) : movimientosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-ink-muted">
          <p>{t('stock.sinCoincidencias')}</p>
          <button onClick={() => setFiltrosMov({})} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <X size={12} />
            {t('stock.limpiarFiltros')}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">{t('stock.colFecha')}</th>
                <ThFiltro label={t('stock.colTipo')} ordenActivo={ordenMov?.campo === 'tipo_etiqueta' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('tipo_etiqueta', d)} filtro={filtrosMov.tipo} onFiltrar={(f) => filtrarMovPor('tipo', f)} />
                <ThFiltro label={t('stock.colOrigen')} ordenActivo={ordenMov?.campo === 'centro_origen_nombre' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('centro_origen_nombre', d)} filtro={filtrosMov.origen} onFiltrar={(f) => filtrarMovPor('origen', f)} />
                <ThFiltro label={t('stock.colDestino')} ordenActivo={ordenMov?.campo === 'centro_destino_nombre' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('centro_destino_nombre', d)} filtro={filtrosMov.destino} onFiltrar={(f) => filtrarMovPor('destino', f)} />
                <ThFiltro label={t('stock.colCantidad')} align="right" tipo="numero" ordenActivo={ordenMov?.campo === 'unidades' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('unidades', d)} filtro={filtrosMov.cantidad} onFiltrar={(f) => filtrarMovPor('cantidad', f)} />
                <ThFiltro label={t('stock.colRider')} ordenActivo={ordenMov?.campo === 'rider_nombre_libre' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('rider_nombre_libre', d)} filtro={filtrosMov.rider} onFiltrar={(f) => filtrarMovPor('rider', f)} />
                <ThFiltro label={t('stock.colRegistradoPor')} ordenActivo={ordenMov?.campo === 'admin_usuario' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('admin_usuario', d)} filtro={filtrosMov.registradoPor} onFiltrar={(f) => filtrarMovPor('registradoPor', f)} />
                <th className="px-3 py-2">{t('stock.colEstado')}</th>
                <th className="px-3 py-2">{t('stock.colObservaciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movimientosFiltrados.map((mv) => {
                const estado = textoEstado(mv, t);
                return (
                  <tr key={mv.id}>
                    <td className="px-3 py-2 text-xs text-ink-muted">{formatFecha(mv.created_at)}</td>
                    <td className="px-3 py-2 text-xs">{mv.tipo_etiqueta}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{mv.centro_origen_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{mv.centro_destino_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{mv.unidades}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{mv.rider_nombre_libre ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{mv.admin_usuario ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {estado && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            mv.estado_transito === 'en_transito'
                              ? 'bg-amber-50 text-amber-700'
                              : mv.estado_transito === 'anulado'
                                ? 'bg-red-50 text-danger'
                                : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {estado}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2 text-xs text-ink-muted">{textoObservaciones(mv) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
