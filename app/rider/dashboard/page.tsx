import { redirect } from 'next/navigation';
import { createClient, getRiderActual } from '@/lib/supabase/server';
import { Tabs } from '@/components/rider/Tabs';
import { IncidenciaForm } from '@/components/rider/IncidenciaForm';
import { AusenciaForm } from '@/components/rider/AusenciaForm';
import { IncidenciasSemanaList } from '@/components/rider/IncidenciasSemanaList';
import { AusenciasSemanaList } from '@/components/rider/AusenciasSemanaList';
import { MetricasPanel } from '@/components/rider/MetricasPanel';
import { ZonaConexionPanel } from '@/components/rider/ZonaConexionPanel';
import { inicioSemanaActualISO } from '@/lib/utils';
import { urlArchivoDrive } from '@/lib/driveUrl';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';

export default async function RiderDashboardPage() {
  const rider = await getRiderActual();
  if (!rider) redirect('/rider/login');

  const idioma = await resolverIdioma();
  const t = crearTraductor(idioma);
  const supabase = createClient();
  const inicioSemana = inicioSemanaActualISO();

  const [{ data: motivos }, { data: motivosAusencia }, { data: incidenciasSemana }, { data: ausenciasSemana }, { data: riderConCentro }] =
    await Promise.all([
      supabase.from('motivos').select('*').eq('activo', true).order('nombre'),
      supabase.from('motivos_ausencia').select('*').eq('activo', true).order('nombre'),
      supabase
        .from('incidencias')
        .select('id, estado, created_at, codigo_pedido, motivo_rechazo, motivos(nombre, nombre_en, instrucciones_aprobacion, instrucciones_aprobacion_en)')
        .eq('rider_id', rider.id)
        .gte('created_at', inicioSemana)
        .order('created_at', { ascending: false }),
      supabase
        .from('ausencias')
        .select('id, estado, fecha_inicio, fecha_fin, motivo_rechazo, motivos_ausencia(nombre, nombre_en)')
        .eq('rider_id', rider.id)
        .gte('created_at', inicioSemana)
        .order('created_at', { ascending: false }),
      supabase.from('riders').select('centros(nombre, imagen_zona_conexion_url)').eq('id', rider.id).maybeSingle(),
    ]);

  const centroRider = riderConCentro?.centros as unknown as { nombre: string; imagen_zona_conexion_url: string | null } | null;
  const imagenZonaUrl = urlArchivoDrive(centroRider?.imagen_zona_conexion_url);

  return (
    <div className="rounded-card bg-surface p-6 shadow-sm">
      <Tabs
        incidenciaPanel={
          <div className="flex flex-col gap-6">
            <IncidenciaForm dni={rider.dni} motivos={motivos ?? []} />
            <div className="border-t border-border pt-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">{t('riderPage.tusIncidenciasSemana')}</h2>
              <IncidenciasSemanaList incidencias={(incidenciasSemana ?? []) as any} />
            </div>
          </div>
        }
        ausenciaPanel={
          <div className="flex flex-col gap-6">
            <AusenciaForm dni={rider.dni} motivos={motivosAusencia ?? []} />
            <div className="border-t border-border pt-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">{t('riderPage.tusAusenciasSemana')}</h2>
              <AusenciasSemanaList ausencias={(ausenciasSemana ?? []) as any} />
            </div>
          </div>
        }
        metricasPanel={<MetricasPanel />}
        zonaPanel={<ZonaConexionPanel imagenUrl={imagenZonaUrl} nombreCentro={centroRider?.nombre ?? null} />}
      />
    </div>
  );
}
