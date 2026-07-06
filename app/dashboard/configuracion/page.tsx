import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CentrosList, VehiculosList, MotivosList, MotivosAusenciaList } from '@/components/config/CatalogLists';
import { CrearAdminForm } from '@/components/config/CrearAdminForm';
import { AnuncioForm } from '@/components/config/AnuncioForm';

function etiquetaRol(rol: string) {
  if (rol === 'super_admin') return 'Super Admin';
  if (rol === 'administrador') return 'Administrador';
  if (rol === 'admin_zona') return 'Moderador (rol antiguo, revisa)';
  return 'Moderador';
}

export default async function ConfiguracionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/gestor/login');

  const { data: yo } = await supabase.from('admins').select('rol').eq('auth_user_id', user.id).single();
  if (yo?.rol !== 'super_admin' && yo?.rol !== 'administrador') redirect('/dashboard');

  const esSuperAdmin = yo.rol === 'super_admin';

  const [{ data: centros }, { data: vehiculos }, { data: motivos }, { data: motivosAusencia }, { data: admins }, { data: anuncioActivo }, { data: ciudades }, { data: adminCiudades }] =
    await Promise.all([
      supabase.from('centros').select('*, ciudades(nombre)').order('nombre'),
      supabase.from('vehiculos').select('*').order('nombre'),
      supabase.from('motivos').select('*').order('nombre'),
      supabase.from('motivos_ausencia').select('*').order('nombre'),
      supabase.from('admins').select('id, usuario, rol, activo').order('usuario'),
      supabase.from('anuncios').select('id, mensaje').eq('activo', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ciudades').select('*').order('nombre'),
      supabase.from('admin_ciudades').select('admin_id, ciudades(nombre)'),
    ]);

  const zonasPorAdmin = new Map<string, string[]>();
  for (const ac of adminCiudades ?? []) {
    const nombre = (ac.ciudades as unknown as { nombre: string } | null)?.nombre;
    if (!nombre) continue;
    const lista = zonasPorAdmin.get(ac.admin_id) ?? [];
    lista.push(nombre);
    zonasPorAdmin.set(ac.admin_id, lista);
  }

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
        <AnuncioForm anuncioActivo={anuncioActivo ?? null} />
      </div>

      {esSuperAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">Centros</h2>
            <CentrosList centros={centros ?? []} />
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
        <CrearAdminForm ciudades={ciudades ?? []} puedeCrearTodosLosRoles={esSuperAdmin} />

        <div className="mt-6 divide-y divide-border border-t border-border">
          {(admins ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-medium text-ink">{a.usuario}</span>
              <span className="text-right text-ink-muted">
                {etiquetaRol(a.rol)} · {a.activo ? 'Activo' : 'Inactivo'}
                {(a.rol === 'moderador' || a.rol === 'admin_zona') && (
                  <div className="text-xs">{(zonasPorAdmin.get(a.id) ?? []).join(', ') || 'Sin ciudades asignadas'}</div>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
