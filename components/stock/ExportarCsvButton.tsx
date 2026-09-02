'use client';

import { useState, useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { mensajeError } from '@/lib/utils';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Exporta a CSV cualquier tabla del módulo de Stock, a partir de los
 * datos YA FILTRADOS que el usuario está viendo en pantalla (no
 * vuelve a consultar el servidor) — así el CSV coincide exactamente
 * con lo que se ve, filtros de columna incluidos.
 */
export function ExportarCsvButton<T extends Record<string, unknown>>({ filas, nombreArchivo }: { filas: T[]; nombreArchivo: string }) {
  const { t } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function exportar() {
    setError(null);
    startTransition(async () => {
      try {
        if (filas.length === 0) {
          setError(t('exportar.sinFilas'));
          return;
        }
        const XLSX = await import('xlsx');
        const hoja = XLSX.utils.json_to_sheet(filas);
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
        XLSX.writeFile(libro, `${nombreArchivo}.csv`, { bookType: 'csv' });
      } catch (e) {
        setError(mensajeError(e));
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={exportar}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {t('exportar.botonCsv')}
      </button>
      {error && <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
