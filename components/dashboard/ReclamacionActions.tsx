'use client';

import { useState, useTransition } from 'react';
import { Check, X, Clock, Trash2 } from 'lucide-react';
import { resolverReclamacion, enviarReclamacionAPapelera } from '@/app/dashboard/reclamaciones/actions';
import type { EstadoReclamacion, ViaPagoReclamacion } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Resolver una reclamación siempre pasa por escribir una respuesta, no
 * es un botón suelto: el rider tiene que leer por qué se aprobó o se
 * denegó. Por eso el botón abre el cuadro de texto en vez de ejecutar.
 *
 * La respuesta es obligatoria al rechazar y opcional al aprobar (un
 * "aprobada" ya dice bastante por sí solo).
 */
export function ReclamacionActions({
  id,
  estado,
  respuesta,
  importe,
  importeAprobado,
  viaPago,
}: {
  id: string;
  estado: EstadoReclamacion;
  respuesta: string | null;
  importe: number | null;
  importeAprobado: number | null;
  viaPago: ViaPagoReclamacion | null;
}) {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [resolviendo, setResolviendo] = useState<EstadoReclamacion | null>(null);
  const [texto, setTexto] = useState(respuesta ?? '');
  // Se parte de lo ya aprobado si lo hay, y si no de lo que reclamó el
  // rider: en la mayoría de los casos se aprueba tal cual y así el gestor
  // no tiene que teclear la misma cifra.
  const [importeTexto, setImporteTexto] = useState(
    String(importeAprobado ?? importe ?? '').replace('.', ',')
  );
  const [via, setVia] = useState<ViaPagoReclamacion | ''>(viaPago ?? '');
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    if (!resolviendo) return;
    if (resolviendo === 'rechazada' && !texto.trim()) {
      setError(t('accReclamacion.respuestaObligatoria'));
      return;
    }
    if (resolviendo === 'aprobada' && !via) {
      setError(t('accReclamacion.viaPagoObligatoria'));
      return;
    }
    setError(null);
    const limpio = importeTexto.trim().replace(',', '.');
    const importeNum = limpio === '' ? null : Number(limpio);
    startTransition(async () => {
      await resolverReclamacion(id, resolviendo, texto, {
        importeAprobado: Number.isFinite(importeNum as number) ? importeNum : null,
        viaPago: via || null,
      });
      setResolviendo(null);
    });
  }

  if (resolviendo) {
    return (
      <div className="flex flex-col gap-2">
        {resolviendo === 'aprobada' && (
          <>
            <label className="text-xs font-semibold text-ink-muted">{t('accReclamacion.importeAprobado')}</label>
            <input
              type="text"
              inputMode="decimal"
              value={importeTexto}
              onChange={(e) => setImporteTexto(e.target.value)}
              placeholder="0,00"
              className="w-64 rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
            <span className="text-[10px] text-ink-muted">{t('accReclamacion.importeAyuda')}</span>

            <label className="mt-1 text-xs font-semibold text-ink-muted">{t('accReclamacion.cuandoSePaga')}</label>
            <div className="flex gap-1.5">
              {(['primera_remesa', 'siguiente_nomina'] as ViaPagoReclamacion[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVia(v)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    via === v ? 'bg-primary text-white' : 'border border-border text-ink-muted hover:border-primary'
                  }`}
                >
                  {v === 'primera_remesa' ? t('accReclamacion.primeraRemesa') : t('accReclamacion.siguienteNomina')}
                </button>
              ))}
            </div>
          </>
        )}

        <textarea
          autoFocus={resolviendo !== 'aprobada'}
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
