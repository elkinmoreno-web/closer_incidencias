'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { crearTicket, type ReportarState } from '@/app/dashboard/reportar/actions';

const TIPOS = [
  { valor: 'error', etiqueta: 'Error en el panel' },
  { valor: 'acceso', etiqueta: 'Problema de acceso o permisos' },
  { valor: 'sugerencia', etiqueta: 'Sugerencia de mejora' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const CAMPO = 'rounded-xl border-2 border-border px-4 py-3 text-sm focus:border-primary focus:outline-none';

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-primary py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
    >
      {pending ? 'Enviando…' : 'Enviar reporte'}
    </button>
  );
}

export function ReportarIncidenciaForm() {
  const [state, formAction] = useFormState<ReportarState, FormData>(crearTicket, undefined);
  // La página desde la que se venía, para que soporte sepa dónde mirar. Se
  // lee en el navegador porque es la URL anterior, no la de este formulario.
  const [pagina, setPagina] = useState('');
  useEffect(() => {
    if (document.referrer && document.referrer.startsWith(window.location.origin)) {
      setPagina(new URL(document.referrer).pathname + new URL(document.referrer).search);
    }
  }, []);

  if (state && 'success' in state) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
          Ticket #{state.id} enviado. El equipo de soporte te responderá a tu correo.
        </div>
        {!state.correoEnviado && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            El reporte se ha guardado, pero el correo no ha salido. Avisa a soporte del ticket #{state.id}.
          </div>
        )}
        <button onClick={() => window.location.reload()} className="self-start text-sm font-semibold text-primary underline">
          Reportar otra
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="pagina" value={pagina} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Tipo *</label>
        <select name="tipo" required defaultValue="" className={CAMPO}>
          <option value="" disabled>
            Selecciona el tipo
          </option>
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Asunto *</label>
        <input name="asunto" required minLength={3} maxLength={150} placeholder="Ej: No carga la exportación de incidencias" className={CAMPO} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-ink-muted">Descripción *</label>
        <textarea
          name="descripcion"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          placeholder="Qué estabas haciendo, qué esperabas que pasara y qué ha pasado. Si hay un mensaje de error, cópialo."
          className={CAMPO}
        />
      </div>

      {pagina && <p className="text-xs text-ink-muted">Se adjuntará la página desde la que vienes: {pagina}</p>}

      {state && 'error' in state && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{state.error}</p>}

      <Enviar />
    </form>
  );
}
