import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatFecha } from '@/lib/utils';

const PAGE_SIZE = 30;

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const supabase = createClient();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: eventos, count } = await supabase
    .from('auditoria')
    .select('id, accion, detalles, created_at, admins(usuario)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Auditoría</h1>
        <p className="text-sm text-ink-muted">Registro de quién aprobó, rechazó, editó o creó cada cosa.</p>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        {!eventos || eventos.length === 0 ? (
          <EmptyState title="Todavía no hay actividad registrada" />
        ) : (
          <table className="w-full min-w-[700px] text-sm">
            <thead className="border-b border-border bg-bg/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Detalles</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {(e.admins as unknown as { usuario: string } | null)?.usuario ?? '—'}
                  </td>
                  <td className="px-4 py-3">{e.accion}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{e.detalles}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{formatFecha(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(count ?? 0) > PAGE_SIZE && (
        <p className="text-center text-xs text-ink-muted">
          Mostrando los {PAGE_SIZE} más recientes de {count}.
        </p>
      )}
    </div>
  );
}
