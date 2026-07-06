import { Badge } from '@/components/ui/Badge';
import { estadoIncidenciaColor, estadoIncidenciaLabel, formatFecha } from '@/lib/utils';

interface IncidenciaResumen {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'papelera';
  created_at: string;
  codigo_pedido: string | null;
  motivo_rechazo: string | null;
  motivos: { nombre: string } | null;
}

export function IncidenciasSemanaList({ incidencias }: { incidencias: IncidenciaResumen[] }) {
  if (incidencias.length === 0) {
    return <p className="py-4 text-center text-xs text-ink-muted">No has reportado incidencias esta semana.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {incidencias.map((i) => (
        <li key={i.id} className="flex flex-col gap-1 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-ink">
              {i.motivos?.nombre ?? 'Sin motivo'}
              {i.codigo_pedido && <span className="ml-2 text-xs text-ink-muted">· Pedido {i.codigo_pedido}</span>}
            </div>
            <Badge className={estadoIncidenciaColor(i.estado)}>{estadoIncidenciaLabel(i.estado)}</Badge>
          </div>
          <div className="text-xs text-ink-muted">{formatFecha(i.created_at)}</div>
          {i.estado === 'rechazada' && i.motivo_rechazo && (
            <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">Motivo del rechazo: {i.motivo_rechazo}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
