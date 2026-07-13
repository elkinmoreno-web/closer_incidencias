import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CentrosList, VehiculosList, MotivosList, MotivosAusenciaList } from '@/components/config/CatalogLists';
import { CrearAdminForm } from '@/components/config/CrearAdminForm';
import { AdminRow } from '@/components/config/AdminRow';
import { AnuncioForm } from '@/components/config/AnuncioForm';


export default async function ConfiguracionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/gestor/login');

  const { data: yo } = await supabase.from('admins').select('id, rol').eq('auth_user_id', user.id).single();
  if (yo?.rol !== 'super_admin' && yo?.rol !== 'administrador') redirect('/dashboard');

  const esSuperAdmin = yo.rol === 'super_admin';

  // Ciudades del Administrador actual (para filtrar qué usuarios ve).
  // El Super Admin ve todos, así que no necesita este filtro.
  let ciudadesDelAdminActual: number[] = [];
  if (!esSuperAdmin) {
    const { data } = await supabase.from('admin_ciudades').select('ciudad_id').eq('admin_id', yo.id);
    ciudadesDelAdminActual = (data ?? []).map((c) => c.ciudad_id);
  }

  const [{ data: centros }, { data: vehiculos }, { data: motivos }, { data: motivosAusencia }, { data: admins }, { data: anunciosActivos }, { data: ciudades }, { data: adminCiudades }] =
    await Promise.all([
      supabase.from('centros').select('*, ciudades(nombre)').order('nombre'),
      supabase.from('vehiculos').select('*').order('nombre'),
      supabase.from('motivos').select('*').order('nombre'),
      supabase.from('motivos_ausencia').select('*').order('nombre'),
      supabase.from('admins').select('id, usuario, rol, activo').order('usuario'),
      supabase.from('anuncios').select('id, mensaje, ciudad_id, audiencia, ciudades(nombre)').eq('activo', true).order('created_at', { ascending: false }),
      supabase.from('ciudades').select('*').order('nombre'),
      supabase.from('admin_ciudades').select('admin_id, ciudad_id, ciudades(nombre)'),
    ]);

  // Anuncios visibles en Configuración: globales + los de mis ciudades
  // (todos si soy super_admin), igual que en el banner.
  const anunciosVisibles = (anunciosActivos ?? [])
    .filter((a) => esSuperAdmin || a.ciudad_id === null || ciudadesDelAdminActual.includes(a.ciudad_id))
    .map((a) => {
      const ciudadRel = a.ciudades as unknown as { nombre: string } | { nombre: string }[] | null;
      const nombre = Array.isArray(ciudadRel) ? ciudadRel[0]?.nombre : ciudadRel?.nombre;
      return { id: a.id, mensaje: a.mensaje, ciudadNombre: nombre ?? null, audiencia: a.audiencia as 'todos' | 'admins' | 'riders' };
    });

  const zonasPorAdmin = new Map<string, string[]>();
  const ciudadIdsPorAdmin = new Map<string, number[]>();
  for (const ac of adminCiudades ?? []) {
    const nombre = (ac.ciudades as unknown as { nombre: string } | null)?.nombre;
    if (nombre) {
      const lista = zonasPorAdmin.get(ac.admin_id) ?? [];
      lista.push(nombre);
      zonasPorAdmin.set(ac.admin_id, lista);
    }
    const ids = ciudadIdsPorAdmin.get(ac.admin_id) ?? [];
    ids.push(ac.ciudad_id);
    ciudadIdsPorAdmin.set(ac.admin_id, ids);
  }

  // Filtrado de la lista de usuarios según quién mira:
  // - Super Admin: ve todos.
  // - Administrador: ve solo moderadores que compartan al menos una de
  //   sus ciudades (y a sí mismo).
  const adminsVisibles = esSuperAdmin
    ? (admins ?? [])
    : (admins ?? []).filter((a) => {
        if (a.id === yo.id) return true;
        if (a.rol !== 'moderador') return false;
        const suyas = ciudadIdsPorAdmin.get(a.id) ?? [];
        return suyas.some((c) => ciudadesDelAdminActual.includes(c));
      });

  // Un Administrador solo puede asignar sus propias ciudades a los
  // moderadores que crea; el Super Admin puede asignar cualquiera.
  const ciudadesAsignables = esSuperAdmin
    ? (ciudades ?? [])
    : (ciudades ?? []).filter((c) => ciudadesDelAdminActual.includes(c.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Configuración</h1>
        <p className="text-sm text-ink-muted">
          {esSuperAdmin ? 'Acceso completo (Super Admin).' : 'Como Administrador, aquí solo gestionas el anuncio global y das de alta moderadores.'}
        </p>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-1 font-semibold text-ink">Anuncio global</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Se muestra como aviso en la parte superior de ambos portales (admin y riders).
        </p>
        <AnuncioForm anunciosActivos={anunciosVisibles} ciudadesAsignables={ciudadesAsignables} esSuperAdmin={esSuperAdmin} />
      </div>

      {esSuperAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">Centros</h2>
            <CentrosList centros={centros ?? []} ciudades={ciudades ?? []} />
          </div>
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">Vehículos</h2>
            <VehiculosList vehiculos={vehiculos ?? []} />
          </div>
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">Motivos de incidencia</h2>
            <MotivosList motivos={motivos ?? []} />
          </div>
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">Motivos de ausencia</h2>
            <MotivosAusenciaList motivos={motivosAusencia ?? []} />
          </div>
        </div>
      )}

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-1 font-semibold text-ink">Administradores</h2>
        <p className="mb-4 text-sm text-ink-muted">
          {esSuperAdmin ? 'Da de alta nuevas cuentas de acceso al panel.' : 'Da de alta nuevos moderadores y elige a qué ciudades tienen acceso.'}
        </p>
        <CrearAdminForm ciudades={ciudadesAsignables} puedeCrearTodosLosRoles={esSuperAdmin} />

        <div className="mt-6 divide-y divide-border border-t border-border">
          {adminsVisibles.map((a) => (
            <AdminRow
              key={a.id}
              admin={a}
              zonas={zonasPorAdmin.get(a.id) ?? []}
              esSuperAdmin={esSuperAdmin}
              esYoMismo={a.id === yo.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
