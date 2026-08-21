'use client';

import { useRef, useState, useTransition } from 'react';
import { publicarAnuncio, desactivarAnuncio } from '@/app/dashboard/configuracion/actions';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import type { ClaveTraduccion } from '@/lib/i18n/dictionaries/es';

type Audiencia = 'todos' | 'admins' | 'riders';

interface AnuncioActivo {
  id: number;
  mensaje: string;
  ciudadNombre: string | null; // null = global
  audiencia: Audiencia;
}

function claveEtiquetaAudiencia(a: Audiencia): ClaveTraduccion | null {
  if (a === 'admins') return 'anuncio.soloAdmins';
  if (a === 'riders') return 'anuncio.soloRiders';
  return null; // "todos" no necesita etiqueta, es el caso normal
}

export function AnuncioForm({
  anunciosActivos,
  ciudadesAsignables,
  esSuperAdmin,
}: {
  anunciosActivos: AnuncioActivo[];
  ciudadesAsignables: { id: number; nombre: string }[];
  esSuperAdmin: boolean;
}) {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ciudadId, setCiudadId] = useState<string>(esSuperAdmin ? '' : String(ciudadesAsignables[0]?.id ?? ''));
  const [audiencia, setAudiencia] = useState<Audiencia>('todos');
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      {anunciosActivos.length > 0 && (
        <div className="space-y-2">
          {anunciosActivos.map((a) => {
            const claveAud = claveEtiquetaAudiencia(a.audiencia);
            return (
              <div key={a.id} className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span>
                  📣 <span className="mr-1.5 rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-semibold">{a.ciudadNombre ?? t('anuncio.global')}</span>
                  {claveAud && <span className="mr-1.5 rounded-full bg-amber-300/60 px-2 py-0.5 text-xs font-semibold">{t(claveAud)}</span>}
                  {a.mensaje}
                </span>
                <button
                  disabled={pending}
                  onClick={() => startTransition(() => desactivarAnuncio(a.id))}
                  className="ml-3 shrink-0 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                >
                  {t('anuncio.quitar')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const mensaje = new FormData(e.currentTarget).get('mensaje') as string;
          if (!mensaje?.trim()) {
            setError(t('anuncio.escribeMensaje'));
            return;
          }
          setError(null);
          const ciudadIdFinal = ciudadId === '' ? null : Number(ciudadId);
          startTransition(async () => {
            try {
              await publicarAnuncio(mensaje, ciudadIdFinal, audiencia);
              formRef.current?.reset();
            } catch (e2) {
              setError((e2 as Error).message);
            }
          });
        }}
        className="flex flex-wrap gap-2"
      >
        <select
          value={ciudadId}
          onChange={(e) => setCiudadId(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {esSuperAdmin && <option value="">{t('anuncio.globalTodasCiudades')}</option>}
          {ciudadesAsignables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={audiencia}
          onChange={(e) => setAudiencia(e.target.value as Audiencia)}
          title={t('anuncio.quienVeAnuncio')}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="todos">{t('anuncio.paraTodos')}</option>
          <option value="admins">{t('anuncio.soloAdmins')}</option>
          <option value="riders">{t('anuncio.soloRiders')}</option>
        </select>
        <input
          name="mensaje"
          placeholder={t('anuncio.mensajePlaceholder')}
          className="min-w-[200px] flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {t('anuncio.publicar')}
        </button>
      </form>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
