'use client';

import { useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { recuperarDePapelera } from '@/app/dashboard/actions';
import { recuperarAusenciaDePapelera } from '@/app/dashboard/ausencias/actions';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/** La papelera mezcla incidencias y ausencias, así que hay que saber a cuál devolver cada fila. */
export function RecoverButton({ id, tipo = 'incidencia' }: { id: string; tipo?: 'incidencia' | 'ausencia' }) {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => (tipo === 'ausencia' ? recuperarAusenciaDePapelera(id) : recuperarDePapelera(id)))}
      className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-dark transition hover:bg-primary/20 disabled:opacity-60"
    >
      <RotateCcw size={14} />
      {t('papelera.recuperar')}
    </button>
  );
}
