import { OvertimePanel } from '@/components/overtime/OvertimePanel';

export default function OvertimePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Horas extra</h1>
        <p className="text-sm text-ink-muted">Consulta y audita las horas extra reportadas por semana y centro.</p>
      </div>
      <OvertimePanel />
    </div>
  );
}
