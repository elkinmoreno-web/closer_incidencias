'use client';

import { useTransition } from 'react';

export function ToggleSwitch({
  activo,
  onToggle,
}: {
  activo: boolean;
  onToggle: (nuevoValor: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      role="switch"
      aria-checked={activo}
      disabled={pending}
      onClick={() => startTransition(() => onToggle(!activo))}
      className={`h-6 w-11 rounded-full transition disabled:opacity-60 ${activo ? 'bg-primary' : 'bg-border'}`}
    >
      <span
        className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition ${
          activo ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}
