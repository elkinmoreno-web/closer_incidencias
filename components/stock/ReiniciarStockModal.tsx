'use client';

import { useState, useTransition } from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';
import { vaciarStockDePrueba } from '@/app/dashboard/stock/actions';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Borra TODO el ledger de Stock (todos los materiales) para dejar el
 * módulo en blanco antes de importar los datos reales — solo
 * Super Admin, con confirmación explícita escribiendo una frase (no
 * un simple "¿Estás seguro?", porque esto no tiene papelera ni vuelta
 * atrás).
 */
export function ReiniciarStockModal({ onVaciado }: { onVaciado: () => void }) {
  const { t } = useIdioma();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ movimientos: number; fichas: number } | null>(null);

  const frase = t('stock.vaciarStockFrase');
  const listo = confirmacion.trim() === frase;

  function cerrar() {
    setAbierto(false);
    setConfirmacion('');
    setError(null);
    setResultado(null);
  }

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const res = await vaciarStockDePrueba();
      if (res && 'error' in res) {
        setError(res.error);
        return;
      }
      if (res?.success) {
        setResultado({ movimientos: res.movimientosBorrados, fichas: res.fichasBorradas });
        onVaciado();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        title={t('stock.vaciarStock')}
        className="flex items-center gap-1.5 rounded-full border border-danger/30 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/5"
      >
        <Trash2 size={14} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrar}>
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-danger">
                <AlertTriangle size={18} />
                {t('stock.vaciarStockTitulo')}
              </h2>
              <button onClick={cerrar} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            {resultado ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-ink">
                  {t('stock.vaciarStockExito').replace('{movimientos}', String(resultado.movimientos)).replace('{fichas}', String(resultado.fichas))}
                </p>
                <div className="flex justify-end">
                  <button onClick={cerrar} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                    {t('stockImport.cerrar')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="rounded-lg bg-danger/5 p-3 text-sm text-danger">{t('stock.vaciarStockAviso')}</p>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.vaciarStockConfirmarTexto')}</label>
                  <input
                    autoFocus
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-danger focus:outline-none"
                  />
                </div>
                {error && <p className="text-sm font-medium text-danger">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={cerrar} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                    {t('comun.cancelar')}
                  </button>
                  <button
                    onClick={confirmar}
                    disabled={!listo || pending}
                    className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {t('stock.vaciarStockBoton')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
