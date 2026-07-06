'use client';

import { useRef, useState, useTransition } from 'react';
import { publicarAnuncio, desactivarAnuncio } from '@/app/dashboard/configuracion/actions';

export function AnuncioForm({ anuncioActivo }: { anuncioActivo: { id: number; mensaje: string } | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      {anuncioActivo && (
        <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>📣 {anuncioActivo.mensaje}</span>
          <button
            disabled={pending}
            onClick={() => startTransition(() => desactivarAnuncio(anuncioActivo.id))}
            className="ml-3 shrink-0 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
          >
            Quitar
          </button>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const mensaje = new FormData(e.currentTarget).get('mensaje') as string;
          if (!mensaje?.trim()) {
            setError('Escribe un mensaje');
            return;
          }
          setError(null);
          startTransition(async () => {
            await publicarAnuncio(mensaje);
            formRef.current?.reset();
          });
        }}
        className="flex gap-2"
      >
        <input
          name="mensaje"
          placeholder="Ej: Mañana el hub de Madrid abre 1h más tarde"
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          Publicar
        </button>
      </form>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
