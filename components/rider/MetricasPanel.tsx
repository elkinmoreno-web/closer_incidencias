'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Gauge, TrendingUp, Ban, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { obtenerMisMetricasSemana, type MisMetricasSemana } from '@/app/rider/dashboard/actions';
import { semanaIsoDe } from '@/lib/metricas';

const fmtInt = (n: number) => Math.round(n).toLocaleString('es-ES');
const fmtFloat = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '—');

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
  const [semana, setSemana] = useState(() => semanaIsoDe(new Date()));
  const [datos, setDatos] = useState<MisMetricasSemana | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    obtenerMisMetricasSemana(semana.year, semana.week)
      .then(setDatos)
      .finally(() => setCargando(false));
  }, [semana]);

  function cambiarSemana(delta: number) {
    // Aproximación simple: mover 7 días desde el lunes de la semana ISO actual.
    const base = new Date(Date.UTC(semana.year, 0, 1 + (semana.week - 1) * 7));
    base.setUTCDate(base.getUTCDate() + delta * 7);
    setSemana(semanaIsoDe(base));
  }

  const semanaHoy = semanaIsoDe(new Date());
  const esSemanaActual = semana.year === semanaHoy.year && semana.week === semanaHoy.week;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => cambiarSemana(-1)} className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink" aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">Semana ISO {semana.week} · {semana.year}</p>
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
      ) : !datos || !datos.hayDatos ? (
        <div className="flex flex-col items-center gap-1 py-10 text-center text-ink-muted">
          <p className="text-sm font-medium">Sin datos para esta semana</p>
          <p className="text-xs">Prueba con la semana anterior.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Tile icon={CheckCircle2} label="Viajes realizados" value={fmtInt(datos.num_of_trips)} />
          <Tile icon={Clock} label="Horas online" value={fmtFloat(datos.online_hours)} />
          <Tile icon={Gauge} label="Viajes / hora" value={fmtFloat(datos.tph)} />
          <Tile icon={TrendingUp} label="Aceptación" value={fmtPct(datos.acceptance_rate)} tono={datos.acceptance_rate >= 0.95 ? 'green' : undefined} />
          <div className="col-span-2">
            <Tile icon={Ban} label="Cancelación" value={fmtPct(datos.cancelation_rate)} tono={datos.cancelation_rate === 0 ? 'green' : datos.cancelation_rate >= 0.1 ? 'red' : undefined} />
          </div>
        </div>
      )}
    </div>
  );
}
