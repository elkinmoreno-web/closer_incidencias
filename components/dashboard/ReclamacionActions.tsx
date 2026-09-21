'use client';

import { useState, useTransition } from 'react';
import { Check, X, Clock, Trash2 } from 'lucide-react';
import { resolverReclamacion, enviarReclamacionAPapelera } from '@/app/dashboard/reclamaciones/actions';
import type { EstadoReclamacion } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Resolver una reclamación siempre pasa por escribir una respuesta, no
 * es un botón suelto: el rider tiene que leer por qué se aprobó o se
 * denegó. Por eso el botón abre el cuadro de texto en vez de ejecutar.
 *
 * La respuesta es obligatoria al rechazar y opcional al aprobar (un
 * "aprobada" ya dice bastante por sí solo).
 */
export function ReclamacionActions({ id, estado, respuesta }: { id: string; estado: EstadoReclamacion; respuesta: string | null }) {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [resolviendo, setResolviendo] = useState<EstadoReclamacion | null>(null);
  const [texto, setTexto] = useState(respuesta ?? '');
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    if (!resolviendo) return;
    if (resolviendo === 'rechazada' && !texto.trim()) {
      setError(t('accReclamacion.respuestaObligatoria'));
      return;
    }
    setError(null);
    startTransition(async () => {
      await resolverReclamacion(id, resolviendo, texto);
      setResolviendo(null);
    });
  }

  if (resolviendo) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t('accReclamacion.respuestaPlaceholder')}
          rows={3}
          className="w-64 rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={confirmar}
            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            {t('accReclamacion.confirmar')}
          </button>
          <button
            onClick={() => {
              setResolviendo(null);
              setError(null);
            }}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink-muted"
          >
            {t('accReclamacion.cancelar')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        title={t('accReclamacion.aprobar')}
        disabled={pending || estado === 'aprobada'}
        onClick={() => setResolviendo('aprobada')}
        className="rounded-full bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
      >
        <Check size={16} />
      </button>
      <button
        title={t('accReclamacion.enTramite')}
        disabled={pending || estado === 'en_tramite'}
        onClick={() => setResolviendo('en_tramite')}
        className="rounded-full bg-sky-50 p-2 text-sky-700 transition hover:bg-sky-100 disabled:opacity-40"
      >
        <Clock size={16} />
      </button>
      <button
        title={t('accReclamacion.rechazar')}
        disabled={pending || estado === 'rechazada'}
        onClick={() => setResolviendo('rechazada')}
        className="rounded-full bg-red-50 p-2 text-danger transition hover:bg-red-100 disabled:opacity-40"
      >
        <X size={16} />
      </button>
      <button
        title={t('accIncidencia.enviarPapelera')}
        disabled={pending}
        onClick={() => {
          if (confirm(t('accIncidencia.confirmarPapelera'))) {
            startTransition(() => enviarReclamacionAPapelera(id));
          }
        }}
        className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
