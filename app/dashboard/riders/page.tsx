import { createClient, getAdminActual } from '@/lib/supabase/server';
import { ciudadesYCentrosDeMiZona } from '@/lib/zonaFiltros';
import { EmptyState } from '@/components/ui/EmptyState';
import { CrearRiderForm } from '@/components/riders/CrearRiderForm';
import { ImportRidersModal } from '@/components/riders/ImportRidersModal';
import { CargarUuidsModal } from '@/components/riders/CargarUuidsModal';
import { RecalcularPasswordsButton } from '@/components/riders/RecalcularPasswordsButton';
import { RidersList } from '@/components/riders/RidersList';
import { TableFilters } from '@/components/dashboard/TableFilters';
import { Pagination } from '@/components/dashboard/Pagination';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { crearTraductor } from '@/lib/i18n/traducir';

const PAGE_SIZE = 50; // Riders tiene muchos más registros que el resto de tablas (miles); con 10 por página serían cientos de páginas.

export default async function RidersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const idioma = await resolverIdioma();
  const t = crearTraductor(idioma);
  const ESTADOS = [
    { value: 'activo', label: t('admRiders.estadoActivo') },
    { value: 'inactivo', label: t('admRiders.estadoInactivo') },
  ];

  const supabase = createClient();
  const yo = await getAdminActual();
  const esSuperAdmin = yo?.rol === 'super_admin';
  const esAdministrador = yo?.rol === 'administrador';

  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('riders')
    .select('id, nombre, dni, email, activo, provincia, centro_id, vehiculo_id, fecha_alta, centros(nombre), vehiculos(nombre)', { count: 'exact' })
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
          <h1 className="text-2xl font-semibold text-ink">{t('admRiders.titulo')}</h1>
          <p className="text-sm text-ink-muted">
            {count ?? 0} {t('admRiders.registrados')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esSuperAdmin && <RecalcularPasswordsButton />}
          {/* "Cargar UUIDs de Uber" quedó redundante: "Importar Excel" ya
              carga el Uber UUID en el mismo paso (misma columna del
              archivo de RRHH). Se deja el componente disponible por si
              algún día llega un archivo suelto con solo DNI+UUID, pero
              oculto por defecto para no confundir el flujo habitual. */}
          {false && (esSuperAdmin || esAdministrador) && <CargarUuidsModal />}
          <ImportRidersModal />
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 font-semibold text-ink">{t('admRiders.anadirRider')}</h2>
        <CrearRiderForm centros={centros ?? []} vehiculos={vehiculos ?? []} />
      </div>

      <TableFilters
        searchPlaceholder={t('admRiders.buscarPlaceholder')}
        estados={ESTADOS}
        ciudades={ciudades ?? []}
        centros={centros ?? []}
        gestores={gestores ?? []}
      />

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!riders || riders.length === 0 ? (
          <EmptyState title={t('admRiders.sinResultados')} />
        ) : (
          <RidersList riders={riders as any} centros={centros ?? []} vehiculos={vehiculos ?? []} esSuperAdmin={esSuperAdmin} />
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/dashboard/riders" searchParams={searchParams} />
    </div>
  );
}
