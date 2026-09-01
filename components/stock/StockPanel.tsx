'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import {
  obtenerStockDisponible,
  listarMovimientosRecientes,
  listarTiposMovimiento,
} from '@/app/dashboard/stock/actions';
import type { StockMaterial, StockDisponible, StockMovimiento, StockTipoMovimiento } from '@/lib/types';
import type { Centro } from '@/lib/types';
import { NuevoMovimientoModal } from '@/components/stock/NuevoMovimientoModal';
import { ImportarStockModal } from '@/components/stock/ImportarStockModal';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { formatFecha } from '@/lib/utils';

type MovimientoConNombres = StockMovimiento & {
  centro_origen_nombre: string | null;
  centro_destino_nombre: string | null;
  admin_usuario: string | null;
  tipo_etiqueta: string;
};

export function StockPanel({ materiales, centros }: { materiales: StockMaterial[]; centros: Centro[] }) {
  const { t, idioma } = useIdioma();
  const [materialActivo, setMaterialActivo] = useState<number | null>(materiales[0]?.id ?? null);
  const [stock, setStock] = useState<StockDisponible[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoConNombres[]>([]);
  const [tipos, setTipos] = useState<StockTipoMovimiento[]>([]);
  const [cargando, startCarga] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);

  function recargar(materialId: number) {
    startCarga(async () => {
      const [s, m] = await Promise.all([obtenerStockDisponible(materialId), listarMovimientosRecientes(materialId)]);
      setStock(s);
      setMovimientos(m);
    });
  }

  useEffect(() => {
    listarTiposMovimiento().then(setTipos);
  }, []);

  useEffect(() => {
    if (materialActivo !== null) recargar(materialActivo);
  }, [materialActivo]);

  const material = materiales.find((m) => m.id === materialActivo);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full bg-bg p-1">
          {materiales.map((m) => (
            <button
              key={m.id}
              onClick={() => setMaterialActivo(m.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                materialActivo === m.id ? 'bg-primary text-white' : 'text-ink-muted'
              }`}
            >
              <span>{m.icono}</span>
              {nombreSegunIdioma(idioma, m.titulo, m.titulo_en)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {material && <ImportarStockModal material={material} />}
          <button
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            <Plus size={16} />
            {t('stock.registrarMovimiento')}
          </button>
        </div>
      </div>

      {material && (
        <>
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">{t('stock.stockPorCentro')}</h2>
            {cargando ? (
              <p className="py-6 text-center text-sm text-ink-muted">…</p>
            ) : stock.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{t('stock.sinStock')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">{t('stock.colCentro')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colDisponible')}</th>
                      {material.tiene_tallas && <th className="px-3 py-2 text-right">{t('stock.colTallas')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stock.map((s) => (
                      <tr key={s.centro_id}>
                        <td className="px-3 py-2 font-medium text-ink">{s.centro_nombre}</td>
                        <td className="px-3 py-2 text-right font-mono">{s.disponible}</td>
                        {material.tiene_tallas && (
                          <td className="px-3 py-2 text-right font-mono text-xs text-ink-muted">
                            {s.talla_m} / {s.talla_l} / {s.talla_xl} / {s.talla_xxl}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 font-semibold text-ink">{t('stock.historial')}</h2>
            {cargando ? (
              <p className="py-6 text-center text-sm text-ink-muted">…</p>
            ) : movimientos.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{t('stock.sinMovimientos')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">{t('stock.colFecha')}</th>
                      <th className="px-3 py-2">{t('stock.colTipo')}</th>
                      <th className="px-3 py-2">{t('stock.colOrigen')}</th>
                      <th className="px-3 py-2">{t('stock.colDestino')}</th>
                      <th className="px-3 py-2 text-right">{t('stock.colCantidad')}</th>
                      <th className="px-3 py-2">{t('stock.colRider')}</th>
                      <th className="px-3 py-2">{t('stock.colRegistradoPor')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movimientos.map((mv) => (
                      <tr key={mv.id}>
                        <td className="px-3 py-2 text-xs text-ink-muted">{formatFecha(mv.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{mv.tipo_etiqueta}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.centro_origen_nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.centro_destino_nombre ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{mv.unidades}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.rider_nombre_libre ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{mv.admin_usuario ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalAbierto && material && (
        <NuevoMovimientoModal
          material={material}
          materiales={materiales}
          tipos={tipos}
          centros={centros}
          onCerrar={() => setModalAbierto(false)}
          onRegistrado={() => {
            setModalAbierto(false);
            if (materialActivo !== null) recargar(materialActivo);
          }}
        />
      )}
    </div>
  );
}
