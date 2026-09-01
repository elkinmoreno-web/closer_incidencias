'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Plus, Search, X } from 'lucide-react';
import {
  obtenerStockDisponible,
  listarMovimientosRecientes,
  listarTiposMovimiento,
  obtenerParametrosStock,
} from '@/app/dashboard/stock/actions';
import type { StockMaterial, StockDisponible, StockMovimiento, StockTipoMovimiento, StockParametros } from '@/lib/types';
import type { Centro } from '@/lib/types';
import { NuevoMovimientoModal } from '@/components/stock/NuevoMovimientoModal';
import { ImportarStockModal } from '@/components/stock/ImportarStockModal';
import { KpiCards } from '@/components/stock/KpiCards';
import { FichaCentroModal } from '@/components/stock/FichaCentroModal';
import { ParametrosStockPanel } from '@/components/stock/ParametrosStockPanel';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { formatFecha } from '@/lib/utils';
import { calcularSemaforo, ETIQUETA_SEMAFORO, ORDEN_URGENCIA_SEMAFORO } from '@/lib/stockSemaforo';

type MovimientoConNombres = StockMovimiento & {
  centro_origen_nombre: string | null;
  centro_destino_nombre: string | null;
  admin_usuario: string | null;
  tipo_etiqueta: string;
};

export function StockPanel({ materiales, centros, esSuperAdmin }: { materiales: StockMaterial[]; centros: Centro[]; esSuperAdmin: boolean }) {
  const { t, idioma } = useIdioma();
  const [materialActivo, setMaterialActivo] = useState<number | null>(materiales[0]?.id ?? null);
  const [stockCrudo, setStockCrudo] = useState<StockDisponible[]>([]);
  const [parametros, setParametros] = useState<StockParametros | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoConNombres[]>([]);
  const [tipos, setTipos] = useState<StockTipoMovimiento[]>([]);
  const [cargando, startCarga] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState<StockDisponible | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [gestorFiltro, setGestorFiltro] = useState('');
  const [stockMenorQue, setStockMenorQue] = useState('');

  function recargar(materialId: number) {
    startCarga(async () => {
      const [s, m, p] = await Promise.all([obtenerStockDisponible(materialId), listarMovimientosRecientes(materialId), obtenerParametrosStock()]);
      setStockCrudo(s);
      setMovimientos(m);
      setParametros(p);
    });
  }

  useEffect(() => {
    listarTiposMovimiento().then(setTipos);
  }, []);

  useEffect(() => {
    if (materialActivo !== null) recargar(materialActivo);
  }, [materialActivo]);

  const material = materiales.find((m) => m.id === materialActivo);

  // El semáforo se calcula en el cliente (no en el servidor) para que
  // ajustar filtros/parámetros sea instantáneo sin volver a consultar
  // la base cada vez.
  const stock = useMemo(() => (parametros ? stockCrudo.map((f) => calcularSemaforo(f, parametros)) : stockCrudo), [stockCrudo, parametros]);

  const gestoresDisponibles = useMemo(
    () => Array.from(new Set(stock.map((s) => s.gestor).filter((g): g is string => !!g))).sort((a, b) => a.localeCompare(b)),
    [stock]
  );

  const stockFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const umbral = stockMenorQue.trim() ? Number(stockMenorQue) : null;
    return stock
      .filter((s) => {
        if (q && !s.centro_nombre.toLowerCase().includes(q) && !(s.gestor ?? '').toLowerCase().includes(q)) return false;
        if (gestorFiltro && s.gestor !== gestorFiltro) return false;
        if (umbral !== null && !(s.disponible < umbral)) return false;
        return true;
      })
      .sort((a, b) => {
        const ua = a.semaforo ? ORDEN_URGENCIA_SEMAFORO[a.semaforo] : 9;
        const ub = b.semaforo ? ORDEN_URGENCIA_SEMAFORO[b.semaforo] : 9;
        if (ua !== ub) return ua - ub;
        return a.centro_nombre.localeCompare(b.centro_nombre);
      });
  }, [stock, busqueda, gestorFiltro, stockMenorQue]);

  const hayFiltrosActivos = busqueda || gestorFiltro || stockMenorQue;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full bg-bg p-1">
          {materiales.map((m) => (
            <button
              key={m.id}
              onClick={() => setMaterialActivo(m.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                materialActivo === m.id ? 'bg-primary text-white' : 'text-ink-muted'
              }`}
            >
              <span>{m.icono}</span>
              {nombreSegunIdioma(idioma, m.titulo, m.titulo_en)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {material && <ImportarStockModal material={material} />}
          <button
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            <Plus size={16} />
            {t('stock.registrarMovimiento')}
          </button>
        </div>
      </div>

      {material && (
        <>
          {parametros && (
            <ParametrosStockPanel parametros={parametros} esSuperAdmin={esSuperAdmin} onGuardado={(p) => setParametros(p)} />
          )}
          <KpiCards stock={stock} />

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">{t('stock.stockPorCentro')}</h2>
              {hayFiltrosActivos && (
                <button
                  onClick={() => {
                    setBusqueda('');
                    setGestorFiltro('');
                    setStockMenorQue('');
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-primary"
                >
                  <X size={12} />
                  {t('stock.limpiarFiltros')}
                </button>
              )}
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
              <select
                value={gestorFiltro}
                onChange={(e) => setGestorFiltro(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">{t('stock.todosLosGestores')}</option>
                {gestoresDisponibles.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={stockMenorQue}
                onChange={(e) => setStockMenorQue(e.target.value)}
                placeholder={t('stock.stockMenorQue')}
                className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>

            {cargando ? (
              <p className="py-6 text-center text-sm text-ink-muted">…</p>
            ) : stockFiltrado.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{stock.length === 0 ? t('stock.sinStock') : t('stock.sinCoincidencias')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">{t('stock.colCentro')}</th>
                      <th className="px-3 py-2">{t('stock.colGestor')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colDisponible')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colEnCamino')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colEnCalle')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colMerma')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colPerdida')}</th>
                      {material.tiene_tallas && <th className="px-3 py-2 text-right">{t('stock.colTallas')}</th>}
                      <th className="px-3 py-2">{t('stock.colEstado')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stockFiltrado.map((s) => {
                      const et = s.semaforo ? ETIQUETA_SEMAFORO[s.semaforo] : null;
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
                          <td className="px-3 py-2">
                            {et && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${et.color}`}>{idioma === 'en' ? et.en : et.es}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">{t('stock.historial')}</h2>
            {cargando ? (
              <p className="py-6 text-center text-sm text-ink-muted">…</p>
            ) : movimientos.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{t('stock.sinMovimientos')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">{t('stock.colFecha')}</th>
                      <th className="px-3 py-2">{t('stock.colTipo')}</th>
                      <th className="px-3 py-2">{t('stock.colOrigen')}</th>
                      <th className="px-3 py-2">{t('stock.colDestino')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colCantidad')}</th>
                      <th className="px-3 py-2">{t('stock.colRider')}</th>
                      <th className="px-3 py-2">{t('stock.colRegistradoPor')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movimientos.map((mv) => (
                      <tr key={mv.id}>
                        <td className="px-3 py-2 text-xs text-ink-muted">{formatFecha(mv.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{mv.tipo_etiqueta}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.centro_origen_nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.centro_destino_nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{mv.unidades}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.rider_nombre_libre ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.admin_usuario ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalAbierto && material && (
        <NuevoMovimientoModal
          material={material}
          materiales={materiales}
          tipos={tipos}
          centros={centros}
          onCerrar={() => setModalAbierto(false)}
          onRegistrado={() => {
            setModalAbierto(false);
            if (materialActivo !== null) recargar(materialActivo);
          }}
        />
      )}

      {fichaAbierta && <FichaCentroModal fila={fichaAbierta} onCerrar={() => setFichaAbierta(null)} />}
    </div>
  );
}
