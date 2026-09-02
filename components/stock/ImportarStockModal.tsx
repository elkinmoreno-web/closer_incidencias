'use client';

import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { leerArchivoExcel } from '@/lib/xlsxImport';
import { importarStockInicial, type ResultadoImportacionStock } from '@/app/dashboard/stock/actions';
import type { StockMaterial } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

type Fase = 'inicial' | 'previsualizando' | 'importando' | 'terminado';

// Patrones para adivinar cada columna por su nombre — cubren tanto el
// formato de Mochilas/Chubasqueros ("Stock Actual", "Cajas Tránsito",
// "... Entregadas/Rotas/No Recuperadas") como el de Soportes ("Stock
// Físico", "En Tránsito", "En Poder de Riders", "Rotos / Basura",
// "Robados / Perdidos") — confirmado con los 3 CSV reales.
const PATRONES: Record<string, RegExp> = {
  centro: /centro|ciudad/i,
  cantidad: /stock\s*(actual|f[ií]sico)/i,
  enTransito: /tr[aá]nsito/i,
  entregadas: /entregad|poder de rider/i,
  rotas: /rota|roto|basura/i,
  noRecuperadas: /no\s*recuperad|robad|perdid/i,
};

/**
 * Importa el stock inicial de un material desde un CSV. Adivina cada
 * columna relevante por su nombre (con los patrones reales de los 3
 * CSV que se usaron para migrar) y deja ajustar a mano si hace falta
 * — el nombre de columna varía según el material (confirmado con
 * datos reales: Mochilas/Chubasqueros usan un formato, Soportes otro).
 */
export function ImportarStockModal({ material }: { material: StockMaterial }) {
  const { t, idioma } = useIdioma();
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>('inicial');
  const [filasCrudas, setFilasCrudas] = useState<Record<string, unknown>[]>([]);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [colCentro, setColCentro] = useState('');
  const [colCantidad, setColCantidad] = useState('');
  const [colEnTransito, setColEnTransito] = useState('');
  const [colEntregadas, setColEntregadas] = useState('');
  const [colRotas, setColRotas] = useState('');
  const [colNoRecuperadas, setColNoRecuperadas] = useState('');
  const [colM, setColM] = useState('');
  const [colL, setColL] = useState('');
  const [colXl, setColXl] = useState('');
  const [colXxl, setColXxl] = useState('');
  const [usarTallas, setUsarTallas] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionStock | null>(null);
  const [errorImportacion, setErrorImportacion] = useState<string | null>(null);

  function reset() {
    setFase('inicial');
    setFilasCrudas([]);
    setColumnas([]);
    setColCentro('');
    setColCantidad('');
    setColEnTransito('');
    setColEntregadas('');
    setColRotas('');
    setColNoRecuperadas('');
    setColM('');
    setColL('');
    setColXl('');
    setColXxl('');
    setUsarTallas(false);
    setErrorArchivo(null);
    setResultado(null);
  }

  function cerrar() {
    setOpen(false);
    reset();
  }

  function adivinar(cols: string[], patron: RegExp): string {
    return cols.find((c) => patron.test(c)) ?? '';
  }

  async function handleFile(file: File) {
    setErrorArchivo(null);
    try {
      const filas = await leerArchivoExcel(file);
      if (filas.length === 0) {
        setErrorArchivo(t('stockImport.errorSinFilas'));
        return;
      }
      const cols = Object.keys(filas[0]);
      setColumnas(cols);
      setFilasCrudas(filas);

      // Auto-detección: reduce a cero el trabajo manual en el caso
      // común (los 3 CSV reales usados para migrar encajan con estos
      // patrones); el usuario solo ajusta si algo no coincide.
      setColCentro(adivinar(cols, PATRONES.centro));
      setColCantidad(adivinar(cols, PATRONES.cantidad));
      setColEnTransito(adivinar(cols, PATRONES.enTransito));
      setColEntregadas(adivinar(cols, PATRONES.entregadas));
      setColRotas(adivinar(cols, PATRONES.rotas));
      setColNoRecuperadas(adivinar(cols, PATRONES.noRecuperadas));

      setFase('previsualizando');
    } catch {
      setErrorArchivo(t('stockImport.errorLeer'));
    }
  }

  function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function confirmarImportacion() {
    setFase('importando');
    setErrorImportacion(null);
    const filas = filasCrudas.map((f) => ({
      centroNombre: String(f[colCentro] ?? '').trim(),
      cantidad: usarTallas ? 0 : num(f[colCantidad]),
      tallaM: usarTallas ? num(f[colM]) : 0,
      tallaL: usarTallas ? num(f[colL]) : 0,
      tallaXl: usarTallas ? num(f[colXl]) : 0,
      tallaXxl: usarTallas ? num(f[colXxl]) : 0,
      enTransito: colEnTransito ? num(f[colEnTransito]) : 0,
      entregadas: colEntregadas ? num(f[colEntregadas]) : 0,
      rotas: colRotas ? num(f[colRotas]) : 0,
      noRecuperadas: colNoRecuperadas ? num(f[colNoRecuperadas]) : 0,
    }));
    try {
      const res = await importarStockInicial(material.id, filas);
      setResultado(res);
      setFase('terminado');
    } catch (e) {
      // Sin esto, si la Server Action lanza una excepción (ej. un
      // error 500 real de servidor), la fase se quedaba en
      // "importando" para siempre, sin ningún mensaje — el modal
      // parecía "colgado" sin dar pista de qué pasó.
      setErrorImportacion(e instanceof Error ? e.message : 'No se pudo completar la importación. Inténtalo de nuevo.');
      setFase('previsualizando');
    }
  }

  const listoParaImportar = usarTallas
    ? colCentro && (colM || colL || colXl || colXxl)
    : colCentro && colCantidad;

  function SelectorColumna({ label, valor, set, opcional }: { label: string; valor: string; set: (v: string) => void; opcional?: boolean }) {
    return (
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-muted">
          {label} {opcional && <span className="font-normal opacity-70">({t('stockImport.opcional')})</span>}
        </label>
        <select value={valor} onChange={(e) => set(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="">{opcional ? t('stockImport.noImportarEsteDato') : t('stock.selecciona')}</option>
          {columnas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-primary hover:text-primary"
      >
        <Upload size={14} />
        {t('stockImport.boton')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrar}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                {t('stockImport.titulo')} — {nombreSegunIdioma(idioma, material.titulo, material.titulo_en)}
              </h2>
              <button onClick={cerrar} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            {fase === 'inicial' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-muted">{t('stockImport.descripcion')}</p>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="text-sm" />
                {errorArchivo && <p className="text-sm font-medium text-danger">{errorArchivo}</p>}
              </div>
            )}

            {fase === 'previsualizando' && (
              <div className="flex flex-col gap-3">
                <SelectorColumna label={t('stockImport.columnaCentroLabel')} valor={colCentro} set={setColCentro} />

                {material.tiene_tallas && (
                  <label className="flex items-center gap-2 text-xs text-ink">
                    <input type="checkbox" checked={usarTallas} onChange={(e) => setUsarTallas(e.target.checked)} className="rounded" />
                    {t('stockImport.csvTraeTallas')}
                  </label>
                )}

                {usarTallas ? (
                  <div className="grid grid-cols-2 gap-2">
                    <SelectorColumna label="M" valor={colM} set={setColM} />
                    <SelectorColumna label="L" valor={colL} set={setColL} />
                    <SelectorColumna label="XL" valor={colXl} set={setColXl} />
                    <SelectorColumna label="XXL" valor={colXxl} set={setColXxl} />
                  </div>
                ) : (
                  <SelectorColumna label={t('stockImport.columnaCantidadLabel')} valor={colCantidad} set={setColCantidad} />
                )}

                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('stockImport.otrosDatos')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <SelectorColumna label={t('stock.colEnCamino')} valor={colEnTransito} set={setColEnTransito} opcional />
                  <SelectorColumna label={t('stock.colEnCalle')} valor={colEntregadas} set={setColEntregadas} opcional />
                  <SelectorColumna label={t('stock.colMerma')} valor={colRotas} set={setColRotas} opcional />
                  <SelectorColumna label={t('stock.colPerdida')} valor={colNoRecuperadas} set={setColNoRecuperadas} opcional />
                </div>

                <p className="text-xs text-ink-muted">
                  {filasCrudas.length} {t('stockImport.filasListas')}
                </p>

                {errorImportacion && <p className="text-sm font-medium text-danger">{errorImportacion}</p>}

                <div className="flex justify-end gap-2">
                  <button onClick={reset} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                    {t('stockImport.cancelar')}
                  </button>
                  <button
                    onClick={confirmarImportacion}
                    disabled={!listoParaImportar}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {t('stockImport.importar')}
                  </button>
                </div>
              </div>
            )}

            {fase === 'importando' && (
              <div className="flex items-center justify-center gap-2 py-10 text-ink-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('stockImport.importando')}
              </div>
            )}

            {fase === 'terminado' && resultado && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink">
                  <span className="font-semibold text-emerald-700">{resultado.insertados}</span> {t('stockImport.resultadoInsertados')}
                </p>
                {resultado.filasIgnoradas > 0 && (
                  <p className="text-xs text-ink-muted">
                    {resultado.filasIgnoradas} {t('stockImport.resultadoIgnoradas')}
                  </p>
                )}
                {resultado.centrosNoEncontrados.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="mb-1 font-semibold">
                      {resultado.centrosNoEncontrados.length} {t('stockImport.centrosNoEncontrados')}
                    </p>
                    <ul className="list-disc pl-4">
                      {resultado.centrosNoEncontrados.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={cerrar} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                    {t('stockImport.cerrar')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
