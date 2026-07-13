'use client';

import { useEffect, useId, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Contador de incidencias pendientes que se actualiza solo, en tiempo
 * real, sin recargar la página ni hacer polling. Requiere que la tabla
 * `incidencias` esté añadida a la publicación de Realtime (ver
 * supabase/schema_storage.sql).
 *
 * El sidebar se renderiza dos veces en el DOM (versión escritorio +
 * cajón móvil, una oculta con CSS mientras la otra se muestra), así que
 * puede haber dos instancias de este componente montadas a la vez. Cada
 * una necesita su PROPIO nombre de canal — si dos instancias usan el
 * mismo nombre, la segunda intenta añadir un listener a un canal que la
 * primera ya suscribió, y Supabase lo rechaza con un error en tiempo de
 * ejecución.
 */
export function PendingBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const idInstancia = useId();

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const { count: nuevo } = await supabase
        .from('incidencias')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
      setCount(nuevo ?? 0);
    };

    const channel = supabase
      .channel(`incidencias-pendientes-${idInstancia}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, refetch)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [idInstancia]);

  if (count === 0) return null;

  return (
    <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{count}</span>
  );
}
