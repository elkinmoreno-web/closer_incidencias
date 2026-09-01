'use client';

import { useState, useTransition } from 'react';
import { Settings2, ChevronDown } from 'lucide-react';
import { actualizarParametrosStock } from '@/app/dashboard/stock/actions';
import type { StockParametros } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Panel colapsable para ajustar los 6 parámetros del semáforo de
 * reposición — portados de STK_CFG.paramsDef del sistema de Sheets.
 * Solo tiene sentido mostrarlo a quien puede editarlos (super_admin);
 * el resto ni lo ve, para no generar la expectativa de un ajuste que
 * no van a poder guardar.
 */
export function ParametrosStockPanel({ parametros, esSuperAdmin, onGuardado }: { parametros: StockParametros; esSuperAdmin: boolean; onGuardado: (p: StockParametros) => void }) {
  const { t } = useIdioma();
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState(parametros);
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (!esSuperAdmin) return null;

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
    <div className="rounded-card border border-border bg-surface">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Settings2 size={15} className="text-ink-muted" />
          {t('stock.parametrosSemaforo')}
        </span>
        <ChevronDown size={16} className={`text-ink-muted transition ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="border-t border-border px-5 py-4">
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

          <div className="mt-4 flex justify-end">
            <button
              onClick={guardar}
              disabled={pending}
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? t('stockParams.guardando') : t('stockParams.guardar')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
