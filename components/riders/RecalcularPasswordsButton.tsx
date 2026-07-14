'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { recalcularTodasLasPasswords } from '@/app/dashboard/riders/actions';

export function RecalcularPasswordsButton() {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function ejecutar() {
    if (!confirm('Esto va a recalcular la contraseña de TODOS los riders con el esquema actual. ¿Seguro que quieres continuar?')) return;
    startTransition(async () => {
      const res = await recalcularTodasLasPasswords();
      if (!res.ok) {
        setMensaje(res.errores[0] ?? 'No se pudo completar');
      } else {
        setMensaje(`${res.actualizados} contraseña(s) actualizadas${res.errores.length > 0 ? ` · ${res.errores.length} con error` : ''}`);
      }
      setTimeout(() => setMensaje(null), 10000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={ejecutar}
        disabled={pending}
        title="Recalcula la contraseña de todos los riders con el esquema actual (inicial+apellido+123456)"
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
        Recalcular todas las contraseñas
      </button>
      {mensaje && <span className="text-xs text-ink-muted">{mensaje}</span>}
    </div>
  );
}
