'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Presencia {
  usuario: string;
  rol: string;
  ciudades: string[];
}

/**
 * Indicador de admins conectados en tiempo real, usando Presence de
 * Supabase Realtime (WebSocket) — sin polling, se entera al instante
 * cuando alguien entra o sale.
 *
 * Cada admin "emite" su propio rol y ciudades al conectarse. Quién ve
 * qué depende de quién mira, igual que el resto del sistema de zonas:
 * - Super Admin: ve a todos, organizados por ciudad (más una sección
 *   aparte para quienes no tienen zona, ej. otros super admins).
 * - Administrador/Moderador: solo ve a quienes comparten AL MENOS una
 *   de sus propias ciudades.
 */
export function ConnectedAdmins({
  adminId,
  usuario,
  rol,
  misCiudades = [],
}: {
  adminId: string;
  usuario: string;
  rol: string;
  misCiudades: string[];
}) {
  const [presencias, setPresencias] = useState<Presencia[]>([{ usuario, rol, ciudades: misCiudades }]);
  const esSuperAdmin = rol === 'super_admin';

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('admins-presence', {
      config: { presence: { key: adminId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Partial<Presencia>>();
        const todas = Object.values(state)
          .flat()
          .filter((p) => !!p?.usuario)
          .map((p) => ({
            usuario: p.usuario as string,
            rol: p.rol ?? 'moderador',
            ciudades: Array.isArray(p.ciudades) ? p.ciudades : [],
          }));
        // Por si el mismo admin tiene dos pestañas abiertas: no lo dupliques.
        const unicas = Array.from(new Map(todas.map((p) => [p.usuario, p])).values());
        setPresencias(unicas);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ usuario, rol, ciudades: misCiudades });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId, usuario, rol, misCiudades]);

  // Quién no es super_admin solo ve a quien comparte alguna de sus ciudades (o a sí mismo).
  const visibles = esSuperAdmin
    ? presencias
    : presencias.filter((p) => p.usuario === usuario || p.ciudades.some((c) => misCiudades.includes(c)));

  if (!esSuperAdmin) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Conectados: {visibles.map((p) => p.usuario).join(', ')}
      </div>
    );
  }

  // Super Admin: organizado por ciudad, más una sección para quienes no tienen zona.
  const porCiudad = new Map<string, Set<string>>();
  const sinZona: string[] = [];
  for (const p of visibles) {
    if (p.ciudades.length === 0) {
      sinZona.push(p.usuario);
      continue;
    }
    for (const ciudad of p.ciudades) {
      if (!porCiudad.has(ciudad)) porCiudad.set(ciudad, new Set());
      porCiudad.get(ciudad)!.add(p.usuario);
    }
  }
  const ciudadesOrdenadas = Array.from(porCiudad.keys()).sort();

  return (
    <div className="group relative inline-block text-xs">
      <div className="flex cursor-default items-center gap-2 font-semibold text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Conectados: {visibles.length}
      </div>
      <div className="invisible absolute left-0 top-5 z-50 w-64 rounded-card border border-border bg-surface p-3 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
        {ciudadesOrdenadas.length === 0 && sinZona.length === 0 && <p className="text-ink-muted">Nadie más conectado.</p>}
        {ciudadesOrdenadas.map((ciudad) => (
          <div key={ciudad} className="mb-1.5 last:mb-0">
            <p className="font-semibold text-ink">{ciudad}</p>
            <p className="text-ink-muted">{Array.from(porCiudad.get(ciudad)!).join(', ')}</p>
          </div>
        ))}
        {sinZona.length > 0 && (
          <div className="mb-1.5 last:mb-0">
            <p className="font-semibold text-ink">Sin zona asignada</p>
            <p className="text-ink-muted">{sinZona.join(', ')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
