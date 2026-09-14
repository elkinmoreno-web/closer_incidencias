'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Download, TriangleAlert, Search, SlidersHorizontal, RefreshCw, X } from 'lucide-react';
import {
  centrosConsultablesMetricas,
  obtenerMetricasAdminSemanal,
  obtenerMetricasAdminDiario,
  obtenerParametrosAlertas,
  actualizarParametrosAlertas,
  type FilaMetricaAdmin,
  type CentroConId,
} from '@/app/dashboard/metricas/actions';
import type { AlertasParametros } from '@/lib/types';
import { semanaIsoDe, fechaLimiteMetricas, semanaEsMuyAntigua } from '@/lib/metricas';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

const fmtFloat = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

type Modo = 'diario' | 'semanal';
type Semaforo = 'rojo' | 'naranja' | 'verde';

/** Semáforo de TPH: rojo &lt; 1, naranja hasta 2.35, verde por encima de 2.35. */
function semaforoDeTph(tph: number): Semaforo {
  if (!Number.isFinite(tph) || tph < 1) return 'rojo';
  if (tph <= 2.35) return 'naranja';
  return 'verde';
}

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  rojo: 'bg-red-500',
  naranja: 'bg-orange-400',
  verde: 'bg-emerald-500',
};

const TODOS_LOS_SEMAFOROS = new Set<Semaforo>(['rojo', 'naranja', 'verde']);

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

const fmtDMY = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function AlertasRidersPanel() {
  const { t } = useIdioma();
  const [modo, setModo] = useState<Modo>('diario');
  // Igual que en Métricas: año/semana de "hoy" se calculan en el cliente
  // (semanaIsoDe es pura) para que la primera consulta no tenga que
  // esperar un viaje al servidor aparte.
  const inicial = useMemo(() => semanaIsoDe(new Date()), []);
  const [year, setYear] = useState<number>(inicial.year);
  const [week, setWeek] = useState<number>(inicial.week);
  const [fechaDia, setFechaDia] = useState(() => fechaLimiteMetricas());
  const [centros, setCentros] = useState<CentroConId[]>([]);
  const [esSuperAdmin, setEsSuperAdmin] = useState(false);
  const [centroFiltro, setCentroFiltro] = useState<string>('todos');
  const [filas, setFilas] = useState<FilaMetricaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);

  // Navegar entre días/semanas o cambiar de centro ya NO dispara una
  // consulta por sí solo (antes tocaba esperar cada clic) — la consulta
  // real solo sale al pulsar "Cargar", o en la carga inicial apenas se
  // conocen los centros del admin.
  const [consulta, setConsulta] = useState(0);
  const turnoRef = useRef(0);

  const [parametros, setParametros] = useState<AlertasParametros | null>(null);

  // Filtros de la tabla (horas/pedidos, búsqueda, semáforo): por defecto
  // se ve TODO sin filtrar — el panel de filtros está oculto y solo se
  // aplican al pulsar "Aplicar filtros", detrás del botón "Filtros".
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filtrosAplicados, setFiltrosAplicados] = useState(false);

  const [horasMin, setHorasMin] = useState(6);
  const [pedidosMin, setPedidosMin] = useState(8);
  const [busqueda, setBusqueda] = useState('');
  const [semaforosActivos, setSemaforosActivos] = useState<Set<Semaforo>>(new Set(TODOS_LOS_SEMAFOROS));

  const [horasMinAplicado, setHorasMinAplicado] = useState(6);
  const [pedidosMinAplicado, setPedidosMinAplicado] = useState(8);
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [semaforosAplicados, setSemaforosAplicados] = useState<Set<Semaforo>>(new Set(TODOS_LOS_SEMAFOROS));

  const [guardando, setGuardando] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);

  function alternarSemaforo(color: Semaforo) {
    setSemaforosActivos((prev) => {
      const next = new Set(prev);
      if (next.has(color)) {
        // Nunca se deja vacío el filtro entero — quitar el último color
        // activo mostraría "0 resultados" sin que se note por qué.
        if (next.size > 1) next.delete(color);
      } else {
        next.add(color);
      }
      return next;
    });
  }

  useEffect(() => {
    centrosConsultablesMetricas().then((r) => {
      setCentros(r.centros);
      setEsSuperAdmin(r.esSuperAdmin);
    });
    obtenerParametrosAlertas().then((p) => {
      setParametros(p);
      setHorasMin(p.horas_min_diario);
      setPedidosMin(p.pedidos_min_diario);
    });
  }, []);

  // Al cambiar de modo (o cuando llegan los parámetros guardados), los
  // campos editables (aún sin aplicar) toman el umbral por defecto de ESE
  // modo — diario y semanal tienen escalas muy distintas.
  useEffect(() => {
    if (!parametros) return;
    setHorasMin(modo === 'diario' ? parametros.horas_min_diario : parametros.horas_min_semanal);
    setPedidosMin(modo === 'diario' ? parametros.pedidos_min_diario : parametros.pedidos_min_semanal);
  }, [modo, parametros]);

  useEffect(() => {
    if (centros.length === 0) return;
    const miTurno = ++turnoRef.current;

    setCargando(true);
    const ids = centroFiltro === 'todos' ? centros.map((c) => c.id) : [Number(centroFiltro)];
    if (ids.length === 0) {
      setFilas([]);
      setCargando(false);
      return;
    }

    const promesa = modo === 'semanal' ? obtenerMetricasAdminSemanal(ids, year, week, false) : obtenerMetricasAdminDiario(ids, fechaDia, false);

    promesa
      .then((res) => {
        if (turnoRef.current !== miTurno) return;
        setFilas(res.filas);
        setErrores(res.errores);
      })
      .finally(() => {
        if (turnoRef.current === miTurno) setCargando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberado: solo re-consulta al llegar los centros o al pulsar "Cargar" (consulta), no en cada cambio de modo/semana/día/centro
  }, [centros, consulta]);

  function cambiarSemana(delta: number) {
    const { lunes } = rangoSemanaIso(year, week);
    const d = new Date(lunes + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * 7);
    const nueva = semanaIsoDe(d);
    if (delta < 0 && semanaEsMuyAntigua(nueva.year, nueva.week)) return;
    setYear(nueva.year);
    setWeek(nueva.week);
  }

  function cambiarDia(delta: number) {
    const d = new Date(fechaDia + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    setFechaDia(d.toISOString().split('T')[0]);
  }

  const rango = modo === 'semanal' ? rangoSemanaIso(year, week) : null;
  const limite = fechaLimiteMetricas();

  // Peor caso primero: quien menos pedidos hizo con más horas conectado
  // es a quien más urge llamarle la atención. Sin filtros aplicados se ve
  // la lista completa (ya ordenada) — los filtros solo se activan tras
  // pulsar "Aplicar filtros".
  const alertas = useMemo(() => {
    let base = filas;
    if (filtrosAplicados) {
      const q = busquedaAplicada.trim().toLowerCase();
      base = base
        .filter((f) => f.online_hours >= horasMinAplicado && f.num_of_trips < pedidosMinAplicado)
        .filter((f) => !q || f.nombre.toLowerCase().includes(q) || f.dni.toLowerCase().includes(q) || f.email.toLowerCase().includes(q) || f.centro.toLowerCase().includes(q))
        .filter((f) => semaforosAplicados.has(semaforoDeTph(f.tph)));
    }
    return [...base].sort((a, b) => a.num_of_trips - b.num_of_trips || b.online_hours - a.online_hours);
  }, [filas, filtrosAplicados, horasMinAplicado, pedidosMinAplicado, busquedaAplicada, semaforosAplicados]);

  function aplicarFiltros() {
    setHorasMinAplicado(horasMin);
    setPedidosMinAplicado(pedidosMin);
    setBusquedaAplicada(busqueda);
    setSemaforosAplicados(new Set(semaforosActivos));
    setFiltrosAplicados(true);
  }

  function quitarFiltros() {
    setFiltrosAplicados(false);
  }

  async function guardarComoPredeterminado() {
    if (!parametros) return;
    setGuardando(true);
    setAvisoGuardado(null);
    const nuevos: AlertasParametros = {
      ...parametros,
      ...(modo === 'diario' ? { horas_min_diario: horasMin, pedidos_min_diario: pedidosMin } : { horas_min_semanal: horasMin, pedidos_min_semanal: pedidosMin }),
    };
    const res = await actualizarParametrosAlertas(nuevos);
    setGuardando(false);
    if (res && 'error' in res) {
      setAvisoGuardado(res.error);
      return;
    }
    setParametros(nuevos);
    setAvisoGuardado(t('admAlertas.guardado'));
  }

  async function exportarAlertas() {
    const XLSX = await import('xlsx');
    const hoja = XLSX.utils.json_to_sheet(
      alertas.map((f) => ({
        [t('admMetricas.exColDni')]: f.dni,
        [t('admMetricas.exColNombre')]: f.nombre,
        [t('admMetricas.exColCentro')]: f.centro,
        [t('admMetricas.exColTelefono')]: f.telefono,
        [t('admAlertas.colCorreo')]: f.email,
        [t('admMetricas.exColHorasOnline')]: f.online_hours,
        [t('admMetricas.exColViajes')]: f.num_of_trips,
        TPH: f.tph,
        [t('admAlertas.colSemaforo')]: t(`admAlertas.semaforo.${semaforoDeTph(f.tph)}`),
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, t('admAlertas.exSheetName'));
    const sufijo = modo === 'diario' ? fechaDia : rango ? `${rango.lunes}_a_${rango.domingo}` : 'export';
    XLSX.writeFile(libro, `alertas_riders_${sufijo}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-bg p-1">
            <button
              onClick={() => setModo('diario')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${modo === 'diario' ? 'bg-primary text-white' : 'text-ink-muted'}`}
            >
              {t('admMetricas.diario')}
            </button>
            <button
              onClick={() => setModo('semanal')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${modo === 'semanal' ? 'bg-primary text-white' : 'text-ink-muted'}`}
            >
              {t('admMetricas.semanal')}
            </button>
          </div>

          {modo === 'diario' ? (
            <>
              <button onClick={() => cambiarDia(-1)} className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                type="date"
                value={fechaDia}
                max={limite}
                onChange={(e) => setFechaDia(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => cambiarDia(1)}
                disabled={fechaDia >= limite}
                className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => cambiarSemana(-1)} className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-brand-text">
                {rango ? t('admMetricas.semanaDelAl').replace('{inicio}', fmtDMY(rango.lunes)).replace('{fin}', fmtDMY(rango.domingo)) : '—'}
              </span>
              <button onClick={() => cambiarSemana(1)} className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink">
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          <select
            value={centroFiltro}
            onChange={(e) => setCentroFiltro(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          >
            <option value="todos">{t('admMetricas.todosMisCentros')}</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={() => setConsulta((c) => c + 1)}
            disabled={cargando}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t('admMetricas.cargar')}
          </button>
        </div>
        <button
          onClick={exportarAlertas}
          disabled={alertas.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {t('admMetricas.exportarTabla')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFiltrosAbiertos((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            filtrosAbiertos ? 'border-primary text-primary' : 'border-border text-ink-muted hover:border-primary hover:text-primary'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('admAlertas.filtros')}
          {filtrosAplicados && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />}
        </button>
        {filtrosAplicados && (
          <button onClick={quitarFiltros} className="flex items-center gap-1 text-xs text-ink-muted hover:text-danger">
            <X className="h-3 w-3" />
            {t('admAlertas.quitarFiltros')}
          </button>
        )}
        {!filtrosAplicados && <span className="text-xs text-ink-muted">{t('admAlertas.mostrandoTodos')}</span>}
      </div>

      {filtrosAbiertos && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('admAlertas.filtrarPlaceholder')}
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('admAlertas.semaforoTph')}</span>
            {(['rojo', 'naranja', 'verde'] as Semaforo[]).map((color) => (
              <button
                key={color}
                onClick={() => alternarSemaforo(color)}
                title={t(`admAlertas.semaforo.${color}`)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  semaforosActivos.has(color) ? 'border-border bg-surface text-ink' : 'border-transparent text-ink-muted opacity-40'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${SEMAFORO_COLOR[color]}`} />
                {t(`admAlertas.semaforo.${color}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('admAlertas.horasMin')}</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={horasMin}
                onChange={(e) => setHorasMin(Number(e.target.value))}
                className="w-24 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('admAlertas.pedidosMin')}</label>
              <input
                type="number"
                min={0}
                step={1}
                value={pedidosMin}
                onChange={(e) => setPedidosMin(Number(e.target.value))}
                className="w-24 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              />
            </div>
            <p className="max-w-xs text-xs text-ink-muted">{t('admAlertas.explicacion')}</p>
            <button onClick={aplicarFiltros} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark">
              {t('admAlertas.aplicarFiltros')}
            </button>
            {esSuperAdmin && (
              <button
                onClick={guardarComoPredeterminado}
                disabled={guardando}
                className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {guardando ? t('admAlertas.guardando') : t('admAlertas.guardarUmbrales')}
              </button>
            )}
            {avisoGuardado && <p className="w-full text-xs text-emerald-600">{avisoGuardado}</p>}
          </div>
        </div>
      )}

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
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface text-left uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2">{t('admMetricas.colRider')}</th>
                <th className="px-3 py-2">{t('admMetricas.colCentro')}</th>
                <th className="px-3 py-2">{t('admAlertas.colCorreo')}</th>
                <th className="px-3 py-2 text-center">{t('admMetricas.colHorasOnline')}</th>
                <th className="px-3 py-2 text-center">{t('admMetricas.colViajes')}</th>
                <th className="px-3 py-2 text-center">TPH</th>
                <th className="px-3 py-2 text-center">{t('admAlertas.colSemaforo')}</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((f, i) => {
                const color = semaforoDeTph(f.tph);
                return (
                  <tr key={`${f.dni}-${i}`} className={color === 'rojo' ? 'border-b border-border bg-red-50/40' : 'border-b border-border'}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 font-medium text-ink">
                        {color === 'rojo' && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-danger" />}
                        {f.nombre}
                      </div>
                      <div className="font-mono text-[10px] text-ink-muted">{f.dni}</div>
                    </td>
                    <td className="max-w-[110px] truncate px-3 py-2 text-ink-muted" title={f.centro}>
                      {f.centro}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-ink-muted" title={f.email}>
                      {f.email}
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{fmtFloat(f.online_hours)}</td>
                    <td className="px-3 py-2 text-center font-mono text-danger">{f.num_of_trips}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtFloat(f.tph)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`mx-auto block h-3 w-3 rounded-full ${SEMAFORO_COLOR[color]}`} title={t(`admAlertas.semaforo.${color}`)} />
                    </td>
                  </tr>
                );
              })}
              {alertas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-ink-muted">
                    {t('admAlertas.sinAlertas')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
