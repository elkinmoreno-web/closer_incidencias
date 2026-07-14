import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Tabs } from '@/components/rider/Tabs';
import { IncidenciaForm } from '@/components/rider/IncidenciaForm';
import { AusenciaForm } from '@/components/rider/AusenciaForm';
import { IncidenciasSemanaList } from '@/components/rider/IncidenciasSemanaList';
import { AusenciasSemanaList } from '@/components/rider/AusenciasSemanaList';
import { MetricasPanel } from '@/components/rider/MetricasPanel';
import { inicioSemanaActualISO } from '@/lib/utils';

export default async function RiderDashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/rider/login');

  const { data: rider } = await supabase
    .from('riders')
    .select('id, dni')
    .eq('auth_user_id', user.id)
    .single();

  if (!rider) redirect('/rider/login');

  const inicioSemana = inicioSemanaActualISO();

  const [{ data: motivos }, { data: motivosAusencia }, { data: incidenciasSemana }, { data: ausenciasSemana }] =
    await Promise.all([
      supabase.from('motivos').select('*').eq('activo', true).order('nombre'),
      supabase.from('motivos_ausencia').select('*').eq('activo', true).order('nombre'),
      supabase
        .from('incidencias')
        .select('id, estado, created_at, codigo_pedido, motivo_rechazo, motivos(nombre)')
        .eq('rider_id', rider.id)
        .gte('created_at', inicioSemana)
        .order('created_at', { ascending: false }),
      supabase
        .from('ausencias')
        .select('id, estado, fecha_inicio, fecha_fin, motivo_rechazo, motivos_ausencia(nombre)')
        .eq('rider_id', rider.id)
        .gte('created_at', inicioSemana)
        .order('created_at', { ascending: false }),
    ]);

  return (
    <div className="rounded-card bg-surface p-6 shadow-sm">
      <Tabs
        incidenciaPanel={
          <div className="flex flex-col gap-6">
            <IncidenciaForm dni={rider.dni} motivos={motivos ?? []} />
            <div className="border-t border-border pt-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">Tus incidencias de esta semana</h2>
              <IncidenciasSemanaList incidencias={(incidenciasSemana ?? []) as any} />
            </div>
          </div>
        }
        ausenciaPanel={
          <div className="flex flex-col gap-6">
            <AusenciaForm dni={rider.dni} motivos={motivosAusencia ?? []} />
            <div className="border-t border-border pt-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">Tus ausencias de esta semana</h2>
              <AusenciasSemanaList ausencias={(ausenciasSemana ?? []) as any} />
            </div>
          </div>
        }
        metricasPanel={<MetricasPanel />}
      />
    </div>
  );
}
