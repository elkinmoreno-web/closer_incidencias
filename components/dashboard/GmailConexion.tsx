'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Mail, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { desconectarMiGmail } from '@/app/dashboard/reclamaciones/actions';
import type { EstadoGmail } from '@/lib/gmailPropio';

/**
 * "Conectar mi Gmail": para que los avisos a gestores salgan desde la
 * cuenta de quien los escribe (ver lib/gmailPropio.ts).
 *
 * El enlace abre en pestaña nueva a propósito: Google no se deja cargar
 * dentro de un iframe, y el panel también se usa incrustado.
 */
export function GmailConexion({ estado }: { estado: EstadoGmail | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const resultado = searchParams.get('gmail');
  const motivo = searchParams.get('motivo');

  function cerrarAviso() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete('gmail');
    p.delete('motivo');
    router.replace(p.size ? `${pathname}?${p}` : pathname);
  }

  function desconectar() {
    if (!confirm('¿Desconectar tu Gmail? Los avisos volverán a salir desde la cuenta del CRM.')) return;
    startTransition(async () => {
      const r = await desconectarMiGmail();
      if ('error' in r) setError(r.error);
      else router.refresh();
    });
  }

  const boton = 'flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition';

  return (
    <div className="flex flex-col items-end gap-1.5">
      {!estado ? (
        <a
          href="/api/gmail/conectar"
          target="_blank"
          rel="noopener"
          title="Para que los avisos a gestores salgan desde tu cuenta y queden en tus Enviados"
          className={`${boton} border-border bg-surface text-ink hover:bg-bg`}
        >
          <Mail size={14} /> Conectar mi Gmail
        </a>
      ) : estado.caducado ? (
        <a href="/api/gmail/conectar" target="_blank" rel="noopener" className={`${boton} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
          <AlertTriangle size={14} /> Reconectar Gmail
        </a>
      ) : (
        <div className={`${boton} border-emerald-200 bg-emerald-50 text-emerald-800`}>
          <CheckCircle2 size={14} />
          <span title="Los avisos a gestores salen desde esta cuenta">{estado.email}</span>
          <button onClick={desconectar} disabled={pending} className="ml-1 underline-offset-2 hover:underline disabled:opacity-50">
            {pending ? <Loader2 size={12} className="animate-spin" /> : 'Desconectar'}
          </button>
        </div>
      )}

      {resultado && (
        <div
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
            resultado === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-danger'
          }`}
        >
          <span>{resultado === 'ok' ? 'Gmail conectado. Tus avisos saldrán desde tu cuenta.' : motivo ?? 'No se pudo conectar.'}</span>
          <button onClick={cerrarAviso} aria-label="Cerrar">
            <X size={12} />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
