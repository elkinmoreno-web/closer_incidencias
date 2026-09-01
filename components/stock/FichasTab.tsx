'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { StockFicha } from '@/lib/types';
import { ThFiltro, cumpleFiltroTexto, type DireccionOrden, type FiltroColumna } from '@/components/stock/ThFiltro';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { formatFecha } from '@/lib/utils';
import { urlArchivoDrive } from '@/lib/driveUrl';

type FichaConNombres = StockFicha & { centro_nombre: string; admin_usuario: string | null };

export function FichasTab({ fichas }: { fichas: FichaConNombres[] }) {
  const { t } = useIdioma();

  const [filtrosFichas, setFiltrosFichas] = useState<Record<string, FiltroColumna>>({});
  const [ordenFichas, setOrdenFichas] = useState<{ campo: string; dir: DireccionOrden } | null>(null);
  function ordenarFichasPor(campo: string, dir: DireccionOrden) {
    setOrdenFichas(dir ? { campo, dir } : null);
  }
  function filtrarFichasPor(campo: string, f: FiltroColumna | undefined) {
    setFiltrosFichas((prev) => {
      const next = { ...prev };
      if (f) next[campo] = f;
      else delete next[campo];
      return next;
    });
  }

  const fichasFiltradas = useMemo(() => {
    let filas = fichas.filter((f) => {
      if (!cumpleFiltroTexto(f.rider_nombre, filtrosFichas.rider)) return false;
      if (!cumpleFiltroTexto(f.centro_nombre, filtrosFichas.centro)) return false;
      if (!cumpleFiltroTexto(f.estado, filtrosFichas.estado)) return false;
      if (!cumpleFiltroTexto(f.admin_usuario ?? '', filtrosFichas.registradaPor)) return false;
      return true;
    });
    if (ordenFichas) {
      const signo = ordenFichas.dir === 'asc' ? 1 : -1;
      filas = [...filas].sort((a, b) => {
        const campo = ordenFichas.campo;
        const va = (a as any)[campo] ?? '';
        const vb = (b as any)[campo] ?? '';
        if (typeof va === 'string') return va.localeCompare(vb) * signo;
        return (va - vb) * signo;
      });
    }
    return filas;
  }, [fichas, filtrosFichas, ordenFichas]);

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h2 className="mb-3 font-semibold text-ink">{t('stockFichas.titulo')}</h2>
      {fichas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t('stockFichas.sinFichas')}</p>
      ) : fichasFiltradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t('stock.sinCoincidencias')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">{t('stockFichas.colFecha')}</th>
                <ThFiltro label={t('stockFichas.colRider')} ordenActivo={ordenFichas?.campo === 'rider_nombre' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('rider_nombre', d)} filtro={filtrosFichas.rider} onFiltrar={(f) => filtrarFichasPor('rider', f)} />
                <ThFiltro label={t('stockFichas.colCentro')} ordenActivo={ordenFichas?.campo === 'centro_nombre' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('centro_nombre', d)} filtro={filtrosFichas.centro} onFiltrar={(f) => filtrarFichasPor('centro', f)} />
                <ThFiltro label={t('stockFichas.colEstado')} ordenActivo={ordenFichas?.campo === 'estado' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('estado', d)} filtro={filtrosFichas.estado} onFiltrar={(f) => filtrarFichasPor('estado', f)} />
                <th className="px-3 py-2">{t('stockFichas.colMateriales')}</th>
                <ThFiltro label={t('stockFichas.colRegistradaPor')} ordenActivo={ordenFichas?.campo === 'admin_usuario' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('admin_usuario', d)} filtro={filtrosFichas.registradaPor} onFiltrar={(f) => filtrarFichasPor('registradaPor', f)} />
                <th className="px-3 py-2">{t('stockFichas.colPdf')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fichasFiltradas.map((f) => {
                const url = urlArchivoDrive(f.pdf_url);
                return (
                  <tr key={f.id}>
                    <td className="px-3 py-2 text-xs text-ink-muted">{formatFecha(f.created_at)}</td>
                    <td className="px-3 py-2 text-xs text-ink">{f.rider_nombre}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{f.centro_nombre}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{f.estado}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{f.materiales.map((m) => `${m.materialTitulo} (${m.cantidad})`).join(', ')}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{f.admin_usuario ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <FileText size={12} />
                          {t('stockFicha.verPdf')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
