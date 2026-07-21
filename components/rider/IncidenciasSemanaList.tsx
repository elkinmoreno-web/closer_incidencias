'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { estadoIncidenciaColor, formatFecha, nombreLocalizado } from '@/lib/utils';
import { VerProtocoloLink } from '@/components/rider/VerProtocoloLink';

interface IncidenciaResumen {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'papelera';
  created_at: string;
  codigo_pedido: string | null;
  motivo_rechazo: string | null;
  motivos: { nombre: string; nombre_en: string | null; instrucciones_aprobacion: string | null } | null;
}

export function IncidenciasSemanaList({ incidencias }: { incidencias: IncidenciaResumen[] }) {
  const t = useTranslations('IncidenciasSemanaList');
  const tEstado = useTranslations('Estados');
  const locale = useLocale();

  if (incidencias.length === 0) {
    return <p className="py-4 text-center text-xs text-ink-muted">{t('vacio')}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {incidencias.map((i) => (
        <li key={i.id} className="flex flex-col gap-1 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-ink">
              {i.motivos ? nombreLocalizado(i.motivos.nombre, i.motivos.nombre_en, locale) : t('sinMotivo')}
              {i.codigo_pedido && <span className="ml-2 text-xs text-ink-muted">· {t('pedido', { codigo: i.codigo_pedido })}</span>}
            </div>
            <div className="flex items-center gap-2">
              {i.estado === 'aprobada' && i.motivos?.instrucciones_aprobacion && (
                <VerProtocoloLink motivo={nombreLocalizado(i.motivos.nombre, i.motivos.nombre_en, locale)} instrucciones={i.motivos.instrucciones_aprobacion} />
              )}
              <Badge className={estadoIncidenciaColor(i.estado)}>{tEstado(i.estado)}</Badge>
            </div>
          </div>
          <div className="text-xs text-ink-muted">{formatFecha(i.created_at)}</div>
          {i.estado === 'rechazada' && i.motivo_rechazo && (
            <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">{t('motivoRechazo', { motivo: i.motivo_rechazo })}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
