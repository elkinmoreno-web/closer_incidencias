import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { CrearRiderForm } from '@/components/riders/CrearRiderForm';
import { BulkRidersForm } from '@/components/riders/BulkRidersForm';
import { RidersList } from '@/components/riders/RidersList';

export default async function RidersPage() {
  const supabase = createClient();

  const [{ data: riders }, { data: centros }, { data: vehiculos }] = await Promise.all([
    supabase.from('riders').select('id, nombre, dni, email, activo, centros(nombre), vehiculos(nombre)').order('nombre'),
    supabase.from('centros').select('*').eq('activo', true).order('nombre'),
    supabase.from('vehiculos').select('*').eq('activo', true).order('nombre'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Riders</h1>
        <p className="text-sm text-ink-muted">{riders?.length ?? 0} rider(s) registrados.</p>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 font-semibold text-ink">Añadir un rider</h2>
        <CrearRiderForm centros={centros ?? []} vehiculos={vehiculos ?? []} />
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-1 font-semibold text-ink">Alta masiva</h2>
        <p className="mb-3 text-sm text-ink-muted">Pega varias líneas para dar de alta un lote de golpe.</p>
        <BulkRidersForm />
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!riders || riders.length === 0 ? (
          <EmptyState title="No hay riders registrados todavía" />
        ) : (
          <RidersList riders={riders as any} />
        )}
      </div>
    </div>
  );
}
