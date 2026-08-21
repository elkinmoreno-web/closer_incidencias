'use client';

import { Badge } from '@/components/ui/Badge';
import { estadoIncidenciaColor, estadoIncidenciaLabel, formatFecha } from '@/lib/utils';
import { VerProtocoloLink } from '@/components/rider/VerProtocoloLink';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

interface IncidenciaResumen {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'papelera';
  created_at: string;
  codigo_pedido: string | null;
  motivo_rechazo: string | null;
  motivos: { nombre: string; nombre_en: string | null; instrucciones_aprobacion: string | null; instrucciones_aprobacion_en: string | null } | null;
}

export function IncidenciasSemanaList({ incidencias }: { incidencias: IncidenciaResumen[] }) {
  const { t, idioma } = useIdioma();

  if (incidencias.length === 0) {
    return <p className="py-4 text-center text-xs text-ink-muted">{t('riderPage.sinIncidenciasSemana')}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {incidencias.map((i) => {
        const nombreMotivo = i.motivos ? nombreSegunIdioma(idioma, i.motivos.nombre, i.motivos.nombre_en) : t('riderPage.sinMotivo');
        const instrucciones = i.motivos
          ? nombreSegunIdioma(idioma, i.motivos.instrucciones_aprobacion ?? '', i.motivos.instrucciones_aprobacion_en)
          : '';
        return (
          <li key={i.id} className="flex flex-col gap-1 py-2.5 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-ink">
                {nombreMotivo}
                {i.codigo_pedido && (
                  <span className="ml-2 text-xs text-ink-muted">
                    · {t('riderPage.pedido')} {i.codigo_pedido}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {i.estado === 'aprobada' && instrucciones && <VerProtocoloLink motivo={nombreMotivo} instrucciones={instrucciones} />}
                <Badge className={estadoIncidenciaColor(i.estado)}>{estadoIncidenciaLabel(i.estado, idioma)}</Badge>
              </div>
            </div>
            <div className="text-xs text-ink-muted">{formatFecha(i.created_at)}</div>
            {i.estado === 'rechazada' && i.motivo_rechazo && (
              <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
                {t('riderPage.motivoRechazo')}: {i.motivo_rechazo}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
