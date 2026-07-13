'use client';

import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export type Direccion = 'asc' | 'desc';

export function SortableTh<K extends string>({
  campo,
  activo,
  direccion,
  onClick,
  children,
  align,
}: {
  campo: K;
  activo: K | null;
  direccion: Direccion;
  onClick: (campo: K) => void;
  children: React.ReactNode;
  align?: 'center' | 'left';
}) {
  const esActivo = activo === campo;
  return (
    <th
      onClick={() => onClick(campo)}
      className={`cursor-pointer select-none px-3 py-2 ${align === 'center' ? 'text-center' : 'text-left'} ${esActivo ? 'text-primary' : ''} hover:text-ink`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {esActivo ? direccion === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );
}
