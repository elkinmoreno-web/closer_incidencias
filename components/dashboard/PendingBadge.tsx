'use client';

import { useEffect, useId, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Contador de pendientes (incidencias o ausencias) que se actualiza
 * solo, en tiempo real, sin recargar la página ni hacer polling.
 * Requiere que la tabla esté en la publicación de Realtime.
 *
 * El sidebar se renderiza dos veces en el DOM (versión escritorio +
 * cajón móvil), así que puede haber dos instancias montadas a la vez.
 * Cada una necesita su PROPIO nombre de canal — si dos instancias usan
 * el mismo, la segunda intenta añadir un listener a un canal que la
 * primera ya suscribió, y Supabase lo rechaza en tiempo de ejecución.
 */
export function PendingBadge({ tabla, initialCount }: { tabla: 'incidencias' | 'ausencias'; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const idInstancia = useId();

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const { count: nuevo } = await supabase.from(tabla).select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
      setCount(nuevo ?? 0);
    };

    const channel = supabase
      .channel(`${tabla}-pendientes-${idInstancia}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, refetch)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [idInstancia, tabla]);

  if (count === 0) return null;

  return (
    <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{count}</span>
  );
}
