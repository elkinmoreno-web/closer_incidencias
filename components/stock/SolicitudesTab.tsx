'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Truck, Check, X } from 'lucide-react';
import { listarTrasladosPendientes, confirmarRecepcionTraslado, anularTraslado } from '@/app/dashboard/stock/actions';
import type { StockMovimiento } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { formatFecha } from '@/lib/utils';

type TrasladoPendiente = StockMovimiento & {
  material_titulo: string;
  material_titulo_en: string | null;
  centro_origen_nombre: string | null;
  centro_destino_nombre: string | null;
  admin_usuario: string | null;
};

function TarjetaTraslado({ traslado, onResuelto }: { traslado: TrasladoPendiente; onResuelto: () => void }) {
  const { t, idioma } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [unidadesRecibidas, setUnidadesRecibidas] = useState(String(traslado.unidades));
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ diferencia: number } | null>(null);

  // Diferencia calculada EN VIVO mientras se escribe, no solo tras
  // guardar — así el usuario ve de inmediato si lo que va a confirmar
  // coincide con lo enviado, antes de darle a "Confirmar recepción".
  const diferenciaEnVivo = useMemo(() => {
    const n = Number(unidadesRecibidas);
    if (Number.isNaN(n)) return null;
    return n - traslado.unidades;
  }, [unidadesRecibidas, traslado.unidades]);

  function confirmar() {
    const n = Number(unidadesRecibidas);
    if (Number.isNaN(n) || n < 0) {
      setError(t('stockSolicitudes.cuantoLlego'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await confirmarRecepcionTraslado(traslado.id, n);
      if (res && 'error' in res) {
        setError(res.error);
        return;
      }
      if (res?.success) {
        setResultado({ diferencia: res.diferencia });
      }
    });
  }

  function anular() {
    if (!confirm(t('stockSolicitudes.confirmarAnular'))) return;
    startTransition(async () => {
      const res = await anularTraslado(traslado.id);
      if (res && 'error' in res) {
        setError(res.error);
        return;
      }
      onResuelto();
    });
  }

  // Tras confirmar, se muestra el resultado con un botón explícito de
  // "Cerrar" que dispara la recarga de la lista — sin autocierre por
  // temporizador, que podía sentirse como si la tarjeta se quedara
  // "pillada" si el usuario no llegaba a leer el mensaje a tiempo.
  if (resultado) {
    return (
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Truck size={14} className="text-primary" />
          {nombreSegunIdioma(idioma, traslado.material_titulo, traslado.material_titulo_en)} · {t('stockSolicitudes.recepcionGuardada')}
        </div>
        <p className={`mt-2 text-sm font-medium ${resultado.diferencia === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
          {resultado.diferencia === 0
            ? t('stockSolicitudes.coincideConLoEnviado')
            : resultado.diferencia < 0
              ? t('stockSolicitudes.faltaronUnidades').replace('{n}', String(Math.abs(resultado.diferencia)))
              : t('stockSolicitudes.sobraronUnidades').replace('{n}', String(resultado.diferencia))}
        </p>
        <button onClick={onResuelto} className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white">
          {t('stockSolicitudes.cerrar')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Truck size={14} className="text-primary" />
            {nombreSegunIdioma(idioma, traslado.material_titulo, traslado.material_titulo_en)} · {traslado.unidades}
          </div>
          <div className="mt-1 text-xs text-ink-muted">
            {traslado.centro_origen_nombre ?? '—'} → {traslado.centro_destino_nombre ?? '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-muted">
            {t('stockSolicitudes.enviado')}: {formatFecha(traslado.created_at)}
            {traslado.admin_usuario && ` · ${t('stockSolicitudes.pedidoPor')}: ${traslado.admin_usuario}`}
          </div>
        </div>
        {/* Ambos botones siempre visibles, incluso con el formulario de
            confirmación abierto — antes "Anular" desaparecía al abrir
            "Ya ha llegado", dejando sin salida a quien se equivocaba de acción. */}
        <div className="flex shrink-0 gap-1.5">
          {!confirmando && (
            <button
              onClick={() => setConfirmando(true)}
              className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <Check size={12} />
              {t('stockSolicitudes.yaHaLlegado')}
            </button>
          )}
          <button onClick={anular} disabled={pending} className="rounded-full bg-red-50 p-1.5 text-danger hover:bg-red-100 disabled:opacity-50">
            <X size={14} />
          </button>
        </div>
      </div>

      {confirmando && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('stockSolicitudes.cuantoLlego')}</label>
              <input
                type="number"
                min={0}
                autoFocus
                value={unidadesRecibidas}
                onChange={(e) => setUnidadesRecibidas(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <button onClick={confirmar} disabled={pending} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {t('stockSolicitudes.confirmarRecepcion')}
            </button>
            <button onClick={() => setConfirmando(false)} className="rounded-full border border-border px-3 py-1.5 text-xs text-ink-muted">
              {t('stockSolicitudes.cancelar')}
            </button>
          </div>
          {diferenciaEnVivo !== null && diferenciaEnVivo !== 0 && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {t('stockSolicitudes.diferenciaDetectada')}:{' '}
              {diferenciaEnVivo < 0
                ? t('stockSolicitudes.faltaronUnidades').replace('{n}', String(Math.abs(diferenciaEnVivo)))
                : t('stockSolicitudes.sobraronUnidades').replace('{n}', String(diferenciaEnVivo))}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function SolicitudesTab({ materialId }: { materialId: number }) {
  const { t } = useIdioma();
  const [traslados, setTraslados] = useState<TrasladoPendiente[] | null>(null);

  function recargar() {
    listarTrasladosPendientes(materialId).then(setTraslados);
  }

  useEffect(() => {
    setTraslados(null);
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t('stockSolicitudes.titulo')}</h2>
        <p className="text-sm text-ink-muted">{t('stockSolicitudes.subtitulo')}</p>
      </div>

      {traslados === null ? (
        <p className="py-6 text-center text-sm text-ink-muted">…</p>
      ) : traslados.length === 0 ? (
        <p className="rounded-card border border-dashed border-border py-10 text-center text-sm text-ink-muted">{t('stockSolicitudes.sinPendientes')}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {traslados.map((tr) => (
            <TarjetaTraslado key={tr.id} traslado={tr} onResuelto={recargar} />
          ))}
        </div>
      )}
    </div>
  );
}
