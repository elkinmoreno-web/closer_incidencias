'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { buscarRiders, type RiderResultado } from '@/app/dashboard/buscarRiders';

const MAX_SUGERENCIAS = 15;

/**
 * Buscador de rider que consulta EN EL SERVIDOR mientras se escribe, con
 * un pequeño retardo para no lanzar una consulta por cada tecla.
 *
 * Reemplaza al <datalist> que se llenaba con todos los riders: con miles
 * de riders, ese enfoque era lento (traía la lista entera en cada carga)
 * y además incorrecto (se cortaba en 1000 filas sin avisar).
 *
 * Escribe el DNI seleccionado en un campo oculto con el nombre que
 * espera el formulario (`nombreCampo`), así los Server Actions que ya
 * existen siguen funcionando igual, sin cambios.
 */
export function BuscadorRiderRemoto({
  nombreCampo = 'riderDni',
  requerido = true,
}: {
  nombreCampo?: string;
  requerido?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<RiderResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<RiderResultado | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function alCambiarTexto(v: string) {
    setTexto(v);
    setAbierto(true);
    setElegido(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = v.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      const r = await buscarRiders(q);
      setResultados(r);
      setBuscando(false);
    }, 300);
  }

  function elegir(r: RiderResultado) {
    setElegido(r);
    setTexto(`${r.nombre} — ${r.dni}`);
    setAbierto(false);
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  return (
    <div className="relative">
      <input type="hidden" name={nombreCampo} value={elegido?.dni ?? ''} required={requerido} />
      <div className="relative">
        {buscando ? (
          <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-ink-muted" />
        ) : (
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        )}
        <input
          value={texto}
          onChange={(e) => alCambiarTexto(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder="Escribe al menos 2 letras del nombre o DNI..."
          className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {abierto && texto.trim().length >= 2 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
            {buscando ? (
              <p className="px-3 py-2.5 text-xs text-ink-muted">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-ink-muted">Sin coincidencias en tu zona.</p>
            ) : (
              resultados.map((r) => (
                <button key={r.id} type="button" onClick={() => elegir(r)} className="block w-full px-3 py-2 text-left text-sm hover:bg-bg">
                  <div className="text-ink">{r.nombre}</div>
                  <div className="text-xs text-ink-muted">{r.dni}</div>
                </button>
              ))
            )}
            {resultados.length === MAX_SUGERENCIAS && (
              <p className="border-t border-border px-3 py-1.5 text-[11px] text-ink-muted">Sigue escribiendo para acotar más.</p>
            )}
          </div>
        </>
      )}
      {!elegido && texto.trim().length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">Elige un rider de la lista para continuar.</p>
      )}
    </div>
  );
}
