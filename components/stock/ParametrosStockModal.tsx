'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { actualizarParametrosStock } from '@/app/dashboard/stock/actions';
import type { StockParametros } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Ajusta los 6 parámetros del semáforo de reposición — portados de
 * STK_CFG.paramsDef del sistema de Sheets. Se muestra como modal (no
 * como pestaña propia): es configuración puntual, no algo que se
 * consulte a diario, así que no merece ocupar espacio fijo en la
 * navegación del panel.
 */
export function ParametrosStockModal({
  parametros,
  esSuperAdmin,
  onGuardado,
  onCerrar,
}: {
  parametros: StockParametros;
  esSuperAdmin: boolean;
  onGuardado: (p: StockParametros) => void;
  onCerrar: () => void;
}) {
  const { t } = useIdioma();
  const [valores, setValores] = useState(parametros);
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function campo(clave: keyof StockParametros, valor: number) {
    setValores((prev) => ({ ...prev, [clave]: valor }));
  }

  function guardar() {
    setMensaje(null);
    startTransition(async () => {
      const res = await actualizarParametrosStock(valores);
      if (res && 'error' in res) {
        setMensaje(res.error);
        return;
      }
      setMensaje(t('stockParams.guardado'));
      onGuardado(valores);
    });
  }

  const campos: { clave: keyof StockParametros; label: string }[] = [
    { clave: 'lead_time_dias', label: t('stockParams.leadTime') },
    { clave: 'cobertura_objetivo_dias', label: t('stockParams.coberturaObjetivo') },
    { clave: 'stock_seguridad_dias', label: t('stockParams.stockSeguridad') },
    { clave: 'ventana_consumo_dias', label: t('stockParams.ventanaConsumo') },
    { clave: 'dias_stock_muerto', label: t('stockParams.diasStockMuerto') },
    { clave: 'minimo_absoluto', label: t('stockParams.minimoAbsoluto') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{t('stock.parametrosSemaforo')}</h2>
          <button onClick={onCerrar} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {!esSuperAdmin ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t('stockParams.soloSuperAdmin')}</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-muted">{t('stockParams.descripcion')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {campos.map((c) => (
                <div key={c.clave}>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">{c.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={valores[c.clave]}
                    onChange={(e) => campo(c.clave, Number(e.target.value))}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {mensaje && <p className="mt-3 text-xs font-medium text-ink">{mensaje}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onCerrar} className="rounded-full border border-border px-4 py-2 text-xs font-medium text-ink-muted">
                {t('stock.cancelar')}
              </button>
              <button
                onClick={guardar}
                disabled={pending}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {pending ? t('stockParams.guardando') : t('stockParams.guardar')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
