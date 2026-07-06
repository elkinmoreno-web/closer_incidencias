import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CentrosList, VehiculosList, MotivosList, MotivosAusenciaList } from '@/components/config/CatalogLists';
import { CrearAdminForm } from '@/components/config/CrearAdminForm';
import { AnuncioForm } from '@/components/config/AnuncioForm';

export default async function ConfiguracionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/gestor/login');

  const { data: admin } = await supabase.from('admins').select('rol').eq('auth_user_id', user.id).single();
  if (admin?.rol !== 'super_admin') redirect('/dashboard');

  const [{ data: centros }, { data: vehiculos }, { data: motivos }, { data: motivosAusencia }, { data: admins }, { data: anuncioActivo }] = await Promise.all([
    supabase.from('centros').select('*').order('nombre'),
    supabase.from('vehiculos').select('*').order('nombre'),
    supabase.from('motivos').select('*').order('nombre'),
    supabase.from('motivos_ausencia').select('*').order('nombre'),
    supabase.from('admins').select('usuario, rol, activo').order('usuario'),
    supabase.from('anuncios').select('id, mensaje').eq('activo', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Configuración</h1>
        <p className="text-sm text-ink-muted">Solo visible para Super Admin.</p>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-1 font-semibold text-ink">Anuncio global</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Se muestra como aviso en la parte superior de ambos portales (admin y riders).
        </p>
        <AnuncioForm anuncioActivo={anuncioActivo ?? null} />
      </div>

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

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-1 font-semibold text-ink">Administradores</h2>
        <p className="mb-4 text-sm text-ink-muted">Da de alta nuevas cuentas de acceso al panel.</p>
        <CrearAdminForm />

        <div className="mt-6 divide-y divide-border border-t border-border">
          {(admins ?? []).map((a) => (
            <div key={a.usuario} className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-medium text-ink">{a.usuario}</span>
              <span className="text-ink-muted">
                {a.rol === 'super_admin' ? 'Super Admin' : 'Moderador'} · {a.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
