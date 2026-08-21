'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { recalcularTodasLasPasswords } from '@/app/dashboard/riders/actions';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

export function RecalcularPasswordsButton() {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function ejecutar() {
    if (!confirm(t('recalcPass.confirmar'))) return;
    startTransition(async () => {
      const res = await recalcularTodasLasPasswords();
      if (!res.ok) {
        setMensaje(res.errores[0] ?? t('recalcPass.noCompletado'));
      } else {
        setMensaje(`${res.actualizados} ${t('recalcPass.actualizadas')}${res.errores.length > 0 ? ` · ${res.errores.length} ${t('recalcPass.conError')}` : ''}`);
      }
      setTimeout(() => setMensaje(null), 10000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={ejecutar}
        disabled={pending}
        title={t('recalcPass.title')}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
        {t('recalcPass.boton')}
      </button>
      {mensaje && <span className="text-xs text-ink-muted">{mensaje}</span>}
    </div>
  );
}
