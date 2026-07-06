'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Indicador de admins conectados en tiempo real, usando Presence de
 * Supabase Realtime (WebSocket). Sustituye al sistema anterior de
 * "ping" cada pocos segundos + hoja SesionesAdmins: aquí no hay
 * polling, el navegador se entera al instante cuando alguien entra o sale.
 */
export function ConnectedAdmins({ adminId, usuario }: { adminId: string; usuario: string }) {
  const [nombres, setNombres] = useState<string[]>([usuario]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('admins-presence', {
      config: { presence: { key: adminId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ usuario: string }>();
        const unicos = Object.values(state)
          .flat()
          .map((p) => p.usuario);
        setNombres(Array.from(new Set(unicos)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ usuario, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId, usuario]);

  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      Conectados: {nombres.join(', ')}
    </div>
  );
}
