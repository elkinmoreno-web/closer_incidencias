'use client';

import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { leerArchivoExcel } from '@/lib/xlsxImport';
import { importarStockInicial, type ResultadoImportacionStock } from '@/app/dashboard/stock/actions';
import type { StockMaterial } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';

type Fase = 'inicial' | 'previsualizando' | 'importando' | 'terminado';

/**
 * Importa el stock inicial de un material desde un CSV. A diferencia
 * de ImportRidersModal (que asume columnas fijas), aquí el nombre de
 * las columnas varía según el material — se confirmó con los datos
 * reales que Mochilas/Chubasqueros usan "Stock Actual" mientras que
 * Soportes usa "Stock Físico (Unid.)" — así que se deja elegir la
 * columna en vez de asumir un nombre.
 */
export function ImportarStockModal({ material }: { material: StockMaterial }) {
  const { t, idioma } = useIdioma();
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>('inicial');
  const [filasCrudas, setFilasCrudas] = useState<Record<string, unknown>[]>([]);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [columnaCentro, setColumnaCentro] = useState('');
  const [columnaCantidad, setColumnaCantidad] = useState('');
  const [columnaM, setColumnaM] = useState('');
  const [columnaL, setColumnaL] = useState('');
  const [columnaXl, setColumnaXl] = useState('');
  const [columnaXxl, setColumnaXxl] = useState('');
  const [usarTallas, setUsarTallas] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionStock | null>(null);

  function reset() {
    setFase('inicial');
    setFilasCrudas([]);
    setColumnas([]);
    setColumnaCentro('');
    setColumnaCantidad('');
    setColumnaM('');
    setColumnaL('');
    setColumnaXl('');
    setColumnaXxl('');
    setUsarTallas(false);
    setErrorArchivo(null);
    setResultado(null);
  }

  function cerrar() {
    setOpen(false);
    reset();
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

      // Adivina la columna de centro/ciudad por nombre, para no obligar
      // a elegirla siempre a mano cuando el CSV ya trae un nombre obvio.
      const posibleCentro = cols.find((c) => /centro|ciudad/i.test(c));
      if (posibleCentro) setColumnaCentro(posibleCentro);

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
    const filas = filasCrudas.map((f) => ({
      centroNombre: String(f[columnaCentro] ?? '').trim(),
      cantidad: usarTallas ? 0 : num(f[columnaCantidad]),
      tallaM: usarTallas ? num(f[columnaM]) : 0,
      tallaL: usarTallas ? num(f[columnaL]) : 0,
      tallaXl: usarTallas ? num(f[columnaXl]) : 0,
      tallaXxl: usarTallas ? num(f[columnaXxl]) : 0,
    }));
    const res = await importarStockInicial(material.id, filas);
    setResultado(res);
    setFase('terminado');
  }

  const listoParaImportar = usarTallas
    ? columnaCentro && (columnaM || columnaL || columnaXl || columnaXxl)
    : columnaCentro && columnaCantidad;

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
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockImport.columnaCentroLabel')}</label>
                  <select
                    value={columnaCentro}
                    onChange={(e) => setColumnaCentro(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">{t('stock.selecciona')}</option>
                    {columnas.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {material.tiene_tallas && (
                  <label className="flex items-center gap-2 text-xs text-ink">
                    <input type="checkbox" checked={usarTallas} onChange={(e) => setUsarTallas(e.target.checked)} className="rounded" />
                    {t('stockImport.csvTraeTallas')}
                  </label>
                )}

                {usarTallas ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'M', valor: columnaM, set: setColumnaM },
                      { label: 'L', valor: columnaL, set: setColumnaL },
                      { label: 'XL', valor: columnaXl, set: setColumnaXl },
                      { label: 'XXL', valor: columnaXxl, set: setColumnaXxl },
                    ].map((t2) => (
                      <div key={t2.label}>
                        <label className="mb-1 block text-xs font-semibold text-ink-muted">{t2.label}</label>
                        <select
                          value={t2.valor}
                          onChange={(e) => t2.set(e.target.value)}
                          className="w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                        >
                          <option value="">—</option>
                          {columnas.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stockImport.columnaCantidadLabel')}</label>
                    <select
                      value={columnaCantidad}
                      onChange={(e) => setColumnaCantidad(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="">{t('stock.selecciona')}</option>
                      {columnas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <p className="text-xs text-ink-muted">
                  {filasCrudas.length} {t('stockImport.filasListas')}
                </p>

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
