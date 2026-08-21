import { createClient } from '@/lib/supabase/server';
import { StatCard } from '@/components/ui/StatCard';
import { AdminPerformanceChart } from '@/components/reportes/AdminPerformanceChart';
import { MotivosChart } from '@/components/reportes/MotivosChart';
import { daysAgoISO } from '@/lib/utils';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor, nombreSegunIdioma } from '@/lib/i18n/traducir';

export default async function ReportesPage() {
  const idioma = await resolverIdioma();
  const t = crearTraductor(idioma);
  const supabase = createClient();
  const desde = daysAgoISO(30);

  const { data: incidencias } = await supabase
    .from('incidencias')
    .select('estado, created_at, fecha_gestion, gestor_id, admins:gestor_id(usuario), motivos(nombre, nombre_en)')
    .gte('created_at', desde);

  const filas = (incidencias ?? []) as unknown as {
    estado: string;
    created_at: string;
    fecha_gestion: string | null;
    gestor_id: string | null;
    admins: { usuario: string } | null;
    motivos: { nombre: string; nombre_en: string | null } | null;
  }[];

  // ---- Rendimiento por admin ----
  const porAdmin = new Map<string, { usuario: string; aprobadas: number; rechazadas: number; sumaMinutos: number; conTiempo: number }>();
  for (const i of filas) {
    if (!i.gestor_id || !i.admins) continue;
    const key = i.gestor_id;
    if (!porAdmin.has(key)) {
      porAdmin.set(key, { usuario: i.admins.usuario, aprobadas: 0, rechazadas: 0, sumaMinutos: 0, conTiempo: 0 });
    }
    const entry = porAdmin.get(key)!;
    if (i.estado === 'aprobada') entry.aprobadas++;
    if (i.estado === 'rechazada') entry.rechazadas++;
    if (i.fecha_gestion) {
      const minutos = (new Date(i.fecha_gestion).getTime() - new Date(i.created_at).getTime()) / 60000;
      if (minutos >= 0) {
        entry.sumaMinutos += minutos;
        entry.conTiempo++;
      }
    }
  }
  const rendimientoAdmins = Array.from(porAdmin.values()).sort((a, b) => b.aprobadas + b.rechazadas - (a.aprobadas + a.rechazadas));

  // ---- Distribución de motivos ----
  const porMotivo = new Map<string, number>();
  for (const i of filas) {
    const nombre = i.motivos ? nombreSegunIdioma(idioma, i.motivos.nombre, i.motivos.nombre_en) : t('reportes.sinMotivo');
    porMotivo.set(nombre, (porMotivo.get(nombre) ?? 0) + 1);
  }
  const motivosData = Array.from(porMotivo.entries())
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  // ---- Totales ----
  const totalGestionadas = filas.filter((i) => i.estado === 'aprobada' || i.estado === 'rechazada').length;
  const tiempoPromedioGlobal =
    rendimientoAdmins.reduce((acc, a) => acc + a.sumaMinutos, 0) /
      Math.max(1, rendimientoAdmins.reduce((acc, a) => acc + a.conTiempo, 0)) || 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('reportes.titulo')}</h1>
        <p className="text-sm text-ink-muted">{t('reportes.subtitulo')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('reportes.incidenciasGestionadas')} value={totalGestionadas} />
        <StatCard label={t('reportes.adminsActivos')} value={rendimientoAdmins.length} />
        <StatCard
          label={t('reportes.tiempoMedioRespuesta')}
          value={tiempoPromedioGlobal > 0 ? `${Math.round(tiempoPromedioGlobal)} ${t('reportes.min')}` : '—'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold text-ink">{t('reportes.aprobadasRechazadasPorAdmin')}</h2>
          <AdminPerformanceChart data={rendimientoAdmins} />
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold text-ink">{t('reportes.motivosFrecuentes')}</h2>
          <MotivosChart data={motivosData} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">{t('reportes.colAdmin')}</th>
              <th className="px-4 py-3">{t('reportes.colAprobadas')}</th>
              <th className="px-4 py-3">{t('reportes.colRechazadas')}</th>
              <th className="px-4 py-3">{t('reportes.colTiempoMedio')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rendimientoAdmins.map((a) => (
              <tr key={a.usuario}>
                <td className="px-4 py-3 font-medium text-ink">{a.usuario}</td>
                <td className="px-4 py-3">{a.aprobadas}</td>
                <td className="px-4 py-3">{a.rechazadas}</td>
                <td className="px-4 py-3">{a.conTiempo > 0 ? `${Math.round(a.sumaMinutos / a.conTiempo)} ${t('reportes.min')}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
