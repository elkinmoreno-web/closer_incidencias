'use client';

import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { leerArchivoExcel, mapearFilasExcel, type RiderExcelRow } from '@/lib/xlsxImport';
import { importarRidersLote } from '@/app/dashboard/riders/actions';

// Lotes más grandes que antes: ahora la mayoría de filas de un lote solo
// necesitan un UPSERT en bloque (rápido), no una operación por fila. Solo
// las filas genuinamente nuevas son más lentas (crean su acceso), así
// que el tiempo real depende de cuántos riders nuevos haya, no del total.
const TAMANO_LOTE = 200;

type Fase = 'inicial' | 'previsualizando' | 'importando' | 'terminado';

export function ImportRidersModal() {
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>('inicial');
  const [filas, setFilas] = useState<RiderExcelRow[]>([]);
  const [erroresParseo, setErroresParseo] = useState<string[]>([]);
  const [omitidasParseo, setOmitidasParseo] = useState<string[]>([]);
  const [progreso, setProgreso] = useState(0);
  const [creadosTotal, setCreadosTotal] = useState(0);
  const [actualizadosTotal, setActualizadosTotal] = useState(0);
  const [erroresImport, setErroresImport] = useState<string[]>([]);
  const [sinCentroImport, setSinCentroImport] = useState<string[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  function reset() {
    setFase('inicial');
    setFilas([]);
    setErroresParseo([]);
    setOmitidasParseo([]);
    setProgreso(0);
    setCreadosTotal(0);
    setActualizadosTotal(0);
    setErroresImport([]);
    setSinCentroImport([]);
    setErrorArchivo(null);
  }

  async function handleFile(file: File) {
    setErrorArchivo(null);
    try {
      const crudas = await leerArchivoExcel(file);
      const { validas, errores, omitidas } = mapearFilasExcel(crudas);
      if (validas.length === 0) {
        setErrorArchivo('No se encontró ninguna fila válida (Activo o Baja operativa). Revisa el Excel.');
        return;
      }
      setFilas(validas);
      setErroresParseo(errores);
      setOmitidasParseo(omitidas);
      setFase('previsualizando');
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Asegúrate de que sea un .xlsx válido.');
    }
  }

  async function iniciarImportacion() {
    setFase('importando');
    let creados = 0;
    let actualizados = 0;
    const errores: string[] = [];
    const sinCentro: string[] = [];

    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      const lote = filas.slice(i, i + TAMANO_LOTE);
      const resultado = await importarRidersLote(lote);
      creados += resultado.creados;
      actualizados += resultado.actualizados;
      errores.push(...resultado.errores);
      sinCentro.push(...resultado.sinCentro);
      setProgreso(Math.min(filas.length, i + TAMANO_LOTE));
      setCreadosTotal(creados);
      setActualizadosTotal(actualizados);
      setErroresImport([...errores]);
      setSinCentroImport([...sinCentro]);
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
                  Sube el .xlsx con las columnas habituales (Empleado, DNI, Email, Centro, Empresa
                  contratante, Tipo de vehículo, Estado, etc.). Solo se cargan filas de{' '}
                  <strong>Closer Logistics SL</strong> o <strong>Closer Go Germany GmbH</strong> con
                  estado Activo o Baja operativa, y puesto Rider. Si un rider ya existe (por DNI), se
                  actualiza en vez de duplicarse. Los centros se asocian a los que ya existen en el
                  sistema; los centros <strong>MCD</strong> se crean automáticamente si no existen
                  (con su propia ciudad). Si algún otro centro no se reconoce, el rider se importa
                  igual pero sin centro y te lo indicamos al final.
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
                  <span className="font-semibold">{filas.length}</span> rider(es) con estado Activo o Baja
                  operativa, listos para importar.
                </p>
                {omitidasParseo.length > 0 && (
                  <div className="rounded-lg bg-bg p-3 text-xs text-ink-muted">
                    {omitidasParseo.length} fila(s) omitidas por no tener estado Activo ni Baja operativa.
                  </div>
                )}
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
                  {progreso} / {filas.length} procesados —{' '}
                  <span className="font-semibold text-emerald-700">{creadosTotal} nuevos</span>,{' '}
                  <span className="font-semibold text-primary">{actualizadosTotal} actualizados</span>
                  {erroresImport.length > 0 && <span className="text-danger"> · {erroresImport.length} con error</span>}
                </p>

                {fase === 'terminado' && sinCentroImport.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="mb-1 font-semibold">
                      {sinCentroImport.length} rider(es) se importaron sin centro (su centro del Excel no está
                      en el sistema). Revísalos y asígnales centro a mano:
                    </p>
                    {sinCentroImport.map((s, idx) => (
                      <div key={idx}>{s}</div>
                    ))}
                  </div>
                )}

                {fase === 'terminado' && erroresImport.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3 text-xs text-danger">
                    {erroresImport.map((e, idx) => (
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
