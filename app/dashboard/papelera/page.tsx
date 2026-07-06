import { createClient } from '@/lib/supabase/server';
import { RecoverButton } from '@/components/dashboard/RecoverButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatFecha } from '@/lib/utils';

export default async function PapeleraPage() {
  const supabase = createClient();

  const { data: incidencias } = await supabase
    .from('incidencias')
    .select('*, motivos(nombre), eliminado_por_id, admins:eliminado_por_id(usuario)')
    .eq('estado', 'papelera')
    .order('fecha_eliminacion', { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Papelera</h1>
        <p className="text-sm text-ink-muted">
          Incidencias eliminadas. Se conservan aquí (nada se borra de verdad) y se pueden recuperar.
        </p>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!incidencias || incidencias.length === 0 ? (
          <EmptyState title="La papelera está vacía" />
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Eliminado por</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidencias.map((i: any) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{i.nombre_rider}</div>
                    <div className="text-xs text-ink-muted">{i.dni}</div>
                  </td>
                  <td className="px-4 py-3">{i.motivos?.nombre ?? '—'}</td>
                  <td className="px-4 py-3">{i.admins?.usuario ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{formatFecha(i.fecha_eliminacion)}</td>
                  <td className="px-4 py-3 text-right">
                    <RecoverButton id={i.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
