'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

export type DireccionOrden = 'asc' | 'desc' | null;
export type OperadorNumerico = 'mayor' | 'menor' | 'igual';

export interface FiltroColumna {
  texto?: string;
  operador?: OperadorNumerico;
  valor?: string;
}

/**
 * Cabecera de tabla con ordenamiento y filtro al hacer click — pensado
 * para las tablas del módulo de Stock (stock por centro, historial de
 * movimientos, fichas generadas), donde antes solo había un puñado de
 * filtros sueltos fuera de la tabla. Cada columna decide su propio
 * tipo de filtro: 'texto' (contiene) o 'numero' (mayor/menor/igual que).
 */
export function ThFiltro({
  label,
  align = 'left',
  tipo = 'texto',
  ordenActivo,
  onOrdenar,
  filtro,
  onFiltrar,
}: {
  label: string;
  align?: 'left' | 'right';
  tipo?: 'texto' | 'numero';
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', alClickFuera);
    return () => document.removeEventListener('mousedown', alClickFuera);
  }, []);

  const filtroActivo = tipo === 'texto' ? !!filtro?.texto : !!filtro?.valor;

  function aplicar() {
    if (tipo === 'texto') {
      onFiltrar(texto.trim() ? { texto: texto.trim() } : undefined);
    } else {
      onFiltrar(valor.trim() ? { operador, valor: valor.trim() } : undefined);
    }
    setAbierto(false);
  }

  function limpiar() {
    setTexto('');
    setValor('');
    onFiltrar(undefined);
    setAbierto(false);
  }

  const IconoOrden = ordenActivo === 'asc' ? ArrowUp : ordenActivo === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <th className={`relative px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div ref={ref} className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <button
          onClick={() => onOrdenar(ordenActivo === 'asc' ? 'desc' : ordenActivo === 'desc' ? null : 'asc')}
          className="flex items-center gap-1 hover:text-primary"
        >
          {label}
          <IconoOrden size={11} className={ordenActivo ? 'text-primary' : 'opacity-50'} />
        </button>
        <button onClick={() => setAbierto((v) => !v)} className={filtroActivo ? 'text-primary' : 'text-ink-muted opacity-60 hover:opacity-100'}>
          <Filter size={11} />
        </button>
      </div>

      {abierto && (
        <div
          className={`absolute top-full z-30 mt-1 w-56 rounded-lg border border-border bg-surface p-3 text-left normal-case tracking-normal text-ink shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
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
        </div>
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
