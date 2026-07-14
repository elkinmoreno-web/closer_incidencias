'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Gauge, TrendingUp, Ban, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { obtenerMisMetricasSemana, obtenerSemanasConDatos, type FilaMetricaDiariaRider } from '@/app/rider/dashboard/actions';
import { summarizeRows, lunesDe, domingoDe, fmtDMY } from '@/lib/metricas';

const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('es-ES'));
const fmtFloat = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(d));
const fmtPct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(0)}%`);

function Tile({ icon: Icon, label, value, tono }: { icon: typeof Clock; label: string; value: string; tono?: 'green' | 'red' }) {
  const color = tono === 'green' ? 'text-emerald-600' : tono === 'red' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className={`mt-2 font-mono text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

export function MetricasPanel() {
  const [fechaLunes, setFechaLunes] = useState(() => lunesDe(new Date().toISOString().split('T')[0]));
  const [filas, setFilas] = useState<FilaMetricaDiariaRider[]>([]);
  const [semanasConDatos, setSemanasConDatos] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerSemanasConDatos().then((dias) => {
      setSemanasConDatos(new Set(dias.map((d) => lunesDe(d))));
    });
  }, []);

  useEffect(() => {
    setCargando(true);
    obtenerMisMetricasSemana(fechaLunes, domingoDe(fechaLunes))
      .then(setFilas)
      .finally(() => setCargando(false));
  }, [fechaLunes]);

  const resumen = useMemo(() => summarizeRows(filas), [filas]);

  function cambiarSemana(delta: number) {
    const d = new Date(fechaLunes + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setFechaLunes(d.toISOString().split('T')[0]);
  }

  const hoy = lunesDe(new Date().toISOString().split('T')[0]);
  const esSemanaActual = fechaLunes === hoy;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => cambiarSemana(-1)} className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink" aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">
            {fmtDMY(fechaLunes)} → {fmtDMY(domingoDe(fechaLunes))}
          </p>
          <p className="text-xs text-brand-text">{esSemanaActual ? 'Esta semana' : 'Semana anterior'}</p>
        </div>
        <button
          onClick={() => cambiarSemana(1)}
          disabled={esSemanaActual}
          className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink disabled:opacity-30"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-10 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !resumen ? (
        <div className="flex flex-col items-center gap-1 py-10 text-center text-ink-muted">
          <p className="text-sm font-medium">Sin datos para esta semana</p>
          <p className="text-xs">
            {semanasConDatos.has(fechaLunes) ? 'Puede tardar unas horas en actualizarse.' : 'Prueba con la semana anterior.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Tile icon={CheckCircle2} label="Viajes realizados" value={fmtInt(resumen.completed_trips)} />
          <Tile icon={Clock} label="Horas conectado" value={fmtFloat(resumen.sh)} />
          <Tile icon={Gauge} label="Viajes / hora" value={fmtFloat(resumen.tph)} />
          <Tile icon={TrendingUp} label="Aceptación" value={fmtPct(resumen.pct_accept)} tono={resumen.pct_accept !== null && resumen.pct_accept >= 95 ? 'green' : undefined} />
          <div className="col-span-2">
            <Tile
              icon={Ban}
              label="Cancelación"
              value={fmtPct(resumen.pct_cancel)}
              tono={resumen.pct_cancel === 0 ? 'green' : resumen.pct_cancel !== null && resumen.pct_cancel >= 10 ? 'red' : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
