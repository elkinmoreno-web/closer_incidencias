import { RiderLoginForm } from '@/components/auth/RiderLoginForm';

export default function RiderLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold text-primary">Closer Logistics</div>
          <h1 className="mt-2 text-xl font-semibold text-ink">Acceso de riders</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Reporta incidencias o ausencias con tu correo registrado.
          </p>
        </div>
        <RiderLoginForm />
      </div>
    </div>
  );
}
