'use client';

import { useState, useTransition } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { crearFichaEntrega } from '@/app/dashboard/stock/actions';
import type { StockMaterial, StockEstadoFicha, StockMaterialFicha } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { BuscadorRiderRemoto } from '@/components/shared/BuscadorRiderRemoto';
import type { RiderResultado } from '@/app/dashboard/buscarRiders';
import { FirmaCanvas } from '@/components/stock/FirmaCanvas';
import { urlArchivoDrive } from '@/lib/driveUrl';

interface LineaMaterial {
  materialId: number | '';
  cantidad: string;
  observaciones: string;
}

/**
 * Ficha de entrega/devolución con firma del rider — genera el PDF y
 * mueve el stock automáticamente al guardar (equivalente a
 * api_stk_guardar_plantilla del sistema anterior, adaptado a este
 * stack con pdf-lib en vez de una plantilla de Google Docs).
 */
export function NuevaFichaModal({ materiales, onCerrar, onGenerada }: { materiales: StockMaterial[]; onCerrar: () => void; onGenerada: () => void }) {
  const { t, idioma } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [riderElegido, setRiderElegido] = useState<RiderResultado | null>(null);
  const [centroId, setCentroId] = useState('');
  const [estado, setEstado] = useState<StockEstadoFicha>('Asignación');
  const [lineas, setLineas] = useState<LineaMaterial[]>([{ materialId: '', cantidad: '', observaciones: '' }]);
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);

  function alElegirRider(r: RiderResultado | null) {
    setRiderElegido(r);
    if (r?.centroId && !centroId) setCentroId(String(r.centroId));
  }

  function actualizarLinea(idx: number, campo: keyof LineaMaterial, valor: string) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: campo === 'materialId' ? Number(valor) : valor } : l)));
  }

  function anadirLinea() {
    setLineas((prev) => [...prev, { materialId: '', cantidad: '', observaciones: '' }]);
  }

  function quitarLinea(idx: number) {
    setLineas((prev) => prev.filter((_, i) => i !== idx));
  }

  function guardar() {
    if (!riderElegido) {
      setError(t('stockFicha.faltaRider'));
      return;
    }
    if (!centroId) {
      setError(t('stockFicha.faltaCentro'));
      return;
    }
    const materialesValidos: StockMaterialFicha[] = lineas
      .filter((l) => l.materialId && Number(l.cantidad) > 0)
      .map((l) => {
        const m = materiales.find((mm) => mm.id === l.materialId)!;
        return {
          materialId: m.id,
          materialClave: m.clave,
          materialTitulo: nombreSegunIdioma(idioma, m.titulo, m.titulo_en),
          cantidad: Number(l.cantidad),
          observaciones: l.observaciones.trim() || undefined,
        };
      });
    if (materialesValidos.length === 0) {
      setError(t('stockFicha.faltaMaterial'));
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await crearFichaEntrega({
        centroId: Number(centroId),
        riderId: riderElegido.id,
        riderNombre: riderElegido.nombre,
        riderDni: riderElegido.dni,
        estado,
        materiales: materialesValidos,
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockFicha.centro')}</label>
              <input
                disabled
                value={riderElegido?.centroNombre ?? ''}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink-muted"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockFicha.estadoFicha')}</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as StockEstadoFicha)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="Asignación">{t('stockFicha.asignacion')}</option>
                <option value="Devolución buen estado">{t('stockFicha.devolucionOk')}</option>
                <option value="Devolución mal estado">{t('stockFicha.devolucionMal')}</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockFicha.materiales')}</label>
              <div className="flex flex-col gap-2">
                {lineas.map((l, idx) => (
                  <div key={idx} className="rounded-lg border border-border p-2">
                    <div className="flex gap-2">
                      <select
                        value={l.materialId}
                        onChange={(e) => actualizarLinea(idx, 'materialId', e.target.value)}
                        className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                      >
                        <option value="">{t('stock.selecciona')}</option>
                        {materiales.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.icono} {nombreSegunIdioma(idioma, m.titulo, m.titulo_en)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={l.cantidad}
                        onChange={(e) => actualizarLinea(idx, 'cantidad', e.target.value)}
                        placeholder={t('stock.cantidad')}
                        className="w-20 rounded-lg border border-border px-2 py-1.5 text-center text-xs focus:border-primary focus:outline-none"
                      />
                      {lineas.length > 1 && (
                        <button onClick={() => quitarLinea(idx)} className="text-danger hover:text-red-700" title={t('stockFicha.quitarMaterial')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <input
                      value={l.observaciones}
                      onChange={(e) => actualizarLinea(idx, 'observaciones', e.target.value)}
                      placeholder={t('stockFicha.observacionesMaterial')}
                      className="mt-1.5 w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <button onClick={anadirLinea} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus size={12} />
                {t('stockFicha.anadirMaterial')}
              </button>
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
