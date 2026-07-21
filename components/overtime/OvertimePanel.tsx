'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Loader2, RefreshCw, Search, Download } from 'lucide-react';
import { centrosConsultablesOvertime, actualizarYObtenerOvertime, auditarOvertime, type FilaOvertime, type CentroConId } from '@/app/dashboard/overtime/actions';
import { SortableTh, type Direccion } from '@/components/overtime/SortableTh';

const ORDEN_DIA: Record<string, number> = { Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5, Sábado: 6, Domingo: 7 };
const ORDEN_ESTADO: Record<string, number> = { Pendiente: 0, Confirmado: 1, Rechazado: 2 };
type CampoOrdenOvertime = 'centro' | 'rider' | 'fecha' | 'zona' | 'horasUber' | 'horasOnDemand' | 'estado';

/** Lunes (ISO yyyy-mm-dd) de la semana de una fecha dada. */
function lunesDe(fechaIso: string): string {
  const d = new Date(fechaIso + 'T12:00:00Z');
  const off = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - off);
  return d.toISOString().split('T')[0];
}
function fmtDMY(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function domingoDe(lunes: string) {
  const d = new Date(lunes + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}

const DIAS = ['Todos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function OvertimePanel() {
  const [centros, setCentros] = useState<CentroConId[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [busquedaCentro, setBusquedaCentro] = useState('');
  const [fecha, setFecha] = useState(() => lunesDe(new Date().toISOString().split('T')[0]));
  const [filtroDia, setFiltroDia] = useState('Todos');
  const [filas, setFilas] = useState<FilaOvertime[]>([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoCentros, setCargandoCentros] = useState(true);
  const [forzar, setForzar] = useState(false);
  const [infoConsulta, setInfoConsulta] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [huboConsulta, setHuboConsulta] = useState(false);
  const [pendienteAuditoria, startAuditoria] = useTransition();

  useEffect(() => {
    centrosConsultablesOvertime()
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
      const res = await actualizarYObtenerOvertime(Array.from(seleccionados), fecha, forzar);
      setFilas(res.filas);
      setErrores(res.errores);
      const desdeCache = seleccionados.size - res.consultados;
      setInfoConsulta(
        res.consultados === 0
          ? `Todo servido desde datos recientes (menos de 5 min) — sin consultar la API`
          : desdeCache > 0
          ? `${res.consultados} centro(s) consultados a la API, ${desdeCache} desde datos recientes`
          : `${res.consultados} centro(s) consultados a la API`
      );
    } finally {
      setCargando(false);
    }
  }

  const [ordenCampo, setOrdenCampo] = useState<CampoOrdenOvertime | null>(null);
  const [ordenDir, setOrdenDir] = useState<Direccion>('asc');

  function ordenarPor(campo: CampoOrdenOvertime) {
    if (ordenCampo === campo) setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setOrdenCampo(campo);
      setOrdenDir('asc');
    }
  }

  const filasFiltradas = filas.filter((f) => filtroDia === 'Todos' || f.dia === filtroDia);

  const filasOrdenadas = useMemo(() => {
    if (!ordenCampo) return filasFiltradas;
    const signo = ordenDir === 'asc' ? 1 : -1;
    return [...filasFiltradas].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      switch (ordenCampo) {
        case 'fecha':
          va = a.fecha + (ORDEN_DIA[a.dia] ?? 0);
          vb = b.fecha + (ORDEN_DIA[b.dia] ?? 0);
          break;
        case 'estado':
          va = ORDEN_ESTADO[a.estado] ?? 9;
          vb = ORDEN_ESTADO[b.estado] ?? 9;
          break;
        case 'horasUber':
          va = a.horasUber;
          vb = b.horasUber;
          break;
        case 'horasOnDemand':
          va = a.horasOnDemand;
          vb = b.horasOnDemand;
          break;
        default:
          va = String(a[ordenCampo] ?? '').toLowerCase();
          vb = String(b[ordenCampo] ?? '').toLowerCase();
      }
      if (va < vb) return -1 * signo;
      if (va > vb) return 1 * signo;
      return 0;
    });
  }, [filasFiltradas, ordenCampo, ordenDir]);

  const totales = filasFiltradas.reduce(
    (acc, f) => {
      if (f.estado !== 'Rechazado') {
        acc.total += f.horasTotal;
        acc.uber += f.horasUber;
        acc.onDemand += f.horasOnDemand;
      }
      if (f.estado === 'Pendiente') acc.pendientes++;
      return acc;
    },
    { total: 0, uber: 0, onDemand: 0, pendientes: 0 }
  );

  /** Exporta exactamente lo que se ve en pantalla (con los filtros/orden activos), sin volver a consultar el servidor. */
  async function exportar() {
    const XLSX = await import('xlsx');
    const hoja = XLSX.utils.json_to_sheet(
      filasOrdenadas.map((f) => ({
        Centro: f.centro,
        Rider: f.rider,
        Usuario: f.usuario,
        Día: f.dia,
        Fecha: fmtDMY(f.fecha),
        Zona: f.zona,
        Horario: f.horario,
        'Horas Uber': f.horasUber,
        'Horas On Demand': f.horasOnDemand,
        'Horas Total': f.horasTotal,
        Estado: f.estado,
        'Auditado por': f.auditadoPor ?? '',
        'Auditado en': f.auditadoEn ?? '',
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Horas extra');
    XLSX.writeFile(libro, `horas_extra_${fecha}.xlsx`);
  }

  function auditar(id: number, estado: 'Pendiente' | 'Confirmado' | 'Rechazado') {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, estado } : f)));
    startAuditoria(async () => {
      try {
        await auditarOvertime(id, estado);
      } catch {
        // revertir si falla
        setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, estado: f.estado } : f)));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        {/* Panel de filtros */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Semana</label>
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
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Ciudades / Centros</label>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{seleccionados.size} sel.</span>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                placeholder="Buscar centro..."
                value={busquedaCentro}
                onChange={(e) => setBusquedaCentro(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-ink focus:border-primary focus:outline-none"
              />
            </div>
            <div className="mb-2 flex gap-3 text-xs text-ink-muted">
              <button onClick={() => setSeleccionados(new Set(centros.map((c) => c.id)))} className="hover:text-primary">
                Todas
              </button>
              <button onClick={() => setSeleccionados(new Set())} className="hover:text-primary">
                Ninguna
              </button>
            </div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
              {cargandoCentros && <p className="text-xs text-ink-muted">Cargando centros...</p>}
              {!cargandoCentros && centrosFiltrados.length === 0 && <p className="text-xs text-ink-muted">Sin centros disponibles.</p>}
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
            Forzar actualización en vivo (ignorar datos recientes)
          </label>

          <button
            onClick={consultar}
            disabled={cargando || seleccionados.size === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {cargando ? 'Consultando...' : 'Obtener datos'}
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
              <div className="flex items-center gap-2">
                <select
                  value={filtroDia}
                  onChange={(e) => setFiltroDia(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  {DIAS.map((d) => (
                    <option key={d} value={d}>
                      {d === 'Todos' ? 'Toda la semana' : d}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-ink-muted">{filasFiltradas.length} registro(s)</span>
                <button
                  onClick={exportar}
                  disabled={filasOrdenadas.length === 0}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar a Excel
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Total validadas" value={totales.total} />
                <StatCard label="Uber Eats" value={totales.uber} tono="blue" />
                <StatCard label="On Demand" value={totales.onDemand} tono="green" />
                <StatCard label="Pendientes" value={totales.pendientes} entero tono="gray" />
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface uppercase tracking-wide text-ink-muted">
                      <SortableTh campo="centro" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor}>Centro</SortableTh>
                      <SortableTh campo="rider" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor}>Rider</SortableTh>
                      <SortableTh campo="fecha" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor}>Día / Fecha</SortableTh>
                      <SortableTh campo="zona" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor}>Horario / Zona</SortableTh>
                      <SortableTh campo="horasUber" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">Uber</SortableTh>
                      <SortableTh campo="horasOnDemand" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">On Demand</SortableTh>
                      <SortableTh campo="estado" activo={ordenCampo} direccion={ordenDir} onClick={ordenarPor} align="center">Auditoría</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {filasOrdenadas.map((f) => (
                      <tr key={f.id} className={`border-b border-border ${f.estado === 'Rechazado' ? 'opacity-40' : ''}`}>
                        <td className="max-w-[110px] truncate px-3 py-2 text-ink-muted" title={f.centro}>
                          {f.centro}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-ink">{f.rider || '—'}</div>
                          <div className="font-mono text-[10px] text-ink-muted">{f.usuario}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-ink">{f.dia}</div>
                          <div className="font-mono text-[10px] text-ink-muted">{f.fecha}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{f.horario}</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-ink-muted">{f.zona}</div>
                        </td>
                        <td className="px-3 py-2 text-center font-mono">{f.horasUber > 0 ? f.horasUber.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2 text-center font-mono text-primary">{f.horasOnDemand > 0 ? f.horasOnDemand.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <AuditoriaCell fila={f} disabled={pendienteAuditoria} onCambiar={auditar} />
                        </td>
                      </tr>
                    ))}
                    {filasOrdenadas.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-ink-muted">
                          Sin registros para este filtro.
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
              <p className="text-sm font-medium">Sin datos cargados</p>
              <p className="text-xs">Selecciona semana y centros, luego pulsa &quot;Obtener datos&quot;</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tono, entero }: { label: string; value: number; tono?: 'blue' | 'green' | 'gray'; entero?: boolean }) {
  const color = tono === 'blue' ? 'text-blue-600' : tono === 'green' ? 'text-emerald-600' : tono === 'gray' ? 'text-ink-muted' : 'text-brand-text';
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`font-mono text-lg font-medium ${color}`}>
        {entero ? value : value.toFixed(2)}
        {!entero && <span className="text-xs opacity-50">h</span>}
      </div>
    </div>
  );
}

function AuditoriaCell({
  fila,
  disabled,
  onCambiar,
}: {
  fila: FilaOvertime;
  disabled: boolean;
  onCambiar: (id: number, estado: 'Pendiente' | 'Confirmado' | 'Rechazado') => void;
}) {
  if (fila.estado === 'Pendiente') {
    return (
      <div className="flex justify-center gap-1">
        <button
          disabled={disabled}
          onClick={() => onCambiar(fila.id, 'Confirmado')}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-300 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          title="Confirmar"
        >
          ✓
        </button>
        <button
          disabled={disabled}
          onClick={() => onCambiar(fila.id, 'Rechazado')}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-red-300 text-danger hover:bg-red-50 disabled:opacity-50"
          title="Rechazar"
        >
          ✗
        </button>
      </div>
    );
  }
  const confirmado = fila.estado === 'Confirmado';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        disabled={disabled}
        onClick={() => onCambiar(fila.id, 'Pendiente')}
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          confirmado ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-danger'
        }`}
      >
        {confirmado ? '✓ OK' : '✗ NO'}
      </button>
      {fila.auditadoPor && <span className="text-[9px] text-ink-muted">{fila.auditadoPor}</span>}
    </div>
  );
}
