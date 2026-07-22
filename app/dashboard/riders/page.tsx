import { createClient, getAdminActual } from '@/lib/supabase/server';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { EmptyState } from '@/components/ui/EmptyState';
import { CrearRiderForm } from '@/components/riders/CrearRiderForm';
import { ImportRidersModal } from '@/components/riders/ImportRidersModal';
import { RecalcularPasswordsButton } from '@/components/riders/RecalcularPasswordsButton';
import { RidersList } from '@/components/riders/RidersList';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { Pagination } from '@/components/dashboard/Pagination';

const PAGE_SIZE = 50; // Riders tiene muchos más registros que el resto de tablas (miles); con 10 por página serían cientos de páginas.

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
  const yo = await getAdminActual();
  const esSuperAdmin = yo?.rol === 'super_admin';

  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('riders')
    .select('id, nombre, dni, email, activo, provincia, centro_id, vehiculo_id, centros(nombre), vehiculos(nombre)', { count: 'exact' })
    .order('nombre')
    .range(from, to);

  if (searchParams.estado === 'activo') query = query.eq('activo', true);
  if (searchParams.estado === 'inactivo') query = query.eq('activo', false);
  if (searchParams.centro === 'sin-centro') query = query.is('centro_id', null);
  else if (searchParams.centro) query = query.eq('centro_id', Number(searchParams.centro));
  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g, '');
    query = query.or(`nombre.ilike.%${q}%,dni.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (searchParams.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(searchParams.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }
  if (searchParams.gestor) {
    const { data: ciudadesDelGestor } = await supabase.from('gestor_ciudades').select('ciudad_id').eq('gestor_id', Number(searchParams.gestor));
    const idsCiudad = (ciudadesDelGestor ?? []).map((c) => c.ciudad_id);
    const { data: centrosDelGestor } = await supabase.from('centros').select('id').in('ciudad_id', idsCiudad);
    query = query.in('centro_id', (centrosDelGestor ?? []).map((c) => c.id));
  }

  const [{ data: riders, count }, { data: vehiculos }, { data: gestores }, zona] = await Promise.all([
    query,
    supabase.from('vehiculos').select('*').eq('activo', true).order('nombre'),
    supabase.from('gestores').select('*').order('nombre'),
    ciudadesYCentrosDeMiZona(),
  ]);
  const centros = zona.centros;
  const ciudades = zona.ciudades;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Riders</h1>
          <p className="text-sm text-ink-muted">{count ?? 0} rider(s) registrados.</p>
        </div>
        <div className="flex items-center gap-2">
          {esSuperAdmin && <RecalcularPasswordsButton />}
          <ImportRidersModal />
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 font-semibold text-ink">Añadir un rider</h2>
        <CrearRiderForm centros={centros ?? []} vehiculos={vehiculos ?? []} />
      </div>

      <TableFilters
        searchPlaceholder="Buscar por nombre, DNI o email..."
        estados={ESTADOS}
        ciudades={ciudades ?? []}
        centros={centros ?? []}
        gestores={gestores ?? []}
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!riders || riders.length === 0 ? (
          <EmptyState title="No hay riders con estos filtros" />
        ) : (
          <RidersList riders={riders as any} centros={centros ?? []} vehiculos={vehiculos ?? []} esSuperAdmin={esSuperAdmin} />
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/riders" searchParams={searchParams} />
    </div>
  );
}
