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
import { paginasAMostrar } from '@/lib/pagination';
// Cabecera con orden + filtro por columna. Vive en components/stock porque
// nació allí, pero es genérica y ya la usan varias tablas del proyecto.
import { ThFiltro, cumpleFiltroTexto, cumpleFiltroNumero, type DireccionOrden, type FiltroColumna } from '@/components/stock/ThFiltro';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

const fmtFloat = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

const POR_PAGINA = 30;

type Modo = 'diario' | 'semanal';
type Semaforo = 'rojo' | 'naranja' | 'verde';
type CampoOrden = 'semaforo' | 'nombre' | 'centro' | 'email' | 'online_hours' | 'num_of_trips' | 'tph';

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

/** Para ordenar por gravedad: el rojo va primero. */
const SEMAFORO_RANGO: Record<Semaforo, number> = { rojo: 0, naranja: 1, verde: 2 };

const TODOS_LOS_SEMAFOROS: Semaforo[] = ['rojo', 'naranja', 'verde'];

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

  const [consulta, setConsulta] = useState(0);
  const turnoRef = useRef(0);

  const [parametros, setParametros] = useState<AlertasParametros | null>(null);

  // El semáforo va SIEMPRE visible (fuera del panel de filtros) y se aplica
  // al instante: es el filtro que más se usa para "¿a quién llamo hoy?".
  const [semaforosActivos, setSemaforosActivos] = useState<Set<Semaforo>>(new Set(TODOS_LOS_SEMAFOROS));

  // El resto de filtros (umbral de horas/pedidos y búsqueda) siguen detrás
  // del botón "Filtros" y solo se aplican al pulsar "Aplicar".
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filtrosAplicados, setFiltrosAplicados] = useState(false);
  const [horasMin, setHorasMin] = useState(6);
  const [pedidosMin, setPedidosMin] = useState(8);
  const [busqueda, setBusqueda] = useState('');
  const [horasMinAplicado, setHorasMinAplicado] = useState(6);
  const [pedidosMinAplicado, setPedidosMinAplicado] = useState(8);
  const [busquedaAplicada, setBusquedaAplicada] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);

  // Orden y filtros por columna. Por defecto: los peores primero (rojo
  // arriba y, dentro de cada color, el TPH más bajo).
  const [orden, setOrden] = useState<{ campo: CampoOrden; dir: DireccionOrden }>({ campo: 'semaforo', dir: 'asc' });
  const [filtrosCol, setFiltrosCol] = useState<Record<string, FiltroColumna | undefined>>({});
  const [pagina, setPagina] = useState(1);

  function alternarSemaforo(color: Semaforo) {
    setSemaforosActivos((prev) => {
      const next = new Set(prev);
      if (next.has(color)) {
        if (next.size > 1) next.delete(color); // nunca se deja el filtro vacío
      } else {
        next.add(color);
      }
      return next;
    });
  }

  function ordenarPor(campo: CampoOrden, dir: DireccionOrden) {
    setOrden(dir === null ? { campo: 'semaforo', dir: 'asc' } : { campo, dir });
  }

  function filtrarCol(clave: string, f: FiltroColumna | undefined) {
    setFiltrosCol((prev) => ({ ...prev, [clave]: f }));
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
        setPagina(1);
      })
      .finally(() => {
        if (turnoRef.current === miTurno) setCargando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberado: solo re-consulta al llegar los centros o al pulsar "Cargar"
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

  // 1) Base: solo el umbral de horas/pedidos y la búsqueda (lo que está
  //    detrás de "Aplicar"). El recuento del semáforo se calcula sobre
  //    ESTA base, para que los totales no cambien al togglear los colores.
  const filasBase = useMemo(() => {
    if (!filtrosAplicados) return filas;
    const q = busquedaAplicada.trim().toLowerCase();
    return filas
      .filter((f) => f.online_hours >= horasMinAplicado && f.num_of_trips < pedidosMinAplicado)
      .filter((f) => !q || f.nombre.toLowerCase().includes(q) || f.dni.toLowerCase().includes(q) || f.email.toLowerCase().includes(q) || f.centro.toLowerCase().includes(q));
  }, [filas, filtrosAplicados, horasMinAplicado, pedidosMinAplicado, busquedaAplicada]);

  const conteo = useMemo(() => {
    const c: Record<Semaforo, number> = { rojo: 0, naranja: 0, verde: 0 };
    for (const f of filasBase) c[semaforoDeTph(f.tph)]++;
    return c;
  }, [filasBase]);

  // 2) Semáforo + filtros por columna + orden.
  const alertas = useMemo(() => {
    const filtradas = filasBase
      .filter((f) => semaforosActivos.has(semaforoDeTph(f.tph)))
      .filter(
        (f) =>
          cumpleFiltroTexto(f.nombre + ' ' + f.dni, filtrosCol.nombre) &&
          cumpleFiltroTexto(f.centro, filtrosCol.centro) &&
          cumpleFiltroTexto(f.email, filtrosCol.email) &&
          cumpleFiltroNumero(f.online_hours, filtrosCol.online_hours) &&
          cumpleFiltroNumero(f.num_of_trips, filtrosCol.num_of_trips) &&
          cumpleFiltroNumero(f.tph, filtrosCol.tph)
      );

    const signo = orden.dir === 'desc' ? -1 : 1;
    const valor = (f: FilaMetricaAdmin): number | string => {
      switch (orden.campo) {
        case 'nombre': return f.nombre.toLowerCase();
        case 'centro': return f.centro.toLowerCase();
        case 'email': return f.email.toLowerCase();
        case 'online_hours': return f.online_hours;
        case 'num_of_trips': return f.num_of_trips;
        case 'tph': return f.tph;
        default: return SEMAFORO_RANGO[semaforoDeTph(f.tph)];
      }
    };

    return [...filtradas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      if (cmp !== 0) return cmp * signo;
      // Desempate estable: siempre el peor TPH primero.
      return a.tph - b.tph;
    });
  }, [filasBase, semaforosActivos, filtrosCol, orden]);

  useEffect(() => {
    setPagina(1);
  }, [semaforosActivos, filtrosCol, filtrosAplicados, orden]);

  const totalPaginas = Math.max(1, Math.ceil(alertas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const desde = (paginaSegura - 1) * POR_PAGINA;
  const alertasPagina = alertas.slice(desde, desde + POR_PAGINA);
  const paginas = paginasAMostrar(paginaSegura, totalPaginas);

  function aplicarFiltros() {
    setHorasMinAplicado(horasMin);
    setPedidosMinAplicado(pedidosMin);
    setBusquedaAplicada(busqueda);
    setFiltrosAplicados(true);
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

  const soloRojos = semaforosActivos.size === 1 && semaforosActivos.has('rojo');

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

      {/* Aviso destacado: cuántos están en rojo y acceso directo a verlos. */}
      {!cargando && conteo.rojo > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <TriangleAlert className="h-5 w-5 shrink-0 text-danger" />
          <p className="text-sm font-semibold text-danger">
            {t('admAlertas.resumenRojos').replace('{n}', String(conteo.rojo))}
          </p>
          <span className="text-xs text-ink-muted">
            {t('admAlertas.resumenResto').replace('{naranja}', String(conteo.naranja)).replace('{verde}', String(conteo.verde))}
          </span>
          <button
            onClick={() => setSemaforosActivos(new Set(soloRojos ? TODOS_LOS_SEMAFOROS : (['rojo'] as Semaforo[])))}
            className="ml-auto rounded-full bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            {soloRojos ? t('admAlertas.verTodos') : t('admAlertas.verSoloRojos')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
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
            <button onClick={() => setFiltrosAplicados(false)} className="flex items-center gap-1 text-xs text-ink-muted hover:text-danger">
              <X className="h-3 w-3" />
              {t('admAlertas.quitarFiltros')}
            </button>
          )}
          <span className="text-xs text-ink-muted">
            {t('admAlertas.totalMostrados').replace('{n}', String(alertas.length))}
          </span>
        </div>

        {/* Semáforo SIEMPRE visible, a la derecha */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('admAlertas.semaforoTph')}</span>
          {TODOS_LOS_SEMAFOROS.map((color) => (
            <button
              key={color}
              onClick={() => alternarSemaforo(color)}
              title={t(`admAlertas.semaforo.${color}`)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                semaforosActivos.has(color) ? 'border-border bg-card text-ink' : 'border-transparent text-ink-muted opacity-40'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${SEMAFORO_COLOR[color]}`} />
              {t(`admAlertas.semaforo.${color}`)}
              <span className="font-mono text-[10px] text-ink-muted">{conteo[color]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtrosAbiertos && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('admAlertas.filtrarPlaceholder')}
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-ink focus:border-primary focus:outline-none"
            />
          </div>
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
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[860px] text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-left uppercase tracking-wide text-ink-muted">
                  <ThFiltro
                    label={t('admMetricas.colRider')}
                    ordenActivo={orden.campo === 'nombre' ? orden.dir : null}
                    onOrdenar={(d) => ordenarPor('nombre', d)}
                    filtro={filtrosCol.nombre}
                    onFiltrar={(f) => filtrarCol('nombre', f)}
                  />
                  <ThFiltro
                    label={t('admMetricas.colCentro')}
                    ordenActivo={orden.campo === 'centro' ? orden.dir : null}
                    onOrdenar={(d) => ordenarPor('centro', d)}
                    filtro={filtrosCol.centro}
                    onFiltrar={(f) => filtrarCol('centro', f)}
                  />
                  <ThFiltro
                    label={t('admAlertas.colCorreo')}
                    ordenActivo={orden.campo === 'email' ? orden.dir : null}
                    onOrdenar={(d) => ordenarPor('email', d)}
                    filtro={filtrosCol.email}
                    onFiltrar={(f) => filtrarCol('email', f)}
                  />
                  <ThFiltro
                    label={t('admMetricas.colHorasOnline')}
                    tipo="numero"
                    align="right"
                    ordenActivo={orden.campo === 'online_hours' ? orden.dir : null}
                    onOrdenar={(d) => ordenarPor('online_hours', d)}
                    filtro={filtrosCol.online_hours}
                    onFiltrar={(f) => filtrarCol('online_hours', f)}
                  />
                  <ThFiltro
                    label={t('admMetricas.colViajes')}
                    tipo="numero"
                    align="right"
                    ordenActivo={orden.campo === 'num_of_trips' ? orden.dir : null}
                    onOrdenar={(d) => ordenarPor('num_of_trips', d)}
                    filtro={filtrosCol.num_of_trips}
                    onFiltrar={(f) => filtrarCol('num_of_trips', f)}
                  />
                  <ThFiltro
                    label="TPH"
                    tipo="numero"
                    align="right"
                    ordenActivo={orden.campo === 'tph' ? orden.dir : null}
                    onOrdenar={(d) => ordenarPor('tph', d)}
                    filtro={filtrosCol.tph}
                    onFiltrar={(f) => filtrarCol('tph', f)}
                  />
                  <th className="px-3 py-2 text-center">
                    <button
                      onClick={() => ordenarPor('semaforo', orden.campo === 'semaforo' && orden.dir === 'asc' ? 'desc' : 'asc')}
                      className="uppercase tracking-wide hover:text-ink"
                      title={t('admAlertas.ordenarPorSemaforo')}
                    >
                      {t('admAlertas.colSemaforo')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {alertasPagina.map((f, i) => {
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
                {alertasPagina.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-ink-muted">
                      {t('admAlertas.sinAlertas')}
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
