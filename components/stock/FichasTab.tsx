'use client';

import { useMemo, useState } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import type { StockFicha, Centro } from '@/lib/types';
import { ITEMS_FICHA_FIJOS } from '@/lib/types';
import { ThFiltro, cumpleFiltroTexto, type DireccionOrden, type FiltroColumna } from '@/components/stock/ThFiltro';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { formatFecha } from '@/lib/utils';
import { urlArchivoDrive } from '@/lib/driveUrl';
import { NuevaFichaModal } from '@/components/stock/NuevaFichaModal';
import { ExportarCsvButton } from '@/components/stock/ExportarCsvButton';

type FichaConNombres = StockFicha & { centro_nombre: string; admin_usuario: string | null };

const ETIQUETA_MARCA: Record<string, string> = { asignacion: 'Asignación', devolucion_ok: 'Dev. OK', devolucion_mal: 'Dev. mal estado' };

function resumenItems(f: FichaConNombres): string {
  return (f.items ?? [])
    .filter((it) => it.marca)
    .map((it) => {
      const def = ITEMS_FICHA_FIJOS.find((d) => d.clave === it.itemClave);
      return `${def?.etiqueta ?? it.itemClave} (${ETIQUETA_MARCA[it.marca!] ?? it.marca})`;
    })
    .join(', ');
}

/** Marcas únicas usadas en la ficha, para el filtro de "Estado" — una ficha puede contener varias (ej. entrega de mochila + devolución de chubasquero roto en la misma visita). */
function marcasDeFicha(f: FichaConNombres): string[] {
  return Array.from(new Set((f.items ?? []).map((it) => it.marca).filter((m): m is NonNullable<typeof m> => !!m)));
}

const OPCIONES_ESTADO: [string, string][] = [
  ['asignacion', 'Asignación'],
  ['devolucion_ok', 'Devolución OK'],
  ['devolucion_mal', 'Devolución rota'],
];

export function FichasTab({ fichas, centros, onFichaGenerada }: { fichas: FichaConNombres[]; centros: Centro[]; onFichaGenerada: () => void }) {
  const [modalAbierto, setModalAbierto] = useState(false);
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
      if (filtrosFichas.estado?.texto && !marcasDeFicha(f).includes(filtrosFichas.estado.texto)) return false;
      if (!cumpleFiltroTexto(resumenItems(f), filtrosFichas.items)) return false;
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink">{t('stockFichas.titulo')}</h2>
        <div className="flex items-center gap-2">
          <ExportarCsvButton
            nombreArchivo="fichas_entrega"
            filas={fichasFiltradas.map((f) => ({
              Fecha: formatFecha(f.created_at),
              Rider: f.rider_nombre,
              DNI: f.rider_dni,
              Centro: f.centro_nombre,
              Estado: marcasDeFicha(f).map((m) => ETIQUETA_MARCA[m]).join(' / '),
              Materiales: resumenItems(f),
              'Registrada por': f.admin_usuario ?? '',
            }))}
          />
          <button
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            <Plus size={16} />
            {t('stockFicha.boton')}
          </button>
        </div>
      </div>
      {fichas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t('stockFichas.sinFichas')}</p>
      ) : fichasFiltradas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-ink-muted">
          <p>{t('stock.sinCoincidencias')}</p>
          <button onClick={() => setFiltrosFichas({})} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <X size={12} />
            {t('stock.limpiarFiltros')}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">{t('stockFichas.colFecha')}</th>
                <ThFiltro label={t('stockFichas.colRider')} ordenActivo={ordenFichas?.campo === 'rider_nombre' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('rider_nombre', d)} filtro={filtrosFichas.rider} onFiltrar={(f) => filtrarFichasPor('rider', f)} />
                <ThFiltro label={t('stockFichas.colCentro')} ordenActivo={ordenFichas?.campo === 'centro_nombre' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('centro_nombre', d)} filtro={filtrosFichas.centro} onFiltrar={(f) => filtrarFichasPor('centro', f)} />
                <ThFiltro label={t('stockFichas.colEstado')} tipo="select" opciones={OPCIONES_ESTADO} ordenActivo={null} onOrdenar={() => {}} filtro={filtrosFichas.estado} onFiltrar={(f) => filtrarFichasPor('estado', f)} />
                <ThFiltro label={t('stockFichas.colMateriales')} ordenActivo={ordenFichas?.campo === 'items' ? ordenFichas.dir : null} onOrdenar={(d) => ordenarFichasPor('items', d)} filtro={filtrosFichas.items} onFiltrar={(f) => filtrarFichasPor('items', f)} />
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
                    <td className="px-3 py-2 text-xs text-ink-muted">{marcasDeFicha(f).map((m) => ETIQUETA_MARCA[m]).join(' / ')}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">{resumenItems(f)}</td>
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

      {modalAbierto && (
        <NuevaFichaModal
          centros={centros}
          onCerrar={() => setModalAbierto(false)}
          onGenerada={() => {
            setModalAbierto(false);
            onFichaGenerada();
          }}
        />
      )}
    </div>
  );
}
