import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { CrearRiderForm } from '@/components/riders/CrearRiderForm';
import { ImportRidersModal } from '@/components/riders/ImportRidersModal';
import { RidersList } from '@/components/riders/RidersList';
import { TableFilters } from '@/components/dashboard/TableFilters';

const PAGE_SIZE = 100;

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
  if (searchParams.gestor) {
    const { data: ciudadesDelGestor } = await supabase.from('gestor_ciudades').select('ciudad_id').eq('gestor_id', Number(searchParams.gestor));
    const idsCiudad = (ciudadesDelGestor ?? []).map((c) => c.ciudad_id);
    const { data: centrosDelGestor } = await supabase.from('centros').select('id').in('ciudad_id', idsCiudad);
    query = query.in('centro_id', (centrosDelGestor ?? []).map((c) => c.id));
  }

  const [{ data: riders, count }, { data: centros }, { data: vehiculos }, { data: ciudades }, { data: gestores }] = await Promise.all([
    query,
    supabase.from('centros').select('*').eq('activo', true).order('nombre'),
    supabase.from('vehiculos').select('*').eq('activo', true).order('nombre'),
    supabase.from('ciudades').select('*').order('nombre'),
    supabase.from('gestores').select('*').order('nombre'),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const paginationItems = getPaginationItems(page, totalPages);

  // Helper para generar las URLs manteniendo los filtros actuales
  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams as Record<string, string>);
    params.set('page', pageNumber.toString());
    return `/dashboard/riders?${params.toString()}`;
  };

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
          <RidersList riders={riders as any} />
        )}
      </div>

      {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm mt-4">
            {/* Botón Anterior */}
            <Link
                href={createPageURL(page - 1)}
                className={`rounded px-3 py-1.5 border border-border ${
                    page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-surface text-ink'
                }`}
                aria-disabled={page <= 1}
            >
              Anterior
            </Link>

            {/* Números de Página y Puntos Suspensivos */}
            {paginationItems.map((item, idx) => {
              if (item === '...') {
                return (
                    <span key={`ellipsis-${idx}`} className="px-2 text-ink-muted">
                  ...
                </span>
                );
              }

              return (
                  <Link
                      key={item}
                      href={createPageURL(item)}
                      className={`rounded-full min-w-[32px] text-center px-3 py-1.5 ${
                          item === page
                              ? 'bg-primary text-white'
                              : 'text-ink-muted hover:bg-surface hover:text-ink'
                      }`}
                  >
                    {item}
                  </Link>
              );
            })}

            {/* Botón Siguiente */}
            <Link
                href={createPageURL(page + 1)}
                className={`rounded px-3 py-1.5 border border-border ${
                    page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-surface text-ink'
                }`}
                aria-disabled={page >= totalPages}
            >
              Siguiente
            </Link>
          </div>
      )}
    </div>
  );
}

function getPaginationItems(currentPage: number, totalPages: number) {
  const items: (number | string)[] = [];

  if (totalPages <= 7) {
    // Si hay pocas páginas, las mostramos todas
    for (let i = 1; i <= totalPages; i++) {
      items.push(i);
    }
  } else {
    if (currentPage <= 3) {
      // Cerca del inicio: 1 2 3 4 ... 80
      items.push(1, 2, 3, 4, '...', totalPages);
    } else if (currentPage >= totalPages - 2) {
      // Cerca del final: 1 ... 77 78 79 80
      items.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      // En el medio: 1 ... 34 35 36 ... 80
      items.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
    }
  }

  return items;
}
