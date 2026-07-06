export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-card border p-5 ${
        accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface'
      }`}
    >
      <div className="text-sm font-medium text-ink-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}
