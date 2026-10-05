import { redirect } from 'next/navigation';
import { getAdminActual } from '@/lib/supabase/server';
import { ROLES_PUEDEN_REPORTAR } from '@/lib/utils';
import { ReportarIncidenciaForm } from '@/components/dashboard/ReportarIncidenciaForm';

export default async function ReportarPage() {
  // Esconder la entrada del menú no basta: sin esto se entraría por la URL.
  const admin = await getAdminActual();
  if (!admin) redirect('/gestor/login');
  if (!(ROLES_PUEDEN_REPORTAR as readonly string[]).includes(admin.rol)) redirect('/dashboard');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Reportar incidencia</h1>
        <p className="text-sm text-ink-muted">
          ¿Algo no funciona en el panel, te falta un permiso o tienes una idea? Cuéntalo aquí y le llegará al equipo
          de soporte. Te responderán directamente a tu correo.
        </p>
      </div>
      <div className="rounded-card bg-surface p-6 shadow-sm">
        <ReportarIncidenciaForm />
      </div>
    </div>
  );
}
