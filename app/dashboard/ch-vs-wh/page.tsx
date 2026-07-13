import { ChVsWhPanel } from '@/components/overtime/ChVsWhPanel';

export default function ChVsWhPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">CH vs WH</h1>
        <p className="text-sm text-ink-muted">
          Horas contratadas (CH) vs. horas trabajadas (WH) por rider y semana.
        </p>
      </div>
      <ChVsWhPanel />
    </div>
  );
}
