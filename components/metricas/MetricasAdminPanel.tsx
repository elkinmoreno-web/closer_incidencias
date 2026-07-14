'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Upload, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ciudadesConsultablesMetricas,
  obtenerMetricasAdmin,
  obtenerEstadoSincronizaciones,
  obtenerUltimaSemanaConDatos,
  buscarRiderPorTexto,
  type FilaMetricaAdmin,
  type EstadoSincronizacion,
  type RiderEncontrado,
} from '@/app/dashboard/metricas/actions';
import { lunesDe, domingoDe, fmtDMY } from '@/lib/metricas';
import { paginasAMostrar } from '@/lib/pagination';
import { SubirMetricasModal } from '@/components/metricas/SubirMetricasModal';

const fmtInt = (n: number | null) => (n === null ? '—' : Math.round(n).toLocaleString('es-ES'));
const fmtFloat = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : n.toFixed(2));
const fmtPct = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : `${n.toFixed(0)}%`);

const POR_PAGINA = 30;

export function MetricasAdminPanel() {
  const [fechaLunes, setFechaLunes] = useState(() => lunesDe(new Date().toISOString().split('T')[0]));
  const [semanaAjustada, setSemanaAjustada] = useState(false);
  const [ciudades, setCiudades] = useState<string[]>([]);
  const [esSuperAdmin, setEsSuperAdmin] = useState(false);
  const [ciudadFiltro, setCiudadFiltro] = useState<string>('todas');
  const [filas, setFilas] = useState<FilaMetricaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarSubida, setMostrarSubida] = useState(false);
  const [syncs, setSyncs] = useState<EstadoSincronizacion[]>([]);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState<RiderEncontrado[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    ciudadesConsultablesMetricas().then((r) => {
      setCiudades(r.ciudades);
      setEsSuperAdmin(r.esSuperAdmin);
    });
    obtenerEstadoSincronizaciones().then(setSyncs);
    // Al entrar, saltamos directo a la última semana con datos reales —
    // "hoy" casi nunca tiene nada todavía por el rezago de la sincronización.
    obtenerUltimaSemanaConDatos().then((ultimoDia) => {
      if (ultimoDia) setFechaLunes(lunesDe(ultimoDia));
      setSemanaAjustada(true);
    });
  }, []);

  useEffect(() => {
    if (!semanaAjustada) return;
    setCargando(true);
    setPagina(1);
    const soloTodas = ciudadFiltro === 'todas' && esSuperAdmin;
    const filtro = ciudadFiltro === 'todas' ? ciudades : [ciudadFiltro];
    obtenerMetricasAdmin(fechaLunes, domingoDe(fechaLunes), filtro, soloTodas)
      .then(setFilas)
      .finally(() => setCargando(false));
  }, [fechaLunes, ciudadFiltro, ciudades, esSuperAdmin, semanaAjustada]);

  // Agregado por rider (sumando/promediando sus días de la semana)
  const porRider = useMemo(() => {
    const mapa = new Map<string, { name: string | null; city: string | null; sh: number; active_hours: number; completed_trips: number; accepts: number[]; cancels: number[] }>();
    filas.forEach((f) => {
      const key = f.email;
      if (!mapa.has(key)) mapa.set(key, { name: f.name, city: f.city, sh: 0, active_hours: 0, completed_trips: 0, accepts: [], cancels: [] });
      const acc = mapa.get(key)!;
      acc.sh += f.sh ?? 0;
      acc.active_hours += f.active_hours ?? 0;
      acc.completed_trips += f.completed_trips ?? 0;
      if (f.pct_accept !== null) acc.accepts.push(f.pct_accept);
      if (f.pct_cancel !== null) acc.cancels.push(f.pct_cancel);
    });
    return Array.from(mapa.entries())
      .map(([email, v]) => ({
        email,
        name: v.name,
        city: v.city,
        sh: v.sh,
        active_hours: v.active_hours,
        completed_trips: v.completed_trips,
        pct_accept: v.accepts.length ? v.accepts.reduce((a, b) => a + b, 0) / v.accepts.length : null,
        pct_cancel: v.cancels.length ? v.cancels.reduce((a, b) => a + b, 0) / v.cancels.length : null,
      }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [filas]);

  const porRiderFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return porRider;
    return porRider.filter((r) => (r.name ?? '').toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [porRider, busqueda]);

  const emailsEnDatos = useMemo(() => new Set(filas.map((f) => f.email.toLowerCase())), [filas]);

  const totalPaginas = Math.max(1, Math.ceil(porRiderFiltrado.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const desde = (paginaSegura - 1) * POR_PAGINA;
  const filasPagina = porRiderFiltrado.slice(desde, desde + POR_PAGINA);
  const paginas = paginasAMostrar(paginaSegura, totalPaginas);

  const totales = porRider.reduce(
    (acc, r) => ({ sh: acc.sh + r.sh, completed_trips: acc.completed_trips + r.completed_trips, riders: acc.riders + 1 }),
    { sh: 0, completed_trips: 0, riders: 0 }
  );

  useEffect(() => {
    setPagina(1);
  }, [busqueda]);

  async function verificarRider() {
    if (busqueda.trim().length < 2) return;
    setBuscando(true);
    try {
      const encontrados = await buscarRiderPorTexto(busqueda);
      setResultadoBusqueda(encontrados);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={fechaLunes}
            onChange={(e) => setFechaLunes(lunesDe(e.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-brand-text">
            {fmtDMY(fechaLunes)} → {fmtDMY(domingoDe(fechaLunes))}
          </span>
          <select
            value={ciudadFiltro}
            onChange={(e) => setCiudadFiltro(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          >
            <option value="todas">{esSuperAdmin ? 'Todas las ciudades (sin filtrar)' : 'Todas mis ciudades'}</option>
            {ciudades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setMostrarSubida(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary"
        >
          <Upload className="h-3.5 w-3.5" />
          Subir manualmente
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Filtrar por nombre o email en esta tabla..."
          className="w-64 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
        />
        <button
          onClick={verificarRider}
          disabled={buscando || busqueda.trim().length < 2}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
          title="Busca por DNI, nombre o email en el CRM y comprueba si ese rider tiene datos esta semana"
        >
          {buscando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Verificar en el CRM (por DNI/nombre/email)
        </button>
      </div>

      {resultadoBusqueda && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs">
          {resultadoBusqueda.length === 0 ? (
            <p className="text-ink-muted">No se encontró ningún rider en el CRM con ese texto.</p>
          ) : (
            <div className="space-y-2">
              {resultadoBusqueda.map((r) => {
                const enDatos = emailsEnDatos.has(r.email.toLowerCase()) || (r.emailMetricas && emailsEnDatos.has(r.emailMetricas.toLowerCase()));
                return (
                  <div key={r.dni} className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-medium text-ink">{r.nombre}</span>{' '}
                      <span className="text-ink-muted">
                        · {r.dni} · {r.email}
                        {r.emailMetricas && ` · email métricas: ${r.emailMetricas}`}
                      </span>
                    </div>
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
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Horas conectado (total)</div>
          <div className="font-mono text-lg font-medium text-ink">{fmtFloat(totales.sh)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Viajes completados</div>
          <div className="font-mono text-lg font-medium text-brand-text">{fmtInt(totales.completed_trips)}</div>
        </div>
      </div>

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
                  <th className="px-3 py-2">Ciudad</th>
                  <th className="px-3 py-2">Rider</th>
                  <th className="px-3 py-2 text-center">Horas conectado</th>
                  <th className="px-3 py-2 text-center">Viajes</th>
                  <th className="px-3 py-2 text-center">Aceptación</th>
                  <th className="px-3 py-2 text-center">Cancelación</th>
                </tr>
              </thead>
              <tbody>
                {filasPagina.map((r) => (
                  <tr key={r.email} className="border-b border-border">
                    <td className="px-3 py-2 text-ink-muted">{r.city ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{r.name ?? '—'}</div>
                      <div className="font-mono text-[10px] text-ink-muted">{r.email}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{fmtFloat(r.sh)}</td>
                    <td className="px-3 py-2 text-center font-mono text-primary">{fmtInt(r.completed_trips)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtPct(r.pct_accept)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtPct(r.pct_cancel)}</td>
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

      {syncs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Últimas sincronizaciones</p>
          <div className="space-y-1.5">
            {syncs.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-ink-muted">
                {s.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}
                <span className="font-mono">{new Date(s.createdAt).toLocaleString('es-ES')}</span>
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px]">{s.source}</span>
                {s.ok ? <span>{s.insertedRows ?? 0} fila(s)</span> : <span className="text-danger">{s.errorMessage}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {mostrarSubida && <SubirMetricasModal onClose={() => setMostrarSubida(false)} />}
    </div>
  );
}
