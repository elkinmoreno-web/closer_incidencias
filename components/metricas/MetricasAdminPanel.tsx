'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import {
  centrosConsultablesMetricas,
  obtenerMetricasAdmin,
  buscarRiderPorTexto,
  semanaActual,
  exportarMetricas,
  exportarMetricasRango,
  type FilaMetricaAdmin,
  type RiderEncontrado,
  type CentroConId,
} from '@/app/dashboard/metricas/actions';
import { paginasAMostrar } from '@/lib/pagination';
import { semanaIsoDe } from '@/lib/metricas';

const fmtInt = (n: number | null) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('es-ES'));
const fmtFloat = (n: number | null) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(2));
const fmtPct = (n: number | null) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(0)}%`);

const POR_PAGINA = 30;

/** Lunes y domingo de una semana ISO (año + número de semana), para mostrar el rango. */
function rangoSemanaIso(year: number, week: number): { lunes: string; domingo: string } {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const lunes = new Date(simple);
  lunes.setUTCDate(simple.getUTCDate() - ((dow + 6) % 7));
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { lunes: fmt(lunes), domingo: fmt(domingo) };
}

export function MetricasAdminPanel() {
  const [year, setYear] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [centros, setCentros] = useState<CentroConId[]>([]);
  const [centroFiltro, setCentroFiltro] = useState<string>('todos');
  const [filas, setFilas] = useState<FilaMetricaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [infoConsulta, setInfoConsulta] = useState<string | null>(null);
  const [forzar, setForzar] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState<RiderEncontrado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [rangoExport, setRangoExport] = useState<{ desde: string; hasta: string }>(() => {
    const hoy = new Date().toISOString().split('T')[0];
    return { desde: hoy, hasta: hoy };
  });

  useEffect(() => {
    centrosConsultablesMetricas().then((r) => {
      setCentros(r.centros);
    });
    semanaActual().then((s) => {
      setYear(s.year);
      setWeek(s.week);
    });
  }, []);

  useEffect(() => {
    if (year === null || week === null) return;
    setCargando(true);
    setPagina(1);
    const ids = centroFiltro === 'todos' ? centros.map((c) => c.id) : [Number(centroFiltro)];
    if (ids.length === 0) {
      setFilas([]);
      setCargando(false);
      return;
    }
    obtenerMetricasAdmin(ids, year, week, forzar)
      .then((res) => {
        setFilas(res.filas);
        setErrores(res.errores);
        const desdeCache = ids.length - res.consultados;
        setInfoConsulta(
          res.consultados === 0
            ? 'Todo servido desde caché (menos de 30 min) — sin consultar la API'
            : desdeCache > 0
            ? `${res.consultados} centro(s) consultados a la API, ${desdeCache} desde caché`
            : `${res.consultados} centro(s) consultados a la API`
        );
      })
      .finally(() => setCargando(false));
  }, [year, week, centroFiltro, centros, forzar]);

  function cambiarSemana(delta: number) {
    if (year === null || week === null) return;
    const { lunes } = rangoSemanaIso(year, week);
    const d = new Date(lunes + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * 7);
    const nueva = semanaIsoDe(d);
    setYear(nueva.year);
    setWeek(nueva.week);
  }

  const rango = year !== null && week !== null ? rangoSemanaIso(year, week) : null;

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => f.nombre.toLowerCase().includes(q) || f.dni.toLowerCase().includes(q));
  }, [filas, busqueda]);

  useEffect(() => {
    setPagina(1);
  }, [busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const desde = (paginaSegura - 1) * POR_PAGINA;
  const filasPagina = filasFiltradas.slice(desde, desde + POR_PAGINA);
  const paginas = paginasAMostrar(paginaSegura, totalPaginas);

  const totales = filas.reduce(
    (acc, f) => ({ online: acc.online + f.online_hours, viajes: acc.viajes + f.num_of_trips, riders: acc.riders + 1 }),
    { online: 0, viajes: 0, riders: 0 }
  );

  async function verificarRider() {
    if (busqueda.trim().length < 2) return;
    setBuscando(true);
    try {
      setResultadoBusqueda(await buscarRiderPorTexto(busqueda));
    } finally {
      setBuscando(false);
    }
  }

  async function exportarSemanaActual() {
    if (year === null || week === null) return;
    setExportando(true);
    try {
      const ids = centroFiltro === 'todos' ? centros.map((c) => c.id) : [Number(centroFiltro)];
      const res = await exportarMetricas(ids, year, week);
      await descargarXlsx(res.filas, `metricas_semana_${year}-W${week}`);
    } finally {
      setExportando(false);
    }
  }

  async function exportarPorRango() {
    setExportando(true);
    try {
      const ids = centroFiltro === 'todos' ? centros.map((c) => c.id) : [Number(centroFiltro)];
      const res = await exportarMetricasRango(ids, rangoExport.desde, rangoExport.hasta);
      if (res.errores.length > 0) setErrores(res.errores);
      await descargarXlsx(res.filas, `metricas_${rangoExport.desde}_a_${rangoExport.hasta}`);
    } finally {
      setExportando(false);
    }
  }

  async function descargarXlsx(filasExport: FilaMetricaAdmin[], nombreArchivo: string) {
    const XLSX = await import('xlsx');
    const hoja = XLSX.utils.json_to_sheet(
      filasExport.map((f) => ({
        Centro: f.centro,
        DNI: f.dni,
        Nombre: f.nombre,
        Teléfono: f.telefono,
        'Horas online': f.online_hours,
        'Horas activo': f.active_hours,
        Viajes: f.num_of_trips,
        'Aceptación %': Math.round(f.acceptance_rate * 100),
        'Cancelación %': Math.round(f.cancelation_rate * 100),
        TPH: f.tph,
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Métricas');
    XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => cambiarSemana(-1)} className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-brand-text">
            {rango ? `${rango.lunes} → ${rango.domingo}` : '—'} {year && week ? `(semana ISO ${week})` : ''}
          </span>
          <button onClick={() => cambiarSemana(1)} className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink">
            <ChevronRight className="h-4 w-4" />
          </button>
          <select
            value={centroFiltro}
            onChange={(e) => setCentroFiltro(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          >
            <option value="todos">Todos mis centros</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} className="accent-primary" />
            Forzar (ignorar caché)
          </label>
        </div>
        <button
          onClick={exportarSemanaActual}
          disabled={exportando}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Exportar esta semana
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <span className="text-xs font-semibold text-ink-muted">Exportar por rango de fechas:</span>
        <input
          type="date"
          value={rangoExport.desde}
          onChange={(e) => setRangoExport((r) => ({ ...r, desde: e.target.value }))}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs focus:border-primary focus:outline-none"
        />
        <span className="text-xs text-ink-muted">hasta</span>
        <input
          type="date"
          value={rangoExport.hasta}
          onChange={(e) => setRangoExport((r) => ({ ...r, hasta: e.target.value }))}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs focus:border-primary focus:outline-none"
        />
        <button
          onClick={exportarPorRango}
          disabled={exportando}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {exportando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Exportar rango
        </button>
        <span className="text-[10px] text-ink-muted">(máx. 31 días; consulta día por día, puede tardar un poco)</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar por nombre o DNI en esta tabla..."
            className="w-64 rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-ink focus:border-primary focus:outline-none"
          />
        </div>
        <button
          onClick={verificarRider}
          disabled={buscando || busqueda.trim().length < 2}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {buscando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Buscar rider en el CRM
        </button>
      </div>

      {resultadoBusqueda && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs">
          {resultadoBusqueda.length === 0 ? (
            <p className="text-ink-muted">No se encontró ningún rider en el CRM con ese texto.</p>
          ) : (
            <div className="space-y-1.5">
              {resultadoBusqueda.map((r) => {
                const enDatos = filas.some((f) => f.dni.toLowerCase() === r.dni.toLowerCase());
                return (
                  <div key={r.dni} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="font-medium text-ink">{r.nombre}</span> <span className="text-ink-muted">· {r.dni} · {r.email}</span>
                    </span>
                    <span className={enDatos ? 'font-semibold text-emerald-600' : 'font-semibold text-danger'}>
                      {enDatos ? '✓ Tiene datos esta semana' : '✗ Sin datos esta semana'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Riders con datos</div>
          <div className="font-mono text-lg font-medium text-ink">{totales.riders}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Horas online (total)</div>
          <div className="font-mono text-lg font-medium text-ink">{fmtFloat(totales.online)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Viajes completados</div>
          <div className="font-mono text-lg font-medium text-brand-text">{fmtInt(totales.viajes)}</div>
        </div>
      </div>

      {infoConsulta && <p className="text-xs text-ink-muted">{infoConsulta}</p>}
      {errores.length > 0 && (
        <div className="rounded-lg bg-red-50 p-2 text-xs text-danger">
          {errores.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-10 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-left uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2">Centro</th>
                  <th className="px-3 py-2">Rider</th>
                  <th className="px-3 py-2 text-center">Horas online</th>
                  <th className="px-3 py-2 text-center">Viajes</th>
                  <th className="px-3 py-2 text-center">Aceptación</th>
                  <th className="px-3 py-2 text-center">Cancelación</th>
                </tr>
              </thead>
              <tbody>
                {filasPagina.map((f, i) => (
                  <tr key={`${f.dni}-${i}`} className="border-b border-border">
                    <td className="max-w-[110px] truncate px-3 py-2 text-ink-muted" title={f.centro}>
                      {f.centro}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{f.nombre}</div>
                      <div className="font-mono text-[10px] text-ink-muted">{f.dni}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{fmtFloat(f.online_hours)}</td>
                    <td className="px-3 py-2 text-center font-mono text-primary">{fmtInt(f.num_of_trips)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtPct(f.acceptance_rate)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtPct(f.cancelation_rate)}</td>
                  </tr>
                ))}
                {filasPagina.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-ink-muted">
                      Sin datos para esta semana.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaSegura === 1}
                className="rounded-full p-1.5 text-ink-muted hover:bg-surface disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {paginas.map((p, idx) =>
                p === 'gap' ? (
                  <span key={`gap-${idx}`} className="px-1 text-ink-muted">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPagina(p)}
                    className={`min-w-[2rem] rounded-full px-2.5 py-1 text-xs ${p === paginaSegura ? 'bg-primary text-white' : 'text-ink-muted hover:bg-surface'}`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura === totalPaginas}
                className="rounded-full p-1.5 text-ink-muted hover:bg-surface disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
