import { MetricasAdminPanel } from '@/components/metricas/MetricasAdminPanel';

export default function MetricasPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Métricas operativas</h1>
        <p className="text-sm text-ink-muted">
          Conexión, aceptación, cancelación y viajes por rider. Se actualiza sola cada día; si falla, puedes subir el
          archivo a mano.
        </p>
      </div>
      <MetricasAdminPanel />
    </div>
  );
}
