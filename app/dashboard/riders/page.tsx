import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { CrearRiderForm } from '@/components/riders/CrearRiderForm';
import { BulkRidersForm } from '@/components/riders/BulkRidersForm';
import { ImportRidersModal } from '@/components/riders/ImportRidersModal';
import { RidersList } from '@/components/riders/RidersList';
import { TableFilters } from '@/components/dashboard/TableFilters';

const PAGE_SIZE = 10;

const ESTADOS = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
];

export default async function RidersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const supabase = createClient();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('riders')
    .select('id, nombre, dni, email, activo, provincia, centros(nombre), vehiculos(nombre)', { count: 'exact' })
    .order('nombre')
    .range(from, to);

  if (searchParams.estado === 'activo') query = query.eq('activo', true);
  if (searchParams.estado === 'inactivo') query = query.eq('activo', false);
  if (searchParams.centro) query = query.eq('centro_id', Number(searchParams.centro));
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(`nombre.ilike.%${q}%,dni.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (searchParams.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(searchParams.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const [{ data: riders, count }, { data: centros }, { data: vehiculos }, { data: ciudades }] = await Promise.all([
    query,
    supabase.from('centros').select('*').eq('activo', true).order('nombre'),
    supabase.from('vehiculos').select('*').eq('activo', true).order('nombre'),
    supabase.from('ciudades').select('*').order('nombre'),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Riders</h1>
          <p className="text-sm text-ink-muted">{count ?? 0} rider(s) registrados.</p>
        </div>
        <ImportRidersModal />
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 font-semibold text-ink">Añadir un rider</h2>
        <CrearRiderForm centros={centros ?? []} vehiculos={vehiculos ?? []} />
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-1 font-semibold text-ink">Alta masiva (texto)</h2>
        <p className="mb-3 text-sm text-ink-muted">Pega varias líneas para dar de alta un lote de golpe.</p>
        <BulkRidersForm />
      </div>

      <TableFilters
        searchPlaceholder="Buscar por nombre, DNI o email..."
        estados={ESTADOS}
        ciudades={ciudades ?? []}
        centros={centros ?? []}
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!riders || riders.length === 0 ? (
          <EmptyState title="No hay riders con estos filtros" />
        ) : (
          <RidersList riders={riders as any} />
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
            <Link
              key={p}
              href={`/dashboard/riders?${new URLSearchParams({ ...searchParams, page: String(p) } as Record<string, string>).toString()}`}
              className={`rounded-full px-3 py-1.5 ${p === page ? 'bg-primary text-white' : 'text-ink-muted hover:bg-surface'}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
