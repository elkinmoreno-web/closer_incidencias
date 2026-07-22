import Image from 'next/image';
import { RiderLoginForm } from '@/components/auth/RiderLoginForm';

export default function RiderLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Image src="/logo-closer.png" alt="Closer Logistics" width={200} height={48} className="mx-auto h-11 w-auto" priority />
          <h1 className="mt-4 text-xl font-semibold text-ink">Acceso de riders</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Entra con tu DNI y la contraseña que te han facilitado.
          </p>
        </div>
        <RiderLoginForm />
      </div>
    </div>
  );
}
