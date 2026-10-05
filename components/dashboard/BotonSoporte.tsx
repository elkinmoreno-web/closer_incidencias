'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LifeBuoy, X } from 'lucide-react';
import { ReportarIncidenciaForm } from '@/components/dashboard/ReportarIncidenciaForm';

/**
 * Botón de "Contactar con soporte" de la barra superior.
 *
 * Abre el formulario en una ventana emergente en vez de llevar a otra
 * página. Así soporte recibe la página EXACTA en la que estaba el gestor:
 * antes se sacaba del historial del navegador (document.referrer), y si se
 * venía de iniciar sesión, el "origen" que llegaba era /gestor/login.
 */
export function BotonSoporte() {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const pagina = pathname + (qs ? `?${qs}` : '');

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-full border border-border p-2.5 text-ink-muted transition hover:bg-bg"
        title="Contactar con soporte"
        aria-label="Contactar con soporte"
      >
        <LifeBuoy size={16} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Contactar con soporte</h2>
                <p className="text-sm text-ink-muted">
                  ¿Algo no funciona, te falta un permiso o tienes una idea? Te responderán a tu correo.
                </p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-ink-muted hover:text-ink" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <ReportarIncidenciaForm pagina={pagina} />
          </div>
        </div>
      )}
    </>
  );
}
