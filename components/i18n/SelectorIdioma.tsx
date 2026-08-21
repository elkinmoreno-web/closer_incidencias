'use client';

import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { cambiarIdiomaManual } from '@/lib/i18n/actions';
import { useIdioma } from './IdiomaProvider';

/**
 * Botón de cambio manual de idioma — el idioma por defecto ya se
 * calcula automáticamente según el país del centro de cada persona;
 * esto es solo para el caso puntual de querer ver el otro idioma sin
 * que eso cambie el país registrado de nadie.
 */
export function SelectorIdioma() {
  const { idioma } = useIdioma();
  const [pending, startTransition] = useTransition();

  function cambiar() {
    const nuevo = idioma === 'es' ? 'en' : 'es';
    startTransition(() => {
      cambiarIdiomaManual(nuevo);
    });
  }

  return (
    <button
      onClick={cambiar}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-60"
      title={idioma === 'es' ? 'Switch to English' : 'Cambiar a Español'}
    >
      <Languages size={14} />
      {idioma === 'es' ? 'EN' : 'ES'}
    </button>
  );
}
