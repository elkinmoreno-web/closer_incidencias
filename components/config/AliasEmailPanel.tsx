'use client';

import { useFormState } from 'react-dom';
import { useState, useTransition } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { BuscadorRiderRemoto } from '@/components/shared/BuscadorRiderRemoto';
import { crearAliasEmail, eliminarAliasEmail, type AliasEmail, type AliasActionState } from '@/app/dashboard/configuracion/alias-email-actions';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Solo para casos donde el email que reporta Uber NO tiene ninguna
 * relación de texto con el que el rider tiene guardado en su ficha
 * (ej. cuenta personal distinta a la que usa para trabajar) — casos
 * como "nombre+driver@gmail.com" se resuelven solos automáticamente y
 * no necesitan que nadie los registre aquí.
 */
export function AliasEmailPanel({ aliasIniciales }: { aliasIniciales: AliasEmail[] }) {
  const { t } = useIdioma();
  const [lista, setLista] = useState(aliasIniciales);
  const [state, formAction] = useFormState<AliasActionState, FormData>(crearAliasEmail, undefined);
  const [pendingDelete, startDelete] = useTransition();
  const [abierto, setAbierto] = useState(false);

  function borrar(id: number) {
    startDelete(async () => {
      const r = await eliminarAliasEmail(id);
      if (!r.error) setLista((prev) => prev.filter((a) => a.id !== id));
    });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">{t('aliasEmail.titulo')}</h3>
          <p className="text-xs text-ink-muted">{t('aliasEmail.descripcion')}</p>
        </div>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
        >
          <Plus size={14} />
          {t('aliasEmail.anadir')}
        </button>
      </div>

      {abierto && (
        <form
          action={(fd) => {
            formAction(fd);
          }}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-bg p-3"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('aliasEmail.emailQueReportaUber')}</label>
            <input
              name="emailUber"
              type="email"
              required
              placeholder="ej. muhammedhassan062@gmail.com"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('aliasEmail.riderReal')}</label>
            <BuscadorRiderRemoto nombreCampo="riderDni" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('aliasEmail.notaOpcional')}</label>
            <input name="nota" placeholder={t('aliasEmail.notaPlaceholder')} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          {state?.error && <p className="text-xs font-medium text-danger">{state.error}</p>}
          {state?.success && <p className="text-xs font-medium text-emerald-700">{t('aliasEmail.guardadoRecarga')}</p>}
          <button type="submit" className="mt-1 self-end rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark">
            {t('aliasEmail.guardar')}
          </button>
        </form>
      )}

      {lista.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">{t('aliasEmail.sinAlias')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {lista.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
              <div>
                <div className="text-ink">
                  <span className="font-mono">{a.email_uber}</span> → <span className="font-semibold">{a.rider_nombre}</span> ({a.rider_dni})
                </div>
                {a.nota && <div className="mt-0.5 text-ink-muted">{a.nota}</div>}
              </div>
              <button disabled={pendingDelete} onClick={() => borrar(a.id)} className="text-danger hover:text-red-700" title={t('aliasEmail.eliminar')}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
