'use client';

import { useState } from 'react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import type { ClaveTraduccion } from '@/lib/i18n/dictionaries/es';

/** Pestañas con panel, en el orden en que se pintan. */
const PESTANAS = [
  { id: 'incidencia', modulo: 'rider_incidencia', etiqueta: 'tabs.incidencia' },
  { id: 'ausencia', modulo: 'rider_ausencia', etiqueta: 'tabs.ausencia' },
  { id: 'reclamacion', modulo: 'rider_reclamacion', etiqueta: 'tabs.reclamacion' },
  { id: 'metricas', modulo: 'rider_metricas', etiqueta: 'tabs.metricas' },
  { id: 'zona', modulo: 'rider_zona', etiqueta: 'tabs.zona' },
] as const satisfies readonly { id: string; modulo: string; etiqueta: ClaveTraduccion }[];

type Pestana = (typeof PESTANAS)[number]['id'];

/**
 * `flex-auto` + `whitespace-nowrap`: cada píldora parte del ancho de su
 * texto, no puede encogerse por debajo de él, y luego crece para repartirse
 * lo que sobre de SU fila.
 *
 * Antes era `flex-1` (todas el mismo ancho). Con 5 pestañas en un móvil de
 * 370px, "Mis métricas" ya no cabía y partía en dos líneas: eso estiraba la
 * barra entera y, al ser `rounded-full`, las píldoras cortas se convertían
 * en círculos. Así bajan de fila las que no caben en vez de aplastarse.
 *
 * El tamaño de letra no sube en pantallas grandes a propósito: con todas
 * las pestañas encendidas, `text-sm` hacía que la última cayera sola a una
 * segunda fila y se estirara de lado a lado como una banda.
 */
const CLASE_PILDORA =
  'flex-auto whitespace-nowrap rounded-full px-3 py-2 text-center text-xs font-semibold transition sm:px-4 sm:py-2.5';

export function Tabs({
  incidenciaPanel,
  ausenciaPanel,
  reclamacionPanel,
  metricasPanel,
  zonaPanel,
  visibles,
}: {
  incidenciaPanel: React.ReactNode;
  ausenciaPanel: React.ReactNode;
  reclamacionPanel: React.ReactNode;
  metricasPanel: React.ReactNode;
  zonaPanel: React.ReactNode;
  /** Claves de pestaña encendidas (ver lib/modulos.ts). */
  visibles: string[];
}) {
  const { t } = useIdioma();

  const encendidas = PESTANAS.filter((p) => visibles.includes(p.modulo));
  // La primera encendida es la de inicio: si "incidencia" estuviera
  // apagada, arrancar en ella dejaría el panel en blanco.
  const [tab, setTab] = useState<Pestana>(encendidas[0]?.id ?? 'incidencia');

  const paneles: Record<Pestana, React.ReactNode> = {
    incidencia: incidenciaPanel,
    ausencia: ausenciaPanel,
    reclamacion: reclamacionPanel,
    metricas: metricasPanel,
    zona: zonaPanel,
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 rounded-3xl bg-bg p-1">
        {encendidas.map((p) => (
          <button
            key={p.id}
            onClick={() => setTab(p.id)}
            className={`${CLASE_PILDORA} ${tab === p.id ? 'bg-primary text-white' : 'text-ink-muted'}`}
          >
            {t(p.etiqueta)}
          </button>
        ))}
      </div>
      {paneles[tab]}
    </div>
  );
}
