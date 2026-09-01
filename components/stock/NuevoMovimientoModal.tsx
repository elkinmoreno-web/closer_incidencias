'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { registrarMovimientoStock } from '@/app/dashboard/stock/actions';
import type { StockMaterial, StockTipoMovimiento, Centro } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { BuscadorRiderRemoto } from '@/components/shared/BuscadorRiderRemoto';
import type { RiderResultado } from '@/app/dashboard/buscarRiders';

const TIPOS_CON_RIDER = new Set(['ENTREGA_RIDER', 'DEVOLUCION_OK', 'DEVOLUCION_ROTA', 'NO_RECUPERADA', 'RIDER_YA_TIENE_SOPORTE', 'RECUPERADA_ROBO']);

export function NuevoMovimientoModal({
  material,
  materiales,
  tipos,
  centros,
  onCerrar,
  onRegistrado,
}: {
  material: StockMaterial;
  materiales: StockMaterial[];
  tipos: StockTipoMovimiento[];
  centros: Centro[];
  onCerrar: () => void;
  onRegistrado: () => void;
}) {
  const { t, idioma } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [materialId, setMaterialId] = useState(material.id);
  const [tipoClave, setTipoClave] = useState('');
  const [centroOrigenId, setCentroOrigenId] = useState('');
  const [centroDestinoId, setCentroDestinoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tallaM, setTallaM] = useState('');
  const [tallaL, setTallaL] = useState('');
  const [tallaXl, setTallaXl] = useState('');
  const [tallaXxl, setTallaXxl] = useState('');
  const [riderNombreLibre, setRiderNombreLibre] = useState('');
  const [riderElegido, setRiderElegido] = useState<RiderResultado | null>(null);
  const [notas, setNotas] = useState('');

  const materialSeleccionado = materiales.find((m) => m.id === materialId) ?? material;
  const tipo = tipos.find((tp) => tp.clave === tipoClave);
  const mostrarRider = tipo ? TIPOS_CON_RIDER.has(tipo.clave) : false;

  function alElegirRider(r: RiderResultado | null) {
    setRiderElegido(r);
    if (!r || !r.centroId) return;
    // Autocompleta el centro del movimiento con el centro del rider —
    // en Entrega/Devolución el centro relevante es siempre el suyo,
    // así se evita elegirlo dos veces.
    if (tipo?.requiere_origen && !centroOrigenId) setCentroOrigenId(String(r.centroId));
    if (tipo?.requiere_destino && !centroDestinoId) setCentroDestinoId(String(r.centroId));
  }

  function guardar() {
    if (!tipoClave) {
      setError(t('stock.selecciona'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await registrarMovimientoStock({
        materialId,
        tipoClave,
        centroOrigenId: centroOrigenId ? Number(centroOrigenId) : null,
        centroDestinoId: centroDestinoId ? Number(centroDestinoId) : null,
        cantidad: cantidad ? Number(cantidad) : 0,
        tallaM: tallaM ? Number(tallaM) : 0,
        tallaL: tallaL ? Number(tallaL) : 0,
        tallaXl: tallaXl ? Number(tallaXl) : 0,
        tallaXxl: tallaXxl ? Number(tallaXxl) : 0,
        riderId: riderElegido?.id ?? null,
        riderNombreLibre: riderElegido ? riderElegido.nombre : riderNombreLibre,
        notas,
      });
      if (res && 'error' in res) {
        setError(res.error);
        return;
      }
      onRegistrado();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{t('stock.nuevoMovimiento')}</h2>
          <button onClick={onCerrar} className="text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">{materialSeleccionado.icono} Material</label>
            <select
              value={materialId}
              onChange={(e) => setMaterialId(Number(e.target.value))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {nombreSegunIdioma(idioma, m.titulo, m.titulo_en)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.tipoMovimiento')}</label>
            <select
              value={tipoClave}
              onChange={(e) => setTipoClave(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">{t('stock.selecciona')}</option>
              {tipos.map((tp) => (
                <option key={tp.clave} value={tp.clave}>
                  {nombreSegunIdioma(idioma, tp.etiqueta, tp.etiqueta_en)}
                </option>
              ))}
            </select>
          </div>

          {tipo?.requiere_origen && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.centroOrigen')}</label>
              <select
                value={centroOrigenId}
                onChange={(e) => setCentroOrigenId(e.target.value)}
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
          )}

          {tipo?.requiere_destino && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.centroDestino')}</label>
              <select
                value={centroDestinoId}
                onChange={(e) => setCentroDestinoId(e.target.value)}
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
          )}

          {materialSeleccionado.tiene_tallas ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.colTallas')}</label>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" min={0} placeholder="M" value={tallaM} onChange={(e) => setTallaM(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
                <input type="number" min={0} placeholder="L" value={tallaL} onChange={(e) => setTallaL(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
                <input type="number" min={0} placeholder="XL" value={tallaXl} onChange={(e) => setTallaXl(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
                <input type="number" min={0} placeholder="XXL" value={tallaXxl} onChange={(e) => setTallaXxl(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.cantidad')}</label>
              <input
                type="number"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {mostrarRider && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.riderOpcional')}</label>
              <BuscadorRiderRemoto requerido={false} onSeleccionar={alElegirRider} />
              {!riderElegido && (
                <input
                  value={riderNombreLibre}
                  onChange={(e) => setRiderNombreLibre(e.target.value)}
                  placeholder={t('stock.riderPlaceholderLibre')}
                  className="mt-1.5 w-full rounded-lg border border-border px-3 py-2 text-xs focus:border-primary focus:outline-none"
                />
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.notas')}</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={t('stock.notasPlaceholder')}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button onClick={onCerrar} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
              {t('stock.cancelar')}
            </button>
            <button
              onClick={guardar}
              disabled={pending}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? t('stock.guardando') : t('stock.registrar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
