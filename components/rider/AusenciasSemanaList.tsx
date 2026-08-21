'use client';

import { Badge } from '@/components/ui/Badge';
import { estadoAusenciaColor, estadoAusenciaLabel, formatFechaCorta } from '@/lib/utils';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

interface AusenciaResumen {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'revisada';
  fecha_inicio: string;
  fecha_fin: string;
  motivo_rechazo: string | null;
  motivos_ausencia: { nombre: string; nombre_en: string | null } | null;
}

export function AusenciasSemanaList({ ausencias }: { ausencias: AusenciaResumen[] }) {
  const { t, idioma } = useIdioma();

  if (ausencias.length === 0) {
    return <p className="py-4 text-center text-xs text-ink-muted">{t('riderPage.sinAusenciasSemana')}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {ausencias.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-ink">
              {a.motivos_ausencia ? nombreSegunIdioma(idioma, a.motivos_ausencia.nombre, a.motivos_ausencia.nombre_en) : t('riderPage.sinMotivo')}
            </div>
            <Badge className={estadoAusenciaColor(a.estado)}>{estadoAusenciaLabel(a.estado, idioma)}</Badge>
          </div>
          <div className="text-xs text-ink-muted">
            {formatFechaCorta(a.fecha_inicio)} → {formatFechaCorta(a.fecha_fin)}
          </div>
          {a.estado === 'rechazada' && a.motivo_rechazo && (
            <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
              {t('riderPage.motivoRechazo')}: {a.motivo_rechazo}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
