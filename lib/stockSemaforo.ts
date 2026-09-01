import type { StockDisponible, StockParametros, StockSemaforo } from '@/lib/types';

/**
 * Calcula las métricas de reposición y el semáforo de una fila de
 * stock, con los mismos parámetros y la misma fórmula que usaba
 * recalcSemaforo() en el panel de Google Sheets — portado literal,
 * no reinventado, para que el comportamiento sea el que el equipo ya
 * conoce.
 *
 * Semáforo, en orden de prioridad:
 *   NEGATIVO → disponible < 0 (descuadre del sistema)
 *   ROTURA   → consume pero está exactamente a 0
 *   CRITICO  → por debajo del punto de reposición
 *   BAJO     → por debajo del punto de reposición * 1.35 (margen de aviso)
 *   MUERTO   → no consume y lleva más de N días sin ningún movimiento
 *   SOBRE    → cobertura muy por encima del objetivo (más del doble)
 *   OK       → cualquier otro caso
 */
export function calcularSemaforo(fila: StockDisponible, parametros: StockParametros): StockDisponible {
  const ventana = Math.max(parametros.ventana_consumo_dias || 28, 1);
  const consumoDia = fila.consumo_ventana / ventana;
  const consumoSemana = consumoDia * 7;
  const cobertura = consumoDia > 0 ? fila.disponible / consumoDia : fila.disponible > 0 ? 999 : 0;
  const puntoReposicion = Math.round(consumoDia * (parametros.lead_time_dias + parametros.stock_seguridad_dias));
  const objetivo = Math.max(Math.round(consumoDia * parametros.cobertura_objetivo_dias), consumoDia > 0 ? parametros.minimo_absoluto : 0);
  const sugerido = Math.max(0, objetivo - fila.disponible - fila.transito_entrante);

  let semaforo: StockSemaforo;
  if (fila.disponible < 0) semaforo = 'NEGATIVO';
  else if (consumoDia > 0 && fila.disponible === 0) semaforo = 'ROTURA';
  else if (consumoDia > 0 && fila.disponible < puntoReposicion) semaforo = 'CRITICO';
  else if (consumoDia > 0 && fila.disponible < puntoReposicion * 1.35) semaforo = 'BAJO';
  else if (fila.disponible > 0 && consumoDia === 0 && fila.dias_sin_movimiento != null && fila.dias_sin_movimiento > parametros.dias_stock_muerto) semaforo = 'MUERTO';
  else if (cobertura > parametros.cobertura_objetivo_dias * 2.2 && fila.disponible > parametros.minimo_absoluto * 2) semaforo = 'SOBRE';
  else semaforo = 'OK';

  return {
    ...fila,
    consumo_dia: consumoDia,
    consumo_semana: consumoSemana,
    cobertura_dias: consumoDia > 0 && cobertura < 900 ? Math.round(cobertura) : null,
    punto_reposicion: puntoReposicion,
    objetivo,
    sugerido,
    semaforo,
  };
}

export const ETIQUETA_SEMAFORO: Record<StockSemaforo, { es: string; en: string; color: string }> = {
  NEGATIVO: { es: 'Descuadre', en: 'Mismatch', color: 'bg-red-100 text-red-800' },
  ROTURA: { es: 'Sin stock', en: 'Out of stock', color: 'bg-red-100 text-red-800' },
  CRITICO: { es: 'Crítico', en: 'Critical', color: 'bg-red-100 text-red-800' },
  BAJO: { es: 'Bajo', en: 'Low', color: 'bg-amber-100 text-amber-800' },
  MUERTO: { es: 'Parado', en: 'Stale', color: 'bg-slate-200 text-slate-600' },
  SOBRE: { es: 'De sobra', en: 'Overstocked', color: 'bg-blue-100 text-blue-800' },
  OK: { es: 'Bien', en: 'OK', color: 'bg-emerald-100 text-emerald-800' },
};

/** Orden de urgencia para ordenar la tabla (menor número = más urgente), igual que estadoHub().o del sistema de Sheets. */
export const ORDEN_URGENCIA_SEMAFORO: Record<StockSemaforo, number> = {
  NEGATIVO: 0,
  ROTURA: 1,
  CRITICO: 2,
  BAJO: 3,
  MUERTO: 5,
  SOBRE: 6,
  OK: 7,
};
