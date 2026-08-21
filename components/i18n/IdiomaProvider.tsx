'use client';

import { createContext, useContext } from 'react';
import { crearTraductor, type Traductor } from '@/lib/i18n/traducir';
import type { Idioma } from '@/lib/i18n/resolverIdioma';

const IdiomaContext = createContext<{ idioma: Idioma; t: Traductor } | null>(null);

/**
 * Envuelve una sección del árbol de Client Components con el idioma ya
 * resuelto en el servidor — nunca se vuelve a calcular en el navegador
 * (evita depender de cookies/base de datos desde el cliente).
 */
export function IdiomaProvider({ idioma, children }: { idioma: Idioma; children: React.ReactNode }) {
  const t = crearTraductor(idioma);
  return <IdiomaContext.Provider value={{ idioma, t }}>{children}</IdiomaContext.Provider>;
}

/** Hook para usar dentro de cualquier Client Component hijo de IdiomaProvider. */
export function useIdioma() {
  const ctx = useContext(IdiomaContext);
  if (!ctx) throw new Error('useIdioma debe usarse dentro de <IdiomaProvider>');
  return ctx;
}
