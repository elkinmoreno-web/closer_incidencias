'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

interface Fila {
  usuario: string;
  aprobadas: number;
  rechazadas: number;
}

export function AdminPerformanceChart({ data }: { data: Fila[] }) {
  const { t } = useIdioma();
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">{t('reportes.sinIncidenciasGestionadas')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E1E8EB" />
        <XAxis dataKey="usuario" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="aprobadas" name={t('reportes.colAprobadas')} fill="#7BB4B8" radius={[6, 6, 0, 0]} />
        <Bar dataKey="rechazadas" name={t('reportes.colRechazadas')} fill="#E74C3C" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
