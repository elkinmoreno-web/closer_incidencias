import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { LiveRefresh } from '@/components/dashboard/LiveRefresh';
import { estadoIncidenciaColor, estadoIncidenciaLabel, formatFecha, startOfTodayMadridISO, daysAgoISO } from '@/lib/utils';

export default async function DashboardOverviewPage() {
  const supabase = createClient();
  const hoy = startOfTodayMadridISO();
  const hace7dias = daysAgoISO(7);

  const [{ count: pendientes }, { count: aprobadasHoy }, { count: rechazadasHoy }, { count: totalSemana }, { data: recientes }] =
    await Promise.all([
      supabase.from('incidencias').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase
        .from('incidencias')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'aprobada')
        .gte('fecha_gestion', hoy),
      supabase
        .from('incidencias')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'rechazada')
        .gte('fecha_gestion', hoy),
      supabase.from('incidencias').select('id', { count: 'exact', head: true }).gte('created_at', hace7dias),
      supabase
        .from('incidencias')
        .select('id, nombre_rider, codigo_pedido, estado, created_at, motivos(nombre)')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh table="incidencias" />
      <div>
        <h1 className="text-2xl font-semibold text-ink">Resumen</h1>
        <p className="text-sm text-ink-muted">Vista general de la actividad de la flota.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pendientes de revisar" value={pendientes ?? 0} accent hint="Requieren tu atención" />
        <StatCard label="Aprobadas hoy" value={aprobadasHoy ?? 0} />
        <StatCard label="Rechazadas hoy" value={rechazadasHoy ?? 0} />
        <StatCard label="Total últimos 7 días" value={totalSemana ?? 0} />
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Últimas pendientes</h2>
          <Link href="/dashboard/incidencias?estado=pendiente" className="text-sm font-medium text-primary hover:underline">
            Ver todas
          </Link>
        </div>

        {!recientes || recientes.length === 0 ? (
          <EmptyState title="No hay incidencias pendientes" description="Todo al día. Buen trabajo." />
        ) : (
          <ul className="divide-y divide-border">
            {recientes.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-ink">{i.nombre_rider}</p>
                  <p className="text-xs text-ink-muted">
                    {(i.motivos as unknown as { nombre: string } | null)?.nombre ?? 'Sin motivo'}
                    {i.codigo_pedido ? ` · Pedido ${i.codigo_pedido}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-muted">{formatFecha(i.created_at)}</span>
                  <Badge className={estadoIncidenciaColor(i.estado)}>{estadoIncidenciaLabel(i.estado)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
