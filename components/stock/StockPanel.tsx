'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Plus, FileText, Package, Truck, Clock3, ClipboardList, Settings2 } from 'lucide-react';
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
import { NuevaFichaModal } from '@/components/stock/NuevaFichaModal';
import { ParametrosStockPanel } from '@/components/stock/ParametrosStockPanel';
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

type Pestana = 'stock' | 'solicitudes' | 'historial' | 'fichas' | 'configuracion';

/**
 * Panel de Stock, organizado en pestañas de nivel superior — mismo
 * espíritu que la barra de navegación "Stock / Solicitudes / Registrar
 * / Historial / Plantilla / Historial Fichas / Configuración" del
 * sistema de Sheets, adaptado: "Registrar" y "Plantilla" quedan como
 * botones/modales flotantes (son acciones puntuales, no vistas), y el
 * resto se agrupa en 5 pestañas.
 */
export function StockPanel({ materiales, centros, esSuperAdmin }: { materiales: StockMaterial[]; centros: Centro[]; esSuperAdmin: boolean }) {
  const { t, idioma } = useIdioma();
  const [pestana, setPestana] = useState<Pestana>('stock');
  const [materialActivo, setMaterialActivo] = useState<number | null>(materiales[0]?.id ?? null);
  const [stockCrudo, setStockCrudo] = useState<StockDisponible[]>([]);
  const [parametros, setParametros] = useState<StockParametros | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoConNombres[]>([]);
  const [tipos, setTipos] = useState<StockTipoMovimiento[]>([]);
  const [cargando, startCarga] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [fichaModalAbierto, setFichaModalAbierto] = useState(false);
  const [fichasGeneradas, setFichasGeneradas] = useState<(StockFicha & { centro_nombre: string; admin_usuario: string | null })[]>([]);

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

  const material = materiales.find((m) => m.id === materialActivo);

  // El semáforo se calcula en el cliente (no en el servidor) para que
  // ajustar parámetros sea instantáneo sin volver a consultar la base.
  const stock = useMemo(() => (parametros ? stockCrudo.map((f) => calcularSemaforo(f, parametros)) : stockCrudo), [stockCrudo, parametros]);

  const PESTANAS: { clave: Pestana; label: string; icono: typeof Package }[] = [
    { clave: 'stock', label: t('stockTab.stock'), icono: Package },
    { clave: 'solicitudes', label: t('stockTab.solicitudes'), icono: Truck },
    { clave: 'historial', label: t('stockTab.historial'), icono: Clock3 },
    { clave: 'fichas', label: t('stockTab.fichas'), icono: ClipboardList },
    { clave: 'configuracion', label: t('stockTab.configuracion'), icono: Settings2 },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de material + acciones rápidas — visibles siempre, no solo en la pestaña Stock */}
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
            onClick={() => setFichaModalAbierto(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-bg"
          >
            <FileText size={16} />
            {t('stockFicha.boton')}
          </button>
          <button
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            <Plus size={16} />
            {t('stock.registrarMovimiento')}
          </button>
        </div>
      </div>

      {/* Pestañas de nivel superior */}
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

      {pestana === 'solicitudes' && <SolicitudesTab />}

      {material && pestana === 'historial' && (cargando ? <p className="py-6 text-center text-sm text-ink-muted">…</p> : <HistorialTab movimientos={movimientos} />)}

      {pestana === 'fichas' && <FichasTab fichas={fichasGeneradas} />}

      {pestana === 'configuracion' && parametros && (
        <ParametrosStockPanel parametros={parametros} esSuperAdmin={esSuperAdmin} onGuardado={(p) => setParametros(p)} siempreAbierto />
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

      {fichaModalAbierto && (
        <NuevaFichaModal
          materiales={materiales}
          onCerrar={() => setFichaModalAbierto(false)}
          onGenerada={() => {
            recargarFichas();
            if (materialActivo !== null) recargar(materialActivo);
          }}
        />
      )}
    </div>
  );
}
