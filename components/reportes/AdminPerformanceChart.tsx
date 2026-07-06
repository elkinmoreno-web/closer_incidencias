'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Fila {
  usuario: string;
  aprobadas: number;
  rechazadas: number;
}

export function AdminPerformanceChart({ data }: { data: Fila[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">Todavía no hay incidencias gestionadas.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E1E8EB" />
        <XAxis dataKey="usuario" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="aprobadas" name="Aprobadas" fill="#7BB4B8" radius={[6, 6, 0, 0]} />
        <Bar dataKey="rechazadas" name="Rechazadas" fill="#E74C3C" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
