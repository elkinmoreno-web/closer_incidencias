'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { exportarAusencias } from '@/app/dashboard/ausencias/actions';
import { mensajeError } from '@/lib/utils';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

export function ExportarAusenciasButton() {
  const { t } = useIdioma();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function exportar() {
    setError(null);
    startTransition(async () => {
      try {
        const filas = await exportarAusencias({
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
          setError(t('exportar.sinFilas'));
          return;
        }
        const XLSX = await import('xlsx');
        const hoja = XLSX.utils.json_to_sheet(
          filas.map((f) => ({
            [t('exportar.colCreado')]: f.creado,
            [t('exportar.colRango')]: f.rango,
            [t('exportar.colRider')]: f.rider,
            [t('exportar.colDni')]: f.dni,
            [t('exportar.colCentro')]: f.centro,
            [t('exportar.colMotivo')]: f.motivo,
            [t('exportar.colComentario')]: f.comentario ?? '',
            [t('exportar.colEstado')]: f.estado,
            [t('exportar.colMotivoRechazo')]: f.motivoRechazo ?? '',
            [t('exportar.colRevisadoPor')]: f.revisadoPor ?? '',
          }))
        );
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Ausencias');
        XLSX.writeFile(libro, 'ausencias.xlsx');
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
        {t('exportar.aExcel')}
      </button>
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}
