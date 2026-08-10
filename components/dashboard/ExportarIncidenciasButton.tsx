'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { exportarIncidencias } from '@/app/dashboard/incidencias/actions';
import { mensajeError } from '@/lib/utils';

export function ExportarIncidenciasButton() {
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function exportar() {
    setError(null);
    startTransition(async () => {
      try {
        const filas = await exportarIncidencias({
          estado: searchParams.get('estado') ?? undefined,
          centro: searchParams.get('centro') ?? undefined,
          motivo: searchParams.get('motivo') ?? undefined,
          ciudad: searchParams.get('ciudad') ?? undefined,
          gestor: searchParams.get('gestor') ?? undefined,
          desde: searchParams.get('desde') ?? undefined,
          hasta: searchParams.get('hasta') ?? undefined,
          q: searchParams.get('q') ?? undefined,
        });
        if (filas.length === 0) {
          setError('No hay filas que exportar con estos filtros');
          return;
        }
        const XLSX = await import('xlsx');
        const hoja = XLSX.utils.json_to_sheet(
          filas.map((f) => ({
            Fecha: f.fecha,
            Rider: f.rider,
            DNI: f.dni,
            Centro: f.centro,
            Motivo: f.motivo,
            'Código de pedido': f.codigoPedido ?? '',
            Observaciones: f.observaciones ?? '',
            Estado: f.estado,
            'Motivo del rechazo': f.motivoRechazo ?? '',
            Gestor: f.gestor ?? '',
          }))
        );
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Incidencias');
        XLSX.writeFile(libro, 'incidencias.xlsx');
      } catch (e) {
        setError(mensajeError(e));
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={exportar}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-ink-muted hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Exportar a Excel
      </button>
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}
