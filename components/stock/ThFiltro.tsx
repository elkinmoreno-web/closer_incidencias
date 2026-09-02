'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

export type DireccionOrden = 'asc' | 'desc' | null;
export type OperadorNumerico = 'mayor' | 'menor' | 'igual';

export interface FiltroColumna {
  texto?: string;
  operador?: OperadorNumerico;
  valor?: string;
}

const ANCHO_POPOVER = 224; // w-56

/**
 * Cabecera de tabla con ordenamiento y filtro al hacer click — pensado
 * para las tablas del módulo de Stock. Cada columna decide su propio
 * tipo de filtro: 'texto' (contiene), 'numero' (mayor/menor/igual que)
 * o 'select' (categoría fija).
 *
 * El popover se renderiza en un PORTAL (document.body), no anidado en
 * el <th> — las tablas de este proyecto viven dentro de un contenedor
 * con overflow-x-auto (para el scroll horizontal en móvil), y un
 * elemento position:absolute anidado ahí se recorta en cuanto se sale
 * de ese contenedor, aunque el propio popover esté bien posicionado.
 * El portal saca el popover de ese flujo, calculando su posición en
 * píxeles reales de pantalla con getBoundingClientRect().
 */
export function ThFiltro({
  label,
  align = 'left',
  tipo = 'texto',
  opciones,
  ordenActivo,
  onOrdenar,
  filtro,
  onFiltrar,
}: {
  label: string;
  align?: 'left' | 'right';
  tipo?: 'texto' | 'numero' | 'select';
  /** Requerido cuando tipo='select' — pares [valor, etiqueta] a elegir. */
  opciones?: [string, string][];
  ordenActivo: DireccionOrden;
  onOrdenar: (dir: DireccionOrden) => void;
  filtro: FiltroColumna | undefined;
  onFiltrar: (f: FiltroColumna | undefined) => void;
}) {
  const { t } = useIdioma();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(filtro?.texto ?? '');
  const [operador, setOperador] = useState<OperadorNumerico>(filtro?.operador ?? 'menor');
  const [valor, setValor] = useState(filtro?.valor ?? '');
  const [seleccionado, setSeleccionado] = useState(filtro?.texto ?? '');
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClickFuera(e: MouseEvent) {
      const t = e.target as Node;
      if (botonRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setAbierto(false);
    }
    document.addEventListener('mousedown', alClickFuera);
    return () => document.removeEventListener('mousedown', alClickFuera);
  }, []);

  function abrir() {
    const rect = botonRef.current?.getBoundingClientRect();
    if (rect) {
      // Si abrir alineado a la derecha del botón se saldría de la
      // pantalla, se ancla al borde derecho de la ventana en su lugar
      // (con un pequeño margen) — mismo criterio para "align=right".
      let left = align === 'right' ? rect.right - ANCHO_POPOVER : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - ANCHO_POPOVER - 8));
      setPosicion({ top: rect.bottom + 4, left });
    }
    setAbierto(true);
  }

  const filtroActivo = tipo === 'numero' ? !!filtro?.valor : !!filtro?.texto;

  function aplicar() {
    if (tipo === 'numero') {
      onFiltrar(valor.trim() ? { operador, valor: valor.trim() } : undefined);
    } else if (tipo === 'select') {
      onFiltrar(seleccionado ? { texto: seleccionado } : undefined);
    } else {
      onFiltrar(texto.trim() ? { texto: texto.trim() } : undefined);
    }
    setAbierto(false);
  }

  function limpiar() {
    setTexto('');
    setValor('');
    setSeleccionado('');
    onFiltrar(undefined);
    setAbierto(false);
  }

  const IconoOrden = ordenActivo === 'asc' ? ArrowUp : ordenActivo === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <button
          onClick={() => onOrdenar(ordenActivo === 'asc' ? 'desc' : ordenActivo === 'desc' ? null : 'asc')}
          className="flex items-center gap-1 hover:text-primary"
        >
          {label}
          <IconoOrden size={11} className={ordenActivo ? 'text-primary' : 'opacity-50'} />
        </button>
        <button
          ref={botonRef}
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          className={filtroActivo ? 'text-primary' : 'text-ink-muted opacity-60 hover:opacity-100'}
        >
          <Filter size={11} />
        </button>
      </div>

      {abierto &&
        posicion &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: posicion.top, left: posicion.left, width: ANCHO_POPOVER }}
            className="z-50 rounded-lg border border-border bg-surface p-3 text-left text-xs normal-case tracking-normal text-ink shadow-lg"
          >
            {tipo === 'texto' ? (
              <input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && aplicar()}
                placeholder={t('stockFiltro.contiene')}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            ) : tipo === 'select' ? (
              <select
                autoFocus
                value={seleccionado}
                onChange={(e) => setSeleccionado(e.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              >
                <option value="">{t('stockFiltro.todos')}</option>
                {(opciones ?? []).map(([val, etiqueta]) => (
                  <option key={val} value={val}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex gap-1.5">
                <select value={operador} onChange={(e) => setOperador(e.target.value as OperadorNumerico)} className="rounded-lg border border-border px-1.5 py-1.5 text-xs focus:border-primary focus:outline-none">
                  <option value="mayor">{t('stockFiltro.mayorQue')}</option>
                  <option value="menor">{t('stockFiltro.menorQue')}</option>
                  <option value="igual">{t('stockFiltro.igualA')}</option>
                </select>
                <input
                  autoFocus
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && aplicar()}
                  className="w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={limpiar} className="text-xs text-ink-muted hover:text-ink">
                {t('stockFiltro.limpiar')}
              </button>
              <button onClick={aplicar} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                {t('stockFiltro.aplicar')}
              </button>
            </div>
          </div>,
          document.body
        )}
    </th>
  );
}

export function cumpleFiltroTexto(valor: string, filtro: FiltroColumna | undefined): boolean {
  if (!filtro?.texto) return true;
  return valor.toLowerCase().includes(filtro.texto.toLowerCase());
}

export function cumpleFiltroNumero(valor: number, filtro: FiltroColumna | undefined): boolean {
  if (!filtro?.valor) return true;
  const n = Number(filtro.valor);
  if (Number.isNaN(n)) return true;
  if (filtro.operador === 'mayor') return valor > n;
  if (filtro.operador === 'igual') return valor === n;
  return valor < n; // 'menor' por defecto
}
