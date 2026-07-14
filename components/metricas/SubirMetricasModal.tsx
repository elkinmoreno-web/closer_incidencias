'use client';

import { useRef, useState } from 'react';
import { Upload, X, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { subirLoteMetricas } from '@/app/dashboard/metricas/actions';
import {
  buildHeaderMap,
  detectFileType,
  mapDailyRow,
  mapParquetRow,
  dedupeRows,
  weekRange,
  addDaysIso,
  type FilaMetricaParseada,
} from '@/lib/metricasParse';

function esParquet(file: File): boolean {
  return file.name.toLowerCase().endsWith('.parquet');
}

async function leerParquet(file: File): Promise<Record<string, unknown>[]> {
  const [{ parquetRead }, { compressors }] = await Promise.all([import('hyparquet'), import('hyparquet-compressors')]);
  const buffer = await file.arrayBuffer();
  const rows: Record<string, unknown>[] = [];
  await parquetRead({
    file: buffer,
    columns: ['datestr', 'driver_email', 'driver_number', 'driver_uuid', 'driver_name', 'city_name', 'form_factor', 'online_hours', 'active_hours', 'num_of_trips', 'accept_trips', 'reject_trips', 'cancel_trips', 'cancel_not_at_fault_trips'],
    rowFormat: 'object',
    compressors,
    onComplete: (data: Record<string, unknown>[]) => rows.push(...data),
  });
  return rows;
}

async function leerHojaCalculo(file: File): Promise<{ rows: Record<string, unknown>[]; headers: string[] }> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, headers };
}

export function SubirMetricasModal({ onClose }: { onClose: () => void }) {
  const [procesando, setProcesando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ inserted: number; total: number; mergedDups: number } | null>(null);
  const [filasParaSubir, setFilasParaSubir] = useState<{ filas: FilaMetricaParseada[]; fileName: string; total: number; mergedDups: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function manejarArchivo(file: File) {
    const nombre = file.name.toLowerCase();
    const valido = ['.xlsx', '.xls', '.csv', '.parquet'].some((ext) => nombre.endsWith(ext));
    if (!valido) {
      setError('Sube un archivo .parquet, .xlsx, .xls o .csv');
      return;
    }

    setProcesando(true);
    setError(null);
    setResultado(null);

    try {
      let mapeadas: (FilaMetricaParseada | null)[];

      if (esParquet(file)) {
        const rows = await leerParquet(file);
        if (rows.length === 0) throw new Error('El parquet no tiene filas');
        mapeadas = rows.map(mapParquetRow);
      } else {
        const { rows, headers } = await leerHojaCalculo(file);
        if (rows.length === 0) throw new Error('El archivo no tiene filas');
        const tipo = detectFileType(headers);
        if (tipo !== 'daily') throw new Error('No reconozco este archivo: necesita una columna "Day" con fechas diarias');
        const headerMap = buildHeaderMap(headers);
        mapeadas = rows.map((r) => mapDailyRow(r, headerMap));
      }

      const validas = mapeadas.filter((r): r is FilaMetricaParseada => r !== null);
      if (validas.length === 0) throw new Error('No se encontraron filas válidas (revisa el formato)');

      const maxDay = validas.reduce((acc, r) => (r.day > acc ? r.day : acc), '');
      const semana = weekRange(maxDay);
      const inicioVentana = addDaysIso(semana.start, -7);
      const recientes = validas.filter((r) => r.day >= inicioVentana && r.day <= semana.end);
      if (recientes.length === 0) throw new Error('No quedaron filas tras filtrar a las últimas 2 semanas');

      const { rows: dedup, mergedDups } = dedupeRows(recientes);
      const conEmail = dedup.filter((r) => r.email);
      if (conEmail.length === 0) throw new Error('Ninguna fila tiene email, no se puede identificar a los riders');

      setFilasParaSubir({ filas: conEmail, fileName: file.name, total: mapeadas.length, mergedDups });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcesando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function confirmarSubida() {
    if (!filasParaSubir) return;
    setSubiendo(true);
    setError(null);
    try {
      const res = await subirLoteMetricas(filasParaSubir.filas, { fileName: filasParaSubir.fileName, parquetRows: filasParaSubir.total });
      if (!res.ok) throw new Error(res.error || 'No se pudo subir');
      setResultado({ inserted: res.inserted, total: filasParaSubir.filas.length, mergedDups: filasParaSubir.mergedDups });
      setFilasParaSubir(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-card bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Subir métricas manualmente</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs text-ink-muted">
          Solo usa esto si la sincronización automática diaria falló. Acepta <strong>.parquet</strong> (formato
          rides_silver) o <strong>.xlsx/.csv</strong> con una columna &quot;Day&quot;. Se filtra automáticamente a las
          últimas 2 semanas y se combinan turnos duplicados del mismo rider/día.
        </p>

        {!filasParaSubir && !resultado && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-primary">
            <Upload className="h-6 w-6 text-ink-muted" />
            <span className="text-sm text-ink-muted">{procesando ? 'Procesando...' : 'Arrastra o haz clic para elegir el archivo'}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.parquet"
              className="hidden"
              disabled={procesando}
              onChange={(e) => e.target.files?.[0] && manejarArchivo(e.target.files[0])}
            />
          </label>
        )}

        {filasParaSubir && (
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-ink">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              {filasParaSubir.fileName}
            </div>
            <p className="mb-3 text-xs text-ink-muted">
              {filasParaSubir.filas.length} fila(s) listas para subir de {filasParaSubir.total} totales
              {filasParaSubir.mergedDups > 0 && ` · ${filasParaSubir.mergedDups} turno(s) combinados`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmarSubida}
                disabled={subiendo}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {subiendo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar y subir
              </button>
              <button onClick={() => setFilasParaSubir(null)} disabled={subiendo} className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-muted">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {resultado && (
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {resultado.inserted} fila(s) subidas correctamente.
              <button onClick={onClose} className="ml-2 underline">
                Cerrar
              </button>
            </span>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
