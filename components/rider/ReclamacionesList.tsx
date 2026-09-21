'use client';

import type { EstadoReclamacion, Reclamacion } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import type { ClaveTraduccion } from '@/lib/i18n/dictionaries/es';

const COLOR_ESTADO: Record<EstadoReclamacion, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  en_tramite: 'bg-sky-100 text-sky-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-red-100 text-red-800',
  papelera: 'bg-slate-200 text-slate-600',
};

const CLAVE_ESTADO: Record<EstadoReclamacion, ClaveTraduccion> = {
  pendiente: 'reclamacion.estadoPendiente',
  en_tramite: 'reclamacion.estadoEnTramite',
  aprobada: 'reclamacion.estadoAprobada',
  rechazada: 'reclamacion.estadoRechazada',
  papelera: 'reclamacion.estadoPendiente',
};

/** aaaa-mm-01 → "marzo 2026" en el idioma del rider. */
function etiquetaPeriodo(periodo: string, idioma: 'es' | 'en'): string {
  const [y, m] = periodo.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  const texto = d.toLocaleDateString(idioma === 'en' ? 'en-GB' : 'es-ES', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Historial de reclamaciones del rider.
 *
 * Lo importante aquí es la RESPUESTA: se muestra tanto si la reclamación
 * se aprobó como si se denegó. Un rider al que le rechazan una nómina sin
 * explicación vuelve a reclamar lo mismo al mes siguiente.
 */
export function ReclamacionesList({ reclamaciones }: { reclamaciones: Reclamacion[] }) {
  const { t, idioma } = useIdioma();

  if (reclamaciones.length === 0) {
    return <p className="text-sm text-ink-muted">{t('reclamacion.sinReclamaciones')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {reclamaciones.map((r) => (
        <li key={r.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-ink">
                {r.motivos_reclamacion
                  ? nombreSegunIdioma(idioma, r.motivos_reclamacion.nombre, r.motivos_reclamacion.nombre_en ?? null)
                  : '—'}
              </p>
              <p className="text-xs text-ink-muted">
                {etiquetaPeriodo(r.periodo, idioma)}
                {r.importe !== null && ` · ${Number(r.importe).toFixed(2).replace('.', ',')} €`}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COLOR_ESTADO[r.estado]}`}>
              {t(CLAVE_ESTADO[r.estado])}
            </span>
          </div>

          {r.comentario && <p className="mt-2 text-sm text-ink-muted">{r.comentario}</p>}

          {r.respuesta && (
            <div className="mt-3 rounded-lg border-l-4 border-primary bg-bg px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t('reclamacion.respuesta')}
              </p>
              <p className="mt-0.5 text-sm text-ink">{r.respuesta}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
