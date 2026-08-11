'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Mantiene la tabla al día sin que nadie pulse "Recargar".
 *
 * IMPORTANTE — por qué hay un freno (throttle): antes esto llamaba a
 * router.refresh() en CADA cambio de la tabla, al instante. Con varias
 * personas conectadas a la vez el coste se multiplica: un solo cambio
 * (p. ej. un admin aprobando una incidencia) hacía que TODOS los
 * navegadores abiertos recargaran la página completa a la vez, y cada
 * recarga vuelve a ejecutar todas las consultas de esa pantalla. Con 13
 * personas eso son ~13 recargas completas simultáneas por cada cambio,
 * y con cientos de riders creando incidencias los cambios llegan
 * seguidos — de ahí la sensación de que la app "se queda pegada".
 *
 * Con el freno, los cambios que llegan muy seguidos se agrupan en un
 * único refresco. Se sigue viendo todo al día (con un retardo máximo de
 * VENTANA_MS), pero sin avalancha de consultas.
 */
const VENTANA_MS = 3000;

export function LiveRefresh({ table }: { table: string }) {
  const router = useRouter();
  const pendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoRefresco = useRef<number>(0);

  useEffect(() => {
    const supabase = createClient();

    function refrescarConFreno() {
      const ahora = Date.now();
      const transcurrido = ahora - ultimoRefresco.current;

      // Si hace rato que no refrescamos, refrescar ya (se siente inmediato).
      if (transcurrido >= VENTANA_MS) {
        ultimoRefresco.current = ahora;
        router.refresh();
        return;
      }
      // Si acabamos de refrescar, agrupar este cambio (y los que sigan
      // llegando) en un único refresco al final de la ventana.
      if (pendiente.current) return;
      pendiente.current = setTimeout(() => {
        pendiente.current = null;
        ultimoRefresco.current = Date.now();
        router.refresh();
      }, VENTANA_MS - transcurrido);
    }

    const channel = supabase
      .channel(`live-refresh-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, refrescarConFreno)
      .subscribe();

    return () => {
      if (pendiente.current) clearTimeout(pendiente.current);
      supabase.removeChannel(channel);
    };
  }, [table, router]);

  return null;
}
