import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Tabs } from '@/components/rider/Tabs';
import { IncidenciaForm } from '@/components/rider/IncidenciaForm';
import { AusenciaForm } from '@/components/rider/AusenciaForm';
import { Badge } from '@/components/ui/Badge';
import {
  estadoIncidenciaColor,
  estadoIncidenciaLabel,
  estadoAusenciaColor,
  estadoAusenciaLabel,
  formatFecha,
  formatFechaCorta,
} from '@/lib/utils';

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

  const [{ data: motivos }, { data: motivosAusencia }, { data: incidenciasRecientes }, { data: ausenciasRecientes }] =
    await Promise.all([
      supabase.from('motivos').select('*').eq('activo', true).order('nombre'),
      supabase.from('motivos_ausencia').select('*').eq('activo', true).order('nombre'),
      supabase
        .from('incidencias')
        .select('id, estado, created_at, codigo_pedido, motivo_rechazo, motivos(nombre)')
        .eq('rider_id', rider.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('ausencias')
        .select('id, estado, fecha_inicio, fecha_fin, motivo_rechazo, motivos_ausencia(nombre)')
        .eq('rider_id', rider.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card bg-surface p-6 shadow-sm">
        <Tabs
          incidenciaPanel={<IncidenciaForm dni={rider.dni} motivos={motivos ?? []} />}
          ausenciaPanel={<AusenciaForm dni={rider.dni} motivos={motivosAusencia ?? []} />}
        />
      </div>

      {incidenciasRecientes && incidenciasRecientes.length > 0 && (
        <div className="rounded-card bg-surface p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-ink">Tus últimas incidencias</h2>
          <ul className="divide-y divide-border">
            {incidenciasRecientes.map((i) => (
              <li key={i.id} className="flex flex-col gap-1 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-ink">
                    {(i.motivos as unknown as { nombre: string } | null)?.nombre ?? 'Sin motivo'}
                    {i.codigo_pedido && (
                      <span className="ml-2 text-xs text-ink-muted">· Pedido {i.codigo_pedido}</span>
                    )}
                  </div>
                  <Badge className={estadoIncidenciaColor(i.estado)}>{estadoIncidenciaLabel(i.estado)}</Badge>
                </div>
                <div className="text-xs text-ink-muted">{formatFecha(i.created_at)}</div>
                {i.estado === 'rechazada' && i.motivo_rechazo && (
                  <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
                    Motivo del rechazo: {i.motivo_rechazo}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ausenciasRecientes && ausenciasRecientes.length > 0 && (
        <div className="rounded-card bg-surface p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-ink">Tus ausencias</h2>
          <ul className="divide-y divide-border">
            {ausenciasRecientes.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-ink">
                    {(a.motivos_ausencia as unknown as { nombre: string } | null)?.nombre ?? 'Sin motivo'}
                  </div>
                  <Badge className={estadoAusenciaColor(a.estado)}>{estadoAusenciaLabel(a.estado)}</Badge>
                </div>
                <div className="text-xs text-ink-muted">
                  {formatFechaCorta(a.fecha_inicio)} → {formatFechaCorta(a.fecha_fin)}
                </div>
                {a.estado === 'rechazada' && a.motivo_rechazo && (
                  <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
                    Motivo del rechazo: {a.motivo_rechazo}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
