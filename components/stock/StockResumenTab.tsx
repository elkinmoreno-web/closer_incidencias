'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { StockDisponible, StockMaterial } from '@/lib/types';
import { KpiCards } from '@/components/stock/KpiCards';
import { FichaCentroModal } from '@/components/stock/FichaCentroModal';
import { ThFiltro, cumpleFiltroTexto, cumpleFiltroNumero, type DireccionOrden, type FiltroColumna } from '@/components/stock/ThFiltro';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { ORDEN_URGENCIA_SEMAFORO } from '@/lib/stockSemaforo';
import { ExportarCsvButton } from '@/components/stock/ExportarCsvButton';

export function StockResumenTab({ stock, material }: { stock: StockDisponible[]; material: StockMaterial }) {
  const { t } = useIdioma();
  const [fichaAbierta, setFichaAbierta] = useState<StockDisponible | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [stockMenorQue, setStockMenorQue] = useState('');

  const [filtrosStock, setFiltrosStock] = useState<Record<string, FiltroColumna>>({});
  const [ordenStock, setOrdenStock] = useState<{ campo: string; dir: DireccionOrden } | null>(null);
  function ordenarStockPor(campo: string, dir: DireccionOrden) {
    setOrdenStock(dir ? { campo, dir } : null);
  }
  function filtrarStockPor(campo: string, f: FiltroColumna | undefined) {
    setFiltrosStock((prev) => {
      const next = { ...prev };
      if (f) next[campo] = f;
      else delete next[campo];
      return next;
    });
  }

  const gestoresDisponibles = useMemo(
    () => Array.from(new Set(stock.map((s) => s.gestor).filter((g): g is string => !!g))).sort((a, b) => a.localeCompare(b)),
    [stock]
  );

  const stockFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const umbral = stockMenorQue.trim() ? Number(stockMenorQue) : null;
    let filas = stock.filter((s) => {
      if (q && !s.centro_nombre.toLowerCase().includes(q) && !(s.gestor ?? '').toLowerCase().includes(q)) return false;
      if (umbral !== null && !(s.disponible < umbral)) return false;
      if (!cumpleFiltroTexto(s.centro_nombre, filtrosStock.centro)) return false;
      if (!cumpleFiltroNumero(s.disponible, filtrosStock.disponible)) return false;
      if (!cumpleFiltroNumero(s.transito_entrante, filtrosStock.transito)) return false;
      if (!cumpleFiltroNumero(s.en_calle, filtrosStock.enCalle)) return false;
      if (!cumpleFiltroNumero(s.merma, filtrosStock.merma)) return false;
      if (!cumpleFiltroNumero(s.perdida, filtrosStock.perdida)) return false;
      if (!cumpleFiltroTexto(s.gestor ?? '', filtrosStock.gestor)) return false;
      return true;
    });

    if (ordenStock) {
      const signo = ordenStock.dir === 'asc' ? 1 : -1;
      filas = [...filas].sort((a, b) => {
        const campo = ordenStock.campo;
        const va = campo === 'centro' ? a.centro_nombre : campo === 'gestor' ? a.gestor ?? '' : (a as any)[campo] ?? 0;
        const vb = campo === 'centro' ? b.centro_nombre : campo === 'gestor' ? b.gestor ?? '' : (b as any)[campo] ?? 0;
        if (typeof va === 'string') return va.localeCompare(vb) * signo;
        return (va - vb) * signo;
      });
    } else {
      filas = [...filas].sort((a, b) => {
        const ua = a.semaforo ? ORDEN_URGENCIA_SEMAFORO[a.semaforo] : 9;
        const ub = b.semaforo ? ORDEN_URGENCIA_SEMAFORO[b.semaforo] : 9;
        if (ua !== ub) return ua - ub;
        return a.centro_nombre.localeCompare(b.centro_nombre);
      });
    }
    return filas;
  }, [stock, busqueda, stockMenorQue, filtrosStock, ordenStock]);

  const hayFiltrosActivos = busqueda || stockMenorQue || Object.keys(filtrosStock).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <KpiCards stock={stock} />

      <div className="rounded-card border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">{t('stock.stockPorCentro')}</h2>
          <div className="flex items-center gap-2">
            {hayFiltrosActivos && (
              <button
                onClick={() => {
                  setBusqueda('');
                  setStockMenorQue('');
                  setFiltrosStock({});
                }}
                className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-primary"
              >
                <X size={12} />
                {t('stock.limpiarFiltros')}
              </button>
            )}
            <ExportarCsvButton
              nombreArchivo="stock_por_centro"
              filas={stockFiltrado.map((s) => ({
                Centro: s.centro_nombre,
                Gestor: s.gestor ?? '',
                Disponible: s.disponible,
                'En camino': s.transito_entrante,
                'Con riders': s.en_calle,
                Rotas: s.merma,
                Perdidas: s.perdida,
                Estado: s.semaforo ?? '',
              }))}
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('stock.buscarPlaceholder')}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <input
            type="number"
            value={stockMenorQue}
            onChange={(e) => setStockMenorQue(e.target.value)}
            placeholder={t('stock.stockMenorQue')}
            className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        {stockFiltrado.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{stock.length === 0 ? t('stock.sinStock') : t('stock.sinCoincidencias')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <tr>
                  <ThFiltro label={t('stock.colCentro')} ordenActivo={ordenStock?.campo === 'centro' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('centro', d)} filtro={filtrosStock.centro} onFiltrar={(f) => filtrarStockPor('centro', f)} />
                  <ThFiltro
                    label={t('stock.colGestor')}
                    tipo="select"
                    opciones={gestoresDisponibles.map((g) => [g, g] as [string, string])}
                    ordenActivo={ordenStock?.campo === 'gestor' ? ordenStock.dir : null}
                    onOrdenar={(d) => ordenarStockPor('gestor', d)}
                    filtro={filtrosStock.gestor}
                    onFiltrar={(f) => filtrarStockPor('gestor', f)}
                  />
                  <ThFiltro label={t('stock.colDisponible')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'disponible' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('disponible', d)} filtro={filtrosStock.disponible} onFiltrar={(f) => filtrarStockPor('disponible', f)} />
                  <ThFiltro label={t('stock.colEnCamino')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'transito_entrante' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('transito_entrante', d)} filtro={filtrosStock.transito} onFiltrar={(f) => filtrarStockPor('transito', f)} />
                  <ThFiltro label={t('stock.colEnCalle')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'en_calle' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('en_calle', d)} filtro={filtrosStock.enCalle} onFiltrar={(f) => filtrarStockPor('enCalle', f)} />
                  <ThFiltro label={t('stock.colMerma')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'merma' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('merma', d)} filtro={filtrosStock.merma} onFiltrar={(f) => filtrarStockPor('merma', f)} />
                  <ThFiltro label={t('stock.colPerdida')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'perdida' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('perdida', d)} filtro={filtrosStock.perdida} onFiltrar={(f) => filtrarStockPor('perdida', f)} />
                  {material.tiene_tallas && <th className="px-3 py-2 text-right">{t('stock.colTallas')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stockFiltrado.map((s) => {
                  return (
                    <tr key={s.centro_id} className={s.semaforo === 'NEGATIVO' || s.semaforo === 'ROTURA' || s.semaforo === 'CRITICO' ? 'bg-red-50/40' : ''}>
                      <td className="px-3 py-2">
                        <button onClick={() => setFichaAbierta(s)} className="font-medium text-ink hover:text-primary hover:underline">
                          {s.centro_nombre}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{s.gestor ?? '—'}</td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${s.disponible < 0 ? 'text-danger' : ''}`}>{s.disponible}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-muted">{s.transito_entrante || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-muted">{s.en_calle || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-muted">{s.merma || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-muted">{s.perdida || '—'}</td>
                      {material.tiene_tallas && (
                        <td className="px-3 py-2 text-right font-mono text-xs text-ink-muted">
                          {s.talla_m} / {s.talla_l} / {s.talla_xl} / {s.talla_xxl}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fichaAbierta && <FichaCentroModal fila={fichaAbierta} onCerrar={() => setFichaAbierta(null)} />}
    </div>
  );
}
