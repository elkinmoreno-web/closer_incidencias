'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { crearFichaEntrega } from '@/app/dashboard/stock/actions';
import { ITEMS_FICHA_FIJOS, type StockItemFicha, type Centro } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { BuscadorRiderRemoto } from '@/components/shared/BuscadorRiderRemoto';
import type { RiderResultado } from '@/app/dashboard/buscarRiders';
import { FirmaCanvas } from '@/components/stock/FirmaCanvas';
import { urlArchivoDrive } from '@/lib/driveUrl';

type Marca = StockItemFicha['marca'];

/**
 * Justificante de entrega/devolución con firma del rider — réplica de
 * la plantilla legal oficial de Closer Logistics: 8 ítems fijos, cada
 * uno con 3 casillas (Asignación / Devolución buen estado /
 * Devolución mal estado) marcables independientemente, más
 * observaciones libres por ítem. Genera el PDF y mueve el stock
 * automáticamente al guardar, solo para los 3 ítems que sí forman
 * parte del catálogo de inventario controlado.
 *
 * El rider puede NO existir todavía en el sistema (ej. recién
 * contratado, aún sin alta) — en ese caso, el DNI/NIE y el nombre se
 * escriben a mano y la ficha se genera igual, solo que sin riderId
 * (queda como texto libre, igual que ya permitía el sistema anterior).
 */
export function NuevaFichaModal({ centros, onCerrar, onGenerada }: { centros: Centro[]; onCerrar: () => void; onGenerada: () => void }) {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [riderElegido, setRiderElegido] = useState<RiderResultado | null>(null);
  const [dniManual, setDniManual] = useState('');
  const [nombreManual, setNombreManual] = useState('');
  const [centroId, setCentroId] = useState('');
  const [items, setItems] = useState<StockItemFicha[]>(ITEMS_FICHA_FIJOS.map((d) => ({ itemClave: d.clave, marca: null })));
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);

  function alElegirRider(r: RiderResultado | null) {
    setRiderElegido(r);
    if (r?.centroId) setCentroId(String(r.centroId));
  }

  function marcar(idx: number, marca: Marca) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, marca: it.marca === marca ? null : marca } : it)));
  }

  function actualizarObservaciones(idx: number, valor: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, observaciones: valor } : it)));
  }

  function guardar() {
    const nombre = riderElegido ? riderElegido.nombre : nombreManual.trim();
    const dni = riderElegido ? riderElegido.dni : dniManual.trim();

    if (!nombre || !dni) {
      setError(t('stockFicha.faltaRider'));
      return;
    }
    if (!centroId) {
      setError(t('stockFicha.faltaCentro'));
      return;
    }
    if (!items.some((it) => it.marca)) {
      setError(t('stockFicha.faltaMaterial'));
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await crearFichaEntrega({
        centroId: Number(centroId),
        riderId: riderElegido?.id ?? null,
        riderNombre: nombre,
        riderDni: dni,
        items,
        firmaBase64: firmaDataUrl,
      });
      if (res && 'error' in res) {
        setError(res.error);
        return;
      }
      if (res?.success) {
        setPdfUrl(urlArchivoDrive(res.pdfUrl));
        onGenerada();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{t('stockFicha.tituloModal')}</h2>
          <button onClick={onCerrar} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {pdfUrl ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm font-medium text-emerald-700">{t('stockFicha.generada')}</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              {t('stockFicha.verPdf')}
            </a>
            <button onClick={onCerrar} className="text-xs text-ink-muted hover:text-ink">
              {t('stockImport.cerrar')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockFicha.rider')}</label>
              <BuscadorRiderRemoto requerido={false} onSeleccionar={alElegirRider} />
              {!riderElegido && (
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <input
                    value={nombreManual}
                    onChange={(e) => setNombreManual(e.target.value)}
                    placeholder={t('stockFicha.nombreManualPlaceholder')}
                    className="rounded-lg border border-border px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  />
                  <input
                    value={dniManual}
                    onChange={(e) => setDniManual(e.target.value)}
                    placeholder={t('stockFicha.dniManualPlaceholder')}
                    className="rounded-lg border border-border px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  />
                </div>
              )}
              <p className="mt-1 text-[11px] text-ink-muted">{t('stockFicha.ayudaRiderNoExiste')}</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockFicha.centro')}</label>
              <select
                value={centroId}
                onChange={(e) => setCentroId(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">{t('stock.selecciona')}</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-ink-muted">{t('stockFicha.materiales')}</label>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-bg text-ink-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">{t('stockFicha.itemLabel')}</th>
                      <th className="px-1.5 py-1.5 text-center font-semibold">{t('stockFicha.asignacion')}</th>
                      <th className="px-1.5 py-1.5 text-center font-semibold">{t('stockFicha.devolucionOkCorta')}</th>
                      <th className="px-1.5 py-1.5 text-center font-semibold">{t('stockFicha.devolucionMalCorta')}</th>
                      <th className="px-2 py-1.5 text-left font-semibold">{t('stockFicha.observacionesMaterial')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ITEMS_FICHA_FIJOS.map((def, idx) => (
                      <tr key={def.clave}>
                        <td className="px-2 py-1.5 font-medium text-ink">{def.etiqueta}</td>
                        <td className="px-1.5 py-1.5 text-center">
                          <input type="checkbox" checked={items[idx].marca === 'asignacion'} onChange={() => marcar(idx, 'asignacion')} className="h-3.5 w-3.5 accent-primary" />
                        </td>
                        <td className="px-1.5 py-1.5 text-center">
                          <input type="checkbox" checked={items[idx].marca === 'devolucion_ok'} onChange={() => marcar(idx, 'devolucion_ok')} className="h-3.5 w-3.5 accent-primary" />
                        </td>
                        <td className="px-1.5 py-1.5 text-center">
                          <input type="checkbox" checked={items[idx].marca === 'devolucion_mal'} onChange={() => marcar(idx, 'devolucion_mal')} className="h-3.5 w-3.5 accent-primary" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={items[idx].observaciones ?? ''}
                            onChange={(e) => actualizarObservaciones(idx, e.target.value)}
                            className="w-full rounded border border-border px-1.5 py-1 text-[11px] focus:border-primary focus:outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockFicha.firmaDelRider')}</label>
              <FirmaCanvas onCambio={setFirmaDataUrl} />
            </div>

            {error && <p className="text-sm font-medium text-danger">{error}</p>}

            <div className="mt-2 flex justify-end gap-2">
              <button onClick={onCerrar} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                {t('stock.cancelar')}
              </button>
              <button onClick={guardar} disabled={pending} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {pending ? t('stockFicha.generando') : t('stockFicha.generar')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
