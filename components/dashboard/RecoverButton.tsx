'use client';

import { useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { recuperarDePapelera } from '@/app/dashboard/actions';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

export function RecoverButton({ id }: { id: string }) {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => recuperarDePapelera(id))}
      className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-dark transition hover:bg-primary/20 disabled:opacity-60"
    >
      <RotateCcw size={14} />
      {t('papelera.recuperar')}
    </button>
  );
}
