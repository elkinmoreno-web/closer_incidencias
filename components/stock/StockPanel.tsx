'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Plus, Search, X } from 'lucide-react';
import {
  obtenerStockDisponible,
  listarMovimientosRecientes,
  listarTiposMovimiento,
  obtenerParametrosStock,
  listarFichasRecientes,
} from '@/app/dashboard/stock/actions';
import type { StockMaterial, StockDisponible, StockMovimiento, StockTipoMovimiento, StockParametros, StockFicha } from '@/lib/types';
import type { Centro } from '@/lib/types';
import { NuevoMovimientoModal } from '@/components/stock/NuevoMovimientoModal';
import { ImportarStockModal } from '@/components/stock/ImportarStockModal';
import { KpiCards } from '@/components/stock/KpiCards';
import { FichaCentroModal } from '@/components/stock/FichaCentroModal';
import { NuevaFichaModal } from '@/components/stock/NuevaFichaModal';
import { ParametrosStockPanel } from '@/components/stock/ParametrosStockPanel';
import { ThFiltro, cumpleFiltroTexto, cumpleFiltroNumero, type DireccionOrden, type FiltroColumna } from '@/components/stock/ThFiltro';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { formatFecha } from '@/lib/utils';
import { calcularSemaforo, ETIQUETA_SEMAFORO, ORDEN_URGENCIA_SEMAFORO } from '@/lib/stockSemaforo';
import { urlArchivoDrive } from '@/lib/driveUrl';
import { FileText } from 'lucide-react';

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
  const [fichaModalAbierto, setFichaModalAbierto] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState<StockDisponible | null>(null);
  const [fichasGeneradas, setFichasGeneradas] = useState<(StockFicha & { centro_nombre: string; admin_usuario: string | null })[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [gestorFiltro, setGestorFiltro] = useState('');
  const [stockMenorQue, setStockMenorQue] = useState('');

  // Filtros/orden por columna de la tabla de stock (click en cabecera).
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

  // Mismo patrón para el historial de movimientos.
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

  // Y para la tabla de fichas generadas.
  const [filtrosFichas, setFiltrosFichas] = useState<Record<string, FiltroColumna>>({});
  const [ordenFichas, setOrdenFichas] = useState<{ campo: string; dir: DireccionOrden } | null>(null);
  function ordenarFichasPor(campo: string, dir: DireccionOrden) {
    setOrdenFichas(dir ? { campo, dir } : null);
  }
  function filtrarFichasPor(campo: string, f: FiltroColumna | undefined) {
    setFiltrosFichas((prev) => {
      const next = { ...prev };
      if (f) next[campo] = f;
      else delete next[campo];
      return next;
    });
  }

  function recargar(materialId: number) {
    startCarga(async () => {
      const [s, m, p] = await Promise.all([obtenerStockDisponible(materialId), listarMovimientosRecientes(materialId), obtenerParametrosStock()]);
      setStockCrudo(s);
      setMovimientos(m);
      setParametros(p);
    });
  }

  function recargarFichas() {
    listarFichasRecientes().then(setFichasGeneradas);
  }

  useEffect(() => {
    listarTiposMovimiento().then(setTipos);
    recargarFichas();
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
    () => Array.from(new Set(stock.flatMap((s) => s.gestores))).sort((a, b) => a.localeCompare(b)),
    [stock]
  );

  const stockFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const umbral = stockMenorQue.trim() ? Number(stockMenorQue) : null;
    let filas = stock.filter((s) => {
      if (q && !s.centro_nombre.toLowerCase().includes(q) && !s.gestores.some((g) => g.toLowerCase().includes(q))) return false;
      if (gestorFiltro && !s.gestores.includes(gestorFiltro)) return false;
      if (umbral !== null && !(s.disponible < umbral)) return false;
      if (!cumpleFiltroTexto(s.centro_nombre, filtrosStock.centro)) return false;
      if (!cumpleFiltroNumero(s.disponible, filtrosStock.disponible)) return false;
      if (!cumpleFiltroNumero(s.transito_entrante, filtrosStock.transito)) return false;
      if (!cumpleFiltroNumero(s.en_calle, filtrosStock.enCalle)) return false;
      if (!cumpleFiltroNumero(s.merma, filtrosStock.merma)) return false;
      if (!cumpleFiltroNumero(s.perdida, filtrosStock.perdida)) return false;
      return true;
    });

    if (ordenStock) {
      const signo = ordenStock.dir === 'asc' ? 1 : -1;
      filas = [...filas].sort((a, b) => {
        const campo = ordenStock.campo;
        const va = campo === 'centro' ? a.centro_nombre : (a as any)[campo] ?? 0;
        const vb = campo === 'centro' ? b.centro_nombre : (b as any)[campo] ?? 0;
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
  }, [stock, busqueda, gestorFiltro, stockMenorQue, filtrosStock, ordenStock]);

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

  const fichasFiltradas = useMemo(() => {
    let filas = fichasGeneradas.filter((f) => {
      if (!cumpleFiltroTexto(f.rider_nombre, filtrosFichas.rider)) return false;
      if (!cumpleFiltroTexto(f.centro_nombre, filtrosFichas.centro)) return false;
      if (!cumpleFiltroTexto(f.estado, filtrosFichas.estado)) return false;
      if (!cumpleFiltroTexto(f.admin_usuario ?? '', filtrosFichas.registradaPor)) return false;
      return true;
    });
    if (ordenFichas) {
      const signo = ordenFichas.dir === 'asc' ? 1 : -1;
      filas = [...filas].sort((a, b) => {
        const campo = ordenFichas.campo;
        const va = (a as any)[campo] ?? '';
        const vb = (b as any)[campo] ?? '';
        if (typeof va === 'string') return va.localeCompare(vb) * signo;
        return (va - vb) * signo;
      });
    }
    return filas;
  }, [fichasGeneradas, filtrosFichas, ordenFichas]);

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
            onClick={() => setFichaModalAbierto(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-bg"
          >
            <FileText size={16} />
            {t('stockFicha.boton')}
          </button>
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
                      <ThFiltro label={t('stock.colCentro')} ordenActivo={ordenStock?.campo === 'centro' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('centro', d)} filtro={filtrosStock.centro} onFiltrar={(f) => filtrarStockPor('centro', f)} />
                      <ThFiltro label={t('stock.colDisponible')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'disponible' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('disponible', d)} filtro={filtrosStock.disponible} onFiltrar={(f) => filtrarStockPor('disponible', f)} />
                      <ThFiltro label={t('stock.colEnCamino')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'transito_entrante' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('transito_entrante', d)} filtro={filtrosStock.transito} onFiltrar={(f) => filtrarStockPor('transito', f)} />
                      <ThFiltro label={t('stock.colEnCalle')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'en_calle' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('en_calle', d)} filtro={filtrosStock.enCalle} onFiltrar={(f) => filtrarStockPor('enCalle', f)} />
                      <ThFiltro label={t('stock.colMerma')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'merma' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('merma', d)} filtro={filtrosStock.merma} onFiltrar={(f) => filtrarStockPor('merma', f)} />
                      <ThFiltro label={t('stock.colPerdida')} align="right" tipo="numero" ordenActivo={ordenStock?.campo === 'perdida' ? ordenStock.dir : null} onOrdenar={(d) => ordenarStockPor('perdida', d)} filtro={filtrosStock.perdida} onFiltrar={(f) => filtrarStockPor('perdida', f)} />
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
            ) : movimientosFiltrados.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{t('stock.sinCoincidencias')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">{t('stock.colFecha')}</th>
                      <ThFiltro label={t('stock.colTipo')} ordenActivo={ordenMov?.campo === 'tipo_etiqueta' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('tipo_etiqueta', d)} filtro={filtrosMov.tipo} onFiltrar={(f) => filtrarMovPor('tipo', f)} />
                      <ThFiltro label={t('stock.colOrigen')} ordenActivo={ordenMov?.campo === 'centro_origen_nombre' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('centro_origen_nombre', d)} filtro={filtrosMov.origen} onFiltrar={(f) => filtrarMovPor('origen', f)} />
                      <ThFiltro label={t('stock.colDestino')} ordenActivo={ordenMov?.campo === 'centro_destino_nombre' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('centro_destino_nombre', d)} filtro={filtrosMov.destino} onFiltrar={(f) => filtrarMovPor('destino', f)} />
                      <ThFiltro label={t('stock.colCantidad')} align="right" tipo="numero" ordenActivo={ordenMov?.campo === 'unidades' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('unidades', d)} filtro={filtrosMov.cantidad} onFiltrar={(f) => filtrarMovPor('cantidad', f)} />
                      <ThFiltro label={t('stock.colRider')} ordenActivo={ordenMov?.campo === 'rider_nombre_libre' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('rider_nombre_libre', d)} filtro={filtrosMov.rider} onFiltrar={(f) => filtrarMovPor('rider', f)} />
                      <ThFiltro label={t('stock.colRegistradoPor')} ordenActivo={ordenMov?.campo === 'admin_usuario' ? ordenMov.dir : null} onOrdenar={(d) => ordenarMovPor('admin_usuario', d)} filtro={filtrosMov.registradoPor} onFiltrar={(f) => filtrarMovPor('registradoPor', f)} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movimientosFiltrados.map((mv) => (
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

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 font-semibold text-ink">{t('stockFichas.titulo')}</h2>
        {fichasGeneradas.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t('stockFichas.sinFichas')}</p>
        ) : fichasFiltradas.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t('stock.sinCoincidencias')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">{t('stockFichas.colFecha')}</th>
                  <ThFiltro label={t('stockFichas.colRider')} ordenActivo={ordenFichas?.campo === 'rider_nombre' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('rider_nombre', d)} filtro={filtrosFichas.rider} onFiltrar={(f) => filtrarFichasPor('rider', f)} />
                  <ThFiltro label={t('stockFichas.colCentro')} ordenActivo={ordenFichas?.campo === 'centro_nombre' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('centro_nombre', d)} filtro={filtrosFichas.centro} onFiltrar={(f) => filtrarFichasPor('centro', f)} />
                  <ThFiltro label={t('stockFichas.colEstado')} ordenActivo={ordenFichas?.campo === 'estado' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('estado', d)} filtro={filtrosFichas.estado} onFiltrar={(f) => filtrarFichasPor('estado', f)} />
                  <th className="px-3 py-2">{t('stockFichas.colMateriales')}</th>
                  <ThFiltro label={t('stockFichas.colRegistradaPor')} ordenActivo={ordenFichas?.campo === 'admin_usuario' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('admin_usuario', d)} filtro={filtrosFichas.registradaPor} onFiltrar={(f) => filtrarFichasPor('registradaPor', f)} />
                  <th className="px-3 py-2">{t('stockFichas.colPdf')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fichasFiltradas.map((f) => {
                  const url = urlArchivoDrive(f.pdf_url);
                  return (
                    <tr key={f.id}>
                      <td className="px-3 py-2 text-xs text-ink-muted">{formatFecha(f.created_at)}</td>
                      <td className="px-3 py-2 text-xs text-ink">{f.rider_nombre}</td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{f.centro_nombre}</td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{f.estado}</td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{f.materiales.map((m) => `${m.materialTitulo} (${m.cantidad})`).join(', ')}</td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{f.admin_usuario ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                            <FileText size={12} />
                            {t('stockFicha.verPdf')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

      {fichaModalAbierto && (
        <NuevaFichaModal
          materiales={materiales}
          onCerrar={() => setFichaModalAbierto(false)}
          onGenerada={() => {
            recargarFichas();
            if (materialActivo !== null) recargar(materialActivo);
          }}
        />
      )}

      {fichaAbierta && <FichaCentroModal fila={fichaAbierta} onCerrar={() => setFichaAbierta(null)} />}
    </div>
  );
}
