'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Refresca la página (sin perder el scroll ni el estado de React) cada
 * vez que cambia algo en `incidencias`, para que la tabla del dashboard
 * se mantenga al día sin que nadie tenga que pulsar "Recargar".
 */
export function LiveRefresh({ table }: { table: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-refresh-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, router]);

  return null;
}
