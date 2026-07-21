'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { cambiarIdioma } from '@/app/actions/idioma';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cambiar(nuevo: 'es' | 'en') {
    if (nuevo === locale) return;
    startTransition(async () => {
      await cambiarIdioma(nuevo);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 text-xs">
      <button
        onClick={() => cambiar('es')}
        disabled={pending}
        className={`rounded-full px-2.5 py-1 font-semibold transition ${locale === 'es' ? 'bg-primary text-white' : 'text-ink-muted'}`}
      >
        ES
      </button>
      <button
        onClick={() => cambiar('en')}
        disabled={pending}
        className={`rounded-full px-2.5 py-1 font-semibold transition ${locale === 'en' ? 'bg-primary text-white' : 'text-ink-muted'}`}
      >
        EN
      </button>
    </div>
  );
}
