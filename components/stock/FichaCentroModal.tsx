'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { StockDisponible, StockMovimiento } from '@/lib/types';
import { listarMovimientosRecientes } from '@/app/dashboard/stock/actions';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { ETIQUETA_SEMAFORO } from '@/lib/stockSemaforo';
import { formatFecha } from '@/lib/utils';

type MovimientoConNombres = StockMovimiento & {
  centro_origen_nombre: string | null;
  centro_destino_nombre: string | null;
  admin_usuario: string | null;
  tipo_etiqueta: string;
};

/**
 * Ficha de detalle de un centro, al hacer click en su nombre en la
 * tabla — mismo contenido que Ficha.abrir() del panel de Sheets:
 * las métricas de reposición explicadas una a una, más el historial
 * de los últimos movimientos de ese centro.
 */
export function FichaCentroModal({ fila, onCerrar }: { fila: StockDisponible; onCerrar: () => void }) {
  const { t, idioma } = useIdioma();
  const [movimientos, setMovimientos] = useState<MovimientoConNombres[] | null>(null);

  useEffect(() => {
    listarMovimientosRecientes(fila.material_id, 50).then((todos) => {
      setMovimientos(todos.filter((m) => m.centro_origen_id === fila.centro_id || m.centro_destino_id === fila.centro_id).slice(0, 10));
    });
  }, [fila.material_id, fila.centro_id]);

  const etiquetaSemaforo = fila.semaforo ? ETIQUETA_SEMAFORO[fila.semaforo] : null;

  const pares: [string, string][] = [
    [t('stockFicha.disponible'), fila.disponible.toLocaleString()],
    [t('stockFicha.enCaminoHaciaAlli'), fila.transito_entrante.toLocaleString()],
    [t('stockFicha.enManosRiders'), fila.en_calle.toLocaleString()],
    [t('stockFicha.consumoSemanal'), (fila.consumo_semana ?? 0).toFixed(1)],
    [t('stockFicha.leQuedaPara'), fila.cobertura_dias != null ? `${fila.cobertura_dias} ${t('stockFicha.dias')}` : t('stockFicha.indefinido')],
    [t('stockFicha.convieneNoBajar'), (fila.punto_reposicion ?? 0).toLocaleString()],
    [t('stockFicha.devueltoRoto'), fila.merma.toLocaleString()],
    [t('stockFicha.noDevuelto'), fila.perdida.toLocaleString()],
    [t('stockFicha.ultimoMovimiento'), fila.dias_sin_movimiento == null ? t('stockFicha.nuncaHuboMovimiento') : t('stockFicha.hace').replace('{n}', String(fila.dias_sin_movimiento))],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{fila.centro_nombre}</h2>
          <button onClick={onCerrar} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {fila.gestores.length > 0 && <p className="mb-3 text-xs text-ink-muted">{t('stock.colGestor')}: {fila.gestores.join(', ')}</p>}

        {etiquetaSemaforo && (
          <div className={`mb-4 rounded-lg px-3 py-2.5 text-sm ${etiquetaSemaforo.color}`}>
            <span className="font-semibold">{idioma === 'en' ? etiquetaSemaforo.en : etiquetaSemaforo.es}</span>
            {fila.sugerido ? (
              <span>
                {' '}
                — {t('stockFicha.sugerenciaEnvio')} <strong>{fila.sugerido}</strong> {t('stockFicha.unidades')}.
              </span>
            ) : (
              <span> — {t('stockFicha.nadaQueHacer')}</span>
            )}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {pares.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="text-right font-mono font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('stockFicha.ultimosMovimientos')}</h3>
          {movimientos === null ? (
            <p className="py-3 text-center text-xs text-ink-muted">…</p>
          ) : movimientos.length === 0 ? (
            <p className="py-3 text-center text-xs text-ink-muted">{t('stockFicha.nuncaHuboMovimiento')}</p>
          ) : (
            <div className="divide-y divide-border">
              {movimientos.map((mv) => (
                <div key={mv.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <div className="font-medium text-ink">{mv.tipo_etiqueta}</div>
                    <div className="text-ink-muted">
                      {formatFecha(mv.created_at)}
                      {mv.centro_origen_nombre && mv.centro_destino_nombre ? ` · ${mv.centro_origen_nombre} → ${mv.centro_destino_nombre}` : ''}
                    </div>
                  </div>
                  <div className="font-mono text-ink">{mv.unidades}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onCerrar} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted hover:bg-bg">
            {t('stockFicha.cerrar')}
          </button>
        </div>
      </div>
    </div>
  );
}
