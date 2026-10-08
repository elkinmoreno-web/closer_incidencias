'use client';

import { useState, useTransition } from 'react';
import { CheckCheck, Undo2, X, Loader2 } from 'lucide-react';
import { marcarRegularizada, type RegularizarState } from '@/app/dashboard/reclamaciones/actions';

const eur = (n: number | null) => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`);

/**
 * Confirma que una reclamación aprobada ya se ha pagado en nómina, o
 * deshace esa marca. Pide confirmación en los dos sentidos: marcarla la saca
 * del listado, y sin aviso parecería que ha desaparecido.
 */
export function RegularizarButton({
  id,
  regularizada,
  rider,
  importeAprobado,
  viaPago,
}: {
  id: string;
  regularizada: boolean;
  rider: string;
  importeAprobado: number | null;
  viaPago: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [res, setRes] = useState<RegularizarState>(undefined);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      const r = await marcarRegularizada(id, !regularizada);
      setRes(r);
      if (r && 'success' in r) setAbierto(false);
    });
  }

  const Icono = regularizada ? Undo2 : CheckCheck;
  const titulo = regularizada ? 'Deshacer regularización' : 'Marcar como regularizada';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRes(undefined);
          setAbierto(true);
        }}
        title={titulo}
        className={`rounded-full border p-2 transition ${
          regularizada
            ? 'border-border bg-surface text-ink-muted hover:bg-bg'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        }`}
      >
        <Icono size={14} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-sm rounded-card bg-surface p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
              <button onClick={() => setAbierto(false)} className="text-ink-muted hover:text-ink" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-bg px-4 py-3 text-sm">
              <div className="font-medium text-ink">{rider}</div>
              <div className="text-ink-muted">
                {eur(importeAprobado)}
                {viaPago && ` · ${viaPago === 'primera_remesa' ? 'Primera remesa' : 'Siguiente nómina'}`}
              </div>
            </div>

            <p className="mb-4 text-sm text-ink-muted">
              {regularizada
                ? 'Volverá al listado normal como aprobada pendiente de pago, y se podrá volver a cambiar su estado.'
                : 'Confirma que ya se ha pagado. Saldrá del listado y quedará en el filtro "Regularizadas", visible para todos. No se podrá cambiar su estado ni enviarla a la papelera.'}
            </p>

            {res && 'error' in res && <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{res.error}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={pending}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  regularizada ? 'bg-primary' : 'bg-emerald-600'
                }`}
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {regularizada ? 'Deshacer' : 'Regularizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
