'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORES = ['#7BB4B8', '#5F9599', '#D39E00', '#E74C3C', '#64748B', '#2E9E6B', '#9CA3AF'];

export function MotivosChart({ data }: { data: { nombre: string; total: number }[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">No hay datos suficientes todavía.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="nombre" outerRadius={100} label={({ nombre }) => nombre}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={COLORES[idx % COLORES.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
