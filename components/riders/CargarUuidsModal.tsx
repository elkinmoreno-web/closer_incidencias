'use client';

import { useState } from 'react';
import { Fingerprint, X } from 'lucide-react';
import { leerArchivoExcel, mapearFilasUuid, type FilaUuidExcel } from '@/lib/xlsxImport';
import { cargarUuidsLote } from '@/app/dashboard/riders/actions';

const TAMANO_LOTE = 500;

type Fase = 'inicial' | 'previsualizando' | 'cargando' | 'terminado';

/**
 * Herramienta APARTE de "Importar Excel": solo completa el campo
 * uber_uuid de riders que YA existen, buscando por DNI — nunca crea
 * riders nuevos ni toca el resto de su ficha. Usa el mismo Excel de
 * RRHH (columnas "DNI/NIE" y "Uber UUID"), pero con un propósito
 * mucho más acotado y seguro.
 */
export function CargarUuidsModal() {
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>('inicial');
  const [filas, setFilas] = useState<FilaUuidExcel[]>([]);
  const [omitidasParseo, setOmitidasParseo] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [actualizadosTotal, setActualizadosTotal] = useState(0);
  const [sinCoincidenciaTotal, setSinCoincidenciaTotal] = useState(0);
  const [erroresCarga, setErroresCarga] = useState<string[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  function reset() {
    setFase('inicial');
    setFilas([]);
    setOmitidasParseo(0);
    setProgreso(0);
    setActualizadosTotal(0);
    setSinCoincidenciaTotal(0);
    setErroresCarga([]);
    setErrorArchivo(null);
  }

  async function handleFile(file: File) {
    setErrorArchivo(null);
    try {
      const crudas = await leerArchivoExcel(file);
      const { validas, omitidas } = mapearFilasUuid(crudas);
      if (validas.length === 0) {
        setErrorArchivo('No se encontró ninguna fila con DNI/NIE y Uber UUID. Revisa el Excel.');
        return;
      }
      setFilas(validas);
      setOmitidasParseo(omitidas);
      setFase('previsualizando');
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Asegúrate de que sea un .xlsx válido.');
    }
  }

  async function iniciarCarga() {
    setFase('cargando');
    let actualizados = 0;
    let sinCoincidencia = 0;
    const errores: string[] = [];

    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      const lote = filas.slice(i, i + TAMANO_LOTE);
      const resultado = await cargarUuidsLote(lote);
      actualizados += resultado.actualizados;
      sinCoincidencia += resultado.sinCoincidencia;
      errores.push(...resultado.errores);
      setProgreso(Math.min(filas.length, i + TAMANO_LOTE));
      setActualizadosTotal(actualizados);
      setSinCoincidenciaTotal(sinCoincidencia);
      setErroresCarga([...errores]);
    }

    setFase('terminado');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-bg"
      >
        <Fingerprint size={16} />
        Cargar UUIDs de Uber
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setOpen(false);
            if (fase === 'terminado') reset();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Cargar UUIDs de Uber</h2>
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
                  Sube el mismo Excel de RRHH (columnas <strong>DNI/NIE</strong> y <strong>Uber UUID</strong>). Esto
                  <strong> solo completa el identificador de Uber</strong> de riders que ya existen en el sistema —
                  nunca crea riders nuevos ni cambia ningún otro dato de su ficha. Los DNI del archivo que no
                  coincidan con ningún rider aquí simplemente se ignoran, sin error.
                </p>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="text-sm" />
                {errorArchivo && <p className="text-sm font-medium text-danger">{errorArchivo}</p>}
              </div>
            )}

            {fase === 'previsualizando' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{filas.length}</span> par(es) DNI-UUID listos para cargar.
                </p>
                {omitidasParseo > 0 && (
                  <div className="rounded-lg bg-bg p-3 text-xs text-ink-muted">{omitidasParseo} fila(s) omitidas por falta de DNI o UUID.</div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={reset} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted">
                    Cancelar
                  </button>
                  <button onClick={iniciarCarga} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                    Cargar {filas.length} UUID(s)
                  </button>
                </div>
              </div>
            )}

            {fase === 'cargando' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink">
                  Cargando... {progreso} / {filas.length}
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(progreso / filas.length) * 100}%` }} />
                </div>
              </div>
            )}

            {fase === 'terminado' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-emerald-700">
                  {actualizadosTotal} rider(es) actualizados con su UUID de Uber.
                </p>
                {sinCoincidenciaTotal > 0 && (
                  <p className="text-xs text-ink-muted">{sinCoincidenciaTotal} DNI del archivo no coincidieron con ningún rider aquí (esperado, sin problema).</p>
                )}
                {erroresCarga.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                    {erroresCarga.length} error(es):
                    <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-4">
                      {erroresCarga.slice(0, 20).map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button onClick={() => setOpen(false)} className="self-end rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
