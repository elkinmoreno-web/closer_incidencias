'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Plus, Package, Truck, Clock3, Settings2, FileText } from 'lucide-react';
import {
  obtenerStockDisponible,
  listarMovimientosRecientes,
  listarTiposMovimiento,
  obtenerParametrosStock,
  listarFichasRecientes,
} from '@/app/dashboard/stock/actions';
import type { StockMaterial, StockDisponible, StockMovimiento, StockTipoMovimiento, StockParametros, StockFicha, Centro } from '@/lib/types';
import { NuevoMovimientoModal } from '@/components/stock/NuevoMovimientoModal';
import { ImportarStockModal } from '@/components/stock/ImportarStockModal';
import { ParametrosStockModal } from '@/components/stock/ParametrosStockModal';
import { StockResumenTab } from '@/components/stock/StockResumenTab';
import { SolicitudesTab } from '@/components/stock/SolicitudesTab';
import { HistorialTab } from '@/components/stock/HistorialTab';
import { FichasTab } from '@/components/stock/FichasTab';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { calcularSemaforo } from '@/lib/stockSemaforo';

type MovimientoConNombres = StockMovimiento & {
  centro_origen_nombre: string | null;
  centro_destino_nombre: string | null;
  admin_usuario: string | null;
  tipo_etiqueta: string;
};

type Pestana = 'stock' | 'solicitudes' | 'historial';

// Selector de "material" al mismo nivel que Mochilas/Soportes/
// Chubasqueros — Fichas no es un material real (no tiene stock por
// centro propio, puede incluir varios materiales a la vez en un solo
// justificante), pero se pidió explícitamente que viviera en ese
// mismo nivel de navegación, no en una pestaña aparte.
const CLAVE_FICHAS = '__fichas__';

/**
 * Panel de Stock. Arriba: selector de material (Mochilas, Soportes,
 * Chubasqueros, ... y Fichas al final, mismo nivel). Cuando el
 * seleccionado es un material real, debajo aparecen las pestañas
 * Stock/Solicitudes/Historial para ese material. Cuando es "Fichas",
 * se muestra directo su propio listado — no tiene esas 3 sub-pestañas
 * porque no es un material con stock por centro.
 */
export function StockPanel({ materiales, centros, esSuperAdmin }: { materiales: StockMaterial[]; centros: Centro[]; esSuperAdmin: boolean }) {
  const { t, idioma } = useIdioma();
  const [seleccion, setSeleccion] = useState<string>(materiales[0] ? String(materiales[0].id) : CLAVE_FICHAS);
  const [pestana, setPestana] = useState<Pestana>('stock');
  const [stockCrudo, setStockCrudo] = useState<StockDisponible[]>([]);
  const [parametros, setParametros] = useState<StockParametros | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoConNombres[]>([]);
  const [tipos, setTipos] = useState<StockTipoMovimiento[]>([]);
  const [cargando, startCarga] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [parametrosModalAbierto, setParametrosModalAbierto] = useState(false);
  const [fichasGeneradas, setFichasGeneradas] = useState<(StockFicha & { centro_nombre: string; admin_usuario: string | null })[]>([]);

  const esFichas = seleccion === CLAVE_FICHAS;
  const materialActivo = esFichas ? null : Number(seleccion);
  const material = materiales.find((m) => m.id === materialActivo);

  function recargar(materialId: number) {
    startCarga(async () => {
      const [s, m, p] = await Promise.all([obtenerStockDisponible(materialId), listarMovimientosRecientes(materialId), obtenerParametrosStock()]);
      setStockCrudo(s);
      setMovimientos(m);
      setParametros(p);
    });
  }

  function recargarFichas() {
    listarFichasRecientes().then(setFichasGeneradas);
  }

  useEffect(() => {
    listarTiposMovimiento().then(setTipos);
    recargarFichas();
  }, []);

  useEffect(() => {
    if (materialActivo !== null) recargar(materialActivo);
  }, [materialActivo]);

  // El semáforo se calcula en el cliente (no en el servidor) para que
  // ajustar parámetros sea instantáneo sin volver a consultar la base.
  const stock = useMemo(() => (parametros ? stockCrudo.map((f) => calcularSemaforo(f, parametros)) : stockCrudo), [stockCrudo, parametros]);

  const PESTANAS: { clave: Pestana; label: string; icono: typeof Package }[] = [
    { clave: 'stock', label: t('stockTab.stock'), icono: Package },
    { clave: 'solicitudes', label: t('stockTab.solicitudes'), icono: Truck },
    { clave: 'historial', label: t('stockTab.historial'), icono: Clock3 },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de material (incluye Fichas al final) + acciones rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-full bg-bg p-1">
          {materiales.map((m) => (
            <button
              key={m.id}
              onClick={() => setSeleccion(String(m.id))}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                seleccion === String(m.id) ? 'bg-primary text-white' : 'text-ink-muted'
              }`}
            >
              <span>{m.icono}</span>
              {nombreSegunIdioma(idioma, m.titulo, m.titulo_en)}
            </button>
          ))}
          <button
            onClick={() => setSeleccion(CLAVE_FICHAS)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
              esFichas ? 'bg-primary text-white' : 'text-ink-muted'
            }`}
          >
            <FileText size={14} />
            {t('stockTab.fichas')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {material && <ImportarStockModal material={material} />}
          {!esFichas && (
            <button
              onClick={() => setParametrosModalAbierto(true)}
              title={t('stock.parametrosSemaforo')}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-bg"
            >
              <Settings2 size={16} />
            </button>
          )}
          {!esFichas && (
            <button
              onClick={() => setModalAbierto(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              <Plus size={16} />
              {t('stock.registrarMovimiento')}
            </button>
          )}
        </div>
      </div>

      {esFichas ? (
        <FichasTab
          fichas={fichasGeneradas}
          centros={centros}
          onFichaGenerada={() => {
            recargarFichas();
          }}
        />
      ) : (
        <>
          {/* Pestañas propias del material seleccionado */}
          <div className="flex gap-1 overflow-x-auto border-b border-border">
            {PESTANAS.map((p) => (
              <button
                key={p.clave}
                onClick={() => setPestana(p.clave)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                  pestana === p.clave ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <p.icono size={14} />
                {p.label}
              </button>
            ))}
          </div>

          {material && pestana === 'stock' && (cargando ? <p className="py-6 text-center text-sm text-ink-muted">…</p> : <StockResumenTab stock={stock} material={material} />)}

          {material && pestana === 'solicitudes' && <SolicitudesTab materialId={material.id} />}

          {material && pestana === 'historial' && (cargando ? <p className="py-6 text-center text-sm text-ink-muted">…</p> : <HistorialTab movimientos={movimientos} />)}
        </>
      )}

      {modalAbierto && material && (
        <NuevoMovimientoModal
          material={material}
          materiales={materiales}
          tipos={tipos}
          centros={centros}
          onCerrar={() => setModalAbierto(false)}
          onRegistrado={(materialIdUsado) => {
            setModalAbierto(false);
            // Recarga el material REALMENTE usado en el registro, que
            // puede ser distinto del que estaba activo en la pestaña
            // principal si el usuario cambió de material dentro del
            // propio modal (Paso 1) — sin esto, el historial se
            // refrescaba del material equivocado y parecía que el
            // movimiento nunca se había guardado.
            setSeleccion(String(materialIdUsado));
            recargar(materialIdUsado);
          }}
        />
      )}

      {parametrosModalAbierto && parametros && (
        <ParametrosStockModal
          parametros={parametros}
          esSuperAdmin={esSuperAdmin}
          onGuardado={(p: StockParametros) => setParametros(p)}
          onCerrar={() => setParametrosModalAbierto(false)}
        />
      )}
    </div>
  );
}
