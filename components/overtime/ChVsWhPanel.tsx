'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Loader2, RefreshCw, Search, RotateCw, Download } from 'lucide-react';
import { centrosConsultablesChVsWh, obtenerChVsWh, refrescarCalculaHorario, type FilaChVsWh, type CentroConId } from '@/app/dashboard/ch-vs-wh/actions';
import { SortableTh, type Direccion } from '@/components/overtime/SortableTh';
import { lunesDe, domingoDe, fmtDMY } from '@/lib/metricas';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

type CampoOrdenChVsWh = 'centro' | 'rider' | 'ch' | 'wh' | 'balance' | 'horasExtra' | 'calculaHorario' | 'eventos';

export function ChVsWhPanel() {
  const { t } = useIdioma();
  const [centros, setCentros] = useState<CentroConId[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [busquedaCentro, setBusquedaCentro] = useState('');
  const [fecha, setFecha] = useState(() => lunesDe(new Date().toISOString().split('T')[0]));
  const [filas, setFilas] = useState<FilaChVsWh[]>([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoCentros, setCargandoCentros] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [huboConsulta, setHuboConsulta] = useState(false);
  const [forzar, setForzar] = useState(false);
  const [infoConsulta, setInfoConsulta] = useState<string | null>(null);
  const [refrescandoTodos, startRefrescoTodos] = useTransition();
  const [refrescandoUno, setRefrescandoUno] = useState<string | null>(null);

  useEffect(() => {
    centrosConsultablesChVsWh()
      .then((c) => {
        setCentros(c);
        setSeleccionados(new Set(c.map((x) => x.id)));
      })
      .finally(() => setCargandoCentros(false));
  }, []);

  const centrosFiltrados = useMemo(
    () => centros.filter((c) => c.nombre.toLowerCase().includes(busquedaCentro.toLowerCase())),
    [centros, busquedaCentro]
  );

  function toggleCentro(id: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function consultar() {
    if (seleccionados.size === 0) return;
    setCargando(true);
    setHuboConsulta(true);
    try {
      const res = await obtenerChVsWh(Array.from(seleccionados), fecha, forzar);
      setFilas(res.filas);
      setErrores(res.errores);
      setInfoConsulta(
        res.consultados === 0
          ? t('chVsWh.todoDesdeCache')
          : res.desdeCache > 0
          ? `${res.consultados} ${t('chVsWh.centrosConsultadosYCache').replace('{n}', String(res.desdeCache))}`
          : `${res.consultados} ${t('overtime.centrosConsultados')}`
      );
    } finally {
      setCargando(false);
    }
  }

  function refrescarUno(uuid: string | null) {
    if (!uuid) return;
    setRefrescandoUno(uuid);
    refrescarCalculaHorario([uuid])
      .then((mapa) => {
        const valor = mapa.get(uuid);
        if (valor === undefined) return;
        setFilas((prev) => prev.map((f) => (f.uuidExterno === uuid ? { ...f, calculaHorario: valor ? 'Sí' : 'No' } : f)));
      })
      .finally(() => setRefrescandoUno(null));
  }

  function refrescarTodosVisibles() {
    const uuids = Array.from(new Set(filas.map((f) => f.uuidExterno).filter((u): u is string => !!u)));
    if (uuids.length === 0) return;
    startRefrescoTodos(async () => {
      const mapa = await refrescarCalculaHorario(uuids);
      setFilas((prev) => prev.map((f) => (f.uuidExterno && mapa.has(f.uuidExterno) ? { ...f, calculaHorario: mapa.get(f.uuidExterno) ? 'Sí' : 'No' } : f)));
    });
  }

  const [ordenCampo, setOrdenCampo] = useState<CampoOrdenChVsWh | null>(null);
  const [ordenDir, setOrdenDir] = useState<Direccion>('asc');

  function ordenarPor(campo: CampoOrdenChVsWh) {
    if (ordenCampo === campo) setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setOrdenCampo(campo);
      setOrdenDir('asc');
    }
  }

  const filasOrdenadas = useMemo(() => {
    if (!ordenCampo) return filas;
    const signo = ordenDir === 'asc' ? 1 : -1;
    return [...filas].sort((a, b) => {
      let va: string | number = a[ordenCampo] as string | number;
      let vb: string | number = b[ordenCampo] as string | number;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1 * signo;
      if (va > vb) return 1 * signo;
      return 0;
    });
  }, [filas, ordenCampo, ordenDir]);

  /** Exporta exactamente lo que se ve en pantalla (con el orden activo), sin volver a consultar el servidor. */
  async function exportar() {
    const XLSX = await import('xlsx');
    const hoja = XLSX.utils.json_to_sheet(
      filasOrdenadas.map((f) => ({
        [t('overtime.exColCentro')]: f.centro,
        [t('overtime.exColRider')]: f.rider,
        [t('overtime.exColUsuario')]: f.usuario,
        [t('chVsWh.exColCh')]: f.ch,
        [t('chVsWh.exColWh')]: f.wh,
        [t('chVsWh.exColBalance')]: f.balance,
        [t('chVsWh.exColHorasExtra')]: f.horasExtra,
        [t('chVsWh.exColCalculaHorario')]: f.calculaHorario,
        [t('chVsWh.exColEventos')]: f.eventos,
        [t('chVsWh.exColDiasIncidencia')]: f.diasIncidencia,
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, t('chVsWh.exSheetName'));
    XLSX.writeFile(libro, 'ch_vs_wh.xlsx');
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
      {/* Panel de filtros */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('overtime.semana')}</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(lunesDe(e.target.value))}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <p className="mt-2 text-xs text-brand-text">
            📅 {fmtDMY(fecha)} → {fmtDMY(domingoDe(fecha))}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('overtime.ciudadesCentros')}</label>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{seleccionados.size} {t('overtime.seleccionadas')}</span>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder={t('overtime.buscarCentro')}
              value={busquedaCentro}
              onChange={(e) => setBusquedaCentro(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-ink focus:border-primary focus:outline-none"
            />
          </div>
          <div className="mb-2 flex gap-3 text-xs text-ink-muted">
            <button onClick={() => setSeleccionados(new Set(centros.map((c) => c.id)))} className="hover:text-primary">
              {t('overtime.todas')}
            </button>
            <button onClick={() => setSeleccionados(new Set())} className="hover:text-primary">
              {t('overtime.ninguna')}
            </button>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {cargandoCentros && <p className="text-xs text-ink-muted">{t('overtime.cargandoCentros')}</p>}
            {!cargandoCentros && centrosFiltrados.length === 0 && <p className="text-xs text-ink-muted">{t('overtime.sinCentrosDisponibles')}</p>}
            {centrosFiltrados.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-surface">
                <input type="checkbox" checked={seleccionados.has(c.id)} onChange={() => toggleCentro(c.id)} className="accent-primary" />
                <span className={seleccionados.has(c.id) ? 'text-ink' : 'text-ink-muted'}>{c.nombre}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} className="accent-primary" />
          {t('chVsWh.forzarActualizacion')}
        </label>

        <button
          onClick={consultar}
          disabled={cargando || seleccionados.size === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {cargando ? t('overtime.consultando') : t('overtime.obtenerDatos')}
        </button>
        {infoConsulta && <p className="text-xs text-ink-muted">{infoConsulta}</p>}
        {errores.length > 0 && (
          <div className="rounded-lg bg-red-50 p-2 text-xs text-danger">
            {errores.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
      </div>

      {/* Resultados */}
      <div className="space-y-3">
        {huboConsulta && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-muted">{filas.length} {t('chVsWh.riders')}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportar}
                  disabled={filasOrdenadas.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('overtime.exportar')}
                </button>
                <button
                  onClick={refrescarTodosVisibles}
                  disabled={refrescandoTodos || filas.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
                  title={t('chVsWh.tituloRefrescarTodos')}
                >
                  {refrescandoTodos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                  {t('chVsWh.refrescarCalculaHorario')}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface uppercase tracking-wide text-ink-muted">
                    <SortableTh campo="centro" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor}>{t('overtime.colCentro')}</SortableTh>
                    <SortableTh campo="rider" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor}>{t('overtime.colRider')}</SortableTh>
                    <SortableTh campo="ch" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">{t('chVsWh.colCh')}</SortableTh>
                    <SortableTh campo="wh" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">{t('chVsWh.colWh')}</SortableTh>
                    <SortableTh campo="balance" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">{t('chVsWh.colBalance')}</SortableTh>
                    <SortableTh campo="horasExtra" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">{t('chVsWh.colHorasExtra')}</SortableTh>
                    <SortableTh campo="calculaHorario" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">{t('chVsWh.colCalculaHorario')}</SortableTh>
                    <SortableTh campo="eventos" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor}>{t('chVsWh.colIncidencias')}</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map((f, i) => (
                    <tr key={`${f.usuario}-${i}`} className="border-b border-border">
                      <td className="max-w-[110px] truncate px-3 py-2 text-ink-muted" title={f.centro}>
                        {f.centro}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{f.rider || '—'}</div>
                        <div className="font-mono text-[10px] text-ink-muted">{f.usuario}</div>
                      </td>
                      <td className="px-3 py-2 text-center font-mono">{f.ch}</td>
                      <td className="px-3 py-2 text-center font-mono">{f.wh.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-center font-mono font-semibold ${f.balance < 0 ? 'text-danger' : 'text-emerald-600'}`}>
                        {f.balance > 0 ? '+' : ''}
                        {f.balance.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-primary">{f.horasExtra > 0 ? f.horasExtra.toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${f.calculaHorario === 'Sí' ? 'bg-emerald-50 text-emerald-700' : 'bg-surface text-ink-muted'}`}>
                            {f.calculaHorario}
                          </span>
                          {f.uuidExterno && (
                            <button
                              onClick={() => refrescarUno(f.uuidExterno)}
                              disabled={refrescandoUno === f.uuidExterno}
                              title={t('chVsWh.tituloRefrescarUno')}
                              className="text-ink-muted hover:text-primary disabled:opacity-50"
                            >
                              {refrescandoUno === f.uuidExterno ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-ink-muted" title={f.eventos}>
                        {f.eventos || '—'} {f.diasIncidencia > 0 && `(${f.diasIncidencia}d)`}
                      </td>
                    </tr>
                  ))}
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-ink-muted">
                        {t('chVsWh.sinRegistrosSemana')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!huboConsulta && (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-ink-muted">
            <p className="text-sm font-medium">{t('overtime.sinDatosCargados')}</p>
            <p className="text-xs">{t('overtime.seleccionaYPulsa')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
