'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Gauge, TrendingUp, Ban, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { obtenerMiResumenSemanal, obtenerMisDiasSemana, type MisMetricasResumen, type MisMetricasDia } from '@/app/rider/dashboard/actions';
import { semanaIsoDe, semanaEsMuyAntigua } from '@/lib/metricas';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

const fmtFloat = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '—');
const fmtDMY = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

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
  const { t, idioma } = useIdioma();
  const fmtInt = (n: number) => Math.round(n).toLocaleString(idioma === 'en' ? 'en-US' : 'es-ES');
  const [semana, setSemana] = useState(() => semanaIsoDe(new Date()));
  const [resumen, setResumen] = useState<MisMetricasResumen | null>(null);
  const [dias, setDias] = useState<MisMetricasDia[]>([]);
  const [cargando, setCargando] = useState(true);
  const turnoRef = useRef(0);

  useEffect(() => {
    const miTurno = ++turnoRef.current;
    setCargando(true);
    Promise.all([obtenerMiResumenSemanal(semana.year, semana.week), obtenerMisDiasSemana(semana.year, semana.week)])
      .then(([r, d]) => {
        if (turnoRef.current !== miTurno) return; // respuesta vieja de un clic anterior: ignorar
        setResumen(r);
        setDias(d);
      })
      .finally(() => {
        if (turnoRef.current === miTurno) setCargando(false);
      });
  }, [semana]);

  function semanaDesplazada(delta: number): { year: number; week: number } {
    const { lunes } = rangoSemanaIso(semana.year, semana.week);
    const d = new Date(lunes + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * 7);
    return semanaIsoDe(d);
  }

  function cambiarSemana(delta: number) {
    const nueva = semanaDesplazada(delta);
    // Solo se puede ver la semana actual y, como máximo, la anterior —
    // no tiene sentido navegar a semanas más viejas, ni tampoco a
    // semanas futuras.
    if (delta < 0 && semanaEsMuyAntigua(nueva.year, nueva.week)) return;
    setSemana(nueva);
  }

  const rango = rangoSemanaIso(semana.year, semana.week);
  const semanaHoy = semanaIsoDe(new Date());
  const esSemanaActual = semana.year === semanaHoy.year && semana.week === semanaHoy.week;
  const anteriorPosible = semanaDesplazada(-1);
  const anteriorDeshabilitado = semanaEsMuyAntigua(anteriorPosible.year, anteriorPosible.week);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => cambiarSemana(-1)}
          disabled={anteriorDeshabilitado}
          className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('metricas.semanaAnterior')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">
            {t('metricas.semanaDel')} {fmtDMY(rango.lunes)} {t('metricas.al')} {fmtDMY(rango.domingo)}
          </p>
          <p className="text-xs text-brand-text">{esSemanaActual ? t('metricas.estaSemanaLabel') : t('metricas.semanaAnterior')}</p>
        </div>
        <button
          onClick={() => cambiarSemana(1)}
          disabled={esSemanaActual}
          className="rounded-full border border-border p-1.5 text-ink-muted hover:text-ink disabled:opacity-30"
          aria-label={t('metricas.semanaSiguiente')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-10 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !resumen || !resumen.hayDatos ? (
        <div className="flex flex-col items-center gap-1 py-10 text-center text-ink-muted">
          <p className="text-sm font-medium">{t('metricas.sinDatos')}</p>
          <p className="text-xs">{t('metricas.pruebaAnterior')}</p>
        </div>
      ) : (
        <>
          {/* Día a día: solo los días que ya pasaron de esta semana */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-left uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2">{t('metricas.dia')}</th>
                  <th className="px-3 py-2 text-center">{t('metricas.viajes')}</th>
                  <th className="px-3 py-2 text-center">{t('metricas.horas')}</th>
                  <th className="px-3 py-2 text-center">{t('metricas.tph')}</th>
                  <th className="px-3 py-2 text-center">{t('metricas.aceptacion')}</th>
                  <th className="px-3 py-2 text-center">{t('metricas.cancelacion')}</th>
                </tr>
              </thead>
              <tbody>
                {dias.filter((d) => d.hayDatos).map((d) => (
                  <tr key={d.fecha} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{d.dia}</div>
                      <div className="font-mono text-[10px] text-ink-muted">{fmtDMY(d.fecha)}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-primary">{fmtInt(d.num_of_trips)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtFloat(d.online_hours)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtFloat(d.tph)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtPct(d.acceptance_rate)}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtPct(d.cancelation_rate)}</td>
                  </tr>
                ))}
                {dias.filter((d) => d.hayDatos).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                      {t('metricas.sinDiasEstaSemana')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Resumen de toda la semana */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('metricas.resumenSemana')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Tile icon={CheckCircle2} label={t('metricas.viajesRealizados')} value={fmtInt(resumen.num_of_trips)} />
              <Tile icon={Clock} label={t('metricas.horasOnline')} value={fmtFloat(resumen.online_hours)} />
              <Tile icon={Gauge} label={t('metricas.viajesPorHora')} value={fmtFloat(resumen.tph)} />
              <Tile
                icon={TrendingUp}
                label={t('metricas.aceptacion')}
                value={fmtPct(resumen.acceptance_rate)}
                tono={resumen.acceptance_rate >= 0.95 ? 'green' : undefined}
              />
              <div className="col-span-2">
                <Tile
                  icon={Ban}
                  label={t('metricas.cancelacion')}
                  value={fmtPct(resumen.cancelation_rate)}
                  tono={resumen.cancelation_rate === 0 ? 'green' : resumen.cancelation_rate >= 0.1 ? 'red' : undefined}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
