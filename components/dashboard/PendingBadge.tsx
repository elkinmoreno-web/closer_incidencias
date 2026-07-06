'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Contador de incidencias pendientes que se actualiza solo, en tiempo
 * real, sin recargar la página ni hacer polling. Requiere que la tabla
 * `incidencias` esté añadida a la publicación de Realtime (ver
 * supabase/schema_storage.sql).
 */
export function PendingBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

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
      .channel('incidencias-pendientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, refetch)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{count}</span>
  );
}
