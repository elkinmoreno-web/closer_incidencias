'use client';

import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { leerArchivoExcel, mapearFilasExcel, type RiderExcelRow } from '@/lib/xlsxImport';
import { importarRidersLote } from '@/app/dashboard/riders/actions';

const TAMANO_LOTE = 15;

type Fase = 'inicial' | 'previsualizando' | 'importando' | 'terminado';

export function ImportRidersModal() {
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>('inicial');
  const [filas, setFilas] = useState<RiderExcelRow[]>([]);
  const [erroresParseo, setErroresParseo] = useState<string[]>([]);
  const [progreso, setProgreso] = useState(0);
  const [okTotal, setOkTotal] = useState(0);
  const [erroresImport, setErroresImport] = useState<string[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  function reset() {
    setFase('inicial');
    setFilas([]);
    setErroresParseo([]);
    setProgreso(0);
    setOkTotal(0);
    setErroresImport([]);
    setErrorArchivo(null);
  }

  async function handleFile(file: File) {
    setErrorArchivo(null);
    try {
      const crudas = await leerArchivoExcel(file);
      const { validas, errores } = mapearFilasExcel(crudas);
      if (validas.length === 0) {
        setErrorArchivo('No se encontró ninguna fila válida. Revisa que las cabeceras coincidan con la plantilla.');
        return;
      }
      setFilas(validas);
      setErroresParseo(errores);
      setFase('previsualizando');
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Asegúrate de que sea un .xlsx válido.');
    }
  }

  async function iniciarImportacion() {
    setFase('importando');
    let ok = 0;
    const errores: string[] = [];

    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      const lote = filas.slice(i, i + TAMANO_LOTE);
      const resultado = await importarRidersLote(lote);
      ok += resultado.ok;
      errores.push(...resultado.errores);
      setProgreso(Math.min(filas.length, i + TAMANO_LOTE));
      setOkTotal(ok);
      setErroresImport([...errores]);
    }

    setFase('terminado');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-bg"
      >
        <Upload size={16} />
        Importar Excel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setOpen(false);
            if (fase === 'terminado') reset();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Importar riders desde Excel</h2>
              <button
                onClick={() => {
                  setOpen(false);
                  if (fase === 'terminado') reset();
                }}
                className="text-ink-muted hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            {fase === 'inicial' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-muted">
                  Sube el .xlsx con las columnas habituales (Empleado, DNI, Email, Centro, Tipo de vehículo,
                  Estado, etc.). Si un centro o vehículo no existe todavía, se crea automáticamente.
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  className="text-sm"
                />
                {errorArchivo && <p className="text-sm font-medium text-danger">{errorArchivo}</p>}
              </div>
            )}

            {fase === 'previsualizando' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{filas.length}</span> rider(es) listos para importar.
                </p>
                {erroresParseo.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                    {erroresParseo.length} fila(s) se ignoraron por falta de datos:
                    <ul className="mt-1 list-disc pl-4">
                      {erroresParseo.slice(0, 5).map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border">
                      {filas.slice(0, 8).map((f) => (
                        <tr key={f.dni}>
                          <td className="px-2 py-1.5">{f.nombre}</td>
                          <td className="px-2 py-1.5 text-ink-muted">{f.dni}</td>
                          <td className="px-2 py-1.5 text-ink-muted">{f.centro ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={reset} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                    Cancelar
                  </button>
                  <button onClick={iniciarImportacion} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                    Importar {filas.length} rider(es)
                  </button>
                </div>
              </div>
            )}

            {(fase === 'importando' || fase === 'terminado') && (
              <div className="flex flex-col gap-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(progreso / filas.length) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-ink">
                  {progreso} / {filas.length} procesados — <span className="font-semibold text-emerald-700">{okTotal} creados</span>
                  {erroresImport.length > 0 && <span className="text-danger"> · {erroresImport.length} con error</span>}
                </p>

                {fase === 'terminado' && erroresImport.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3 text-xs text-danger">
                    {erroresImport.slice(0, 15).map((e, idx) => (
                      <div key={idx}>{e}</div>
                    ))}
                  </div>
                )}

                {fase === 'terminado' && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setOpen(false);
                        reset();
                      }}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
                    >
                      Cerrar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
