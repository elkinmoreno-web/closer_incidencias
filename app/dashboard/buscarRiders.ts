'use server';

import { createClient } from '@/lib/supabase/server';

export interface RiderResultado {
  id: string;
  nombre: string;
  dni: string;
}

/**
 * Busca riders EN EL SERVIDOR, con límite explícito.
 *
 * Antes, las pantallas de Incidencias y Ausencias cargaban TODOS los
 * riders activos en cada carga (y en cada refresco automático) solo para
 * llenar el desplegable del modal. Con miles de riders eso tenía dos
 * problemas graves:
 *
 *  1. Rendimiento: esa lista se consultaba y se transfería entera a cada
 *     navegador, en cada refresco, de cada persona conectada.
 *  2. Corrección: Supabase (PostgREST) devuelve como máximo 1000 filas
 *     si no se pide un límite explícito, así que la lista se cortaba en
 *     silencio y "faltaban" riders — el mismo fallo que ya corregimos en
 *     Conexiones fuera de zona.
 *
 * Usa el cliente normal (con RLS), así que respeta la zona del admin.
 */
export async function buscarRiders(texto: string): Promise<RiderResultado[]> {
  const supabase = createClient();
  const q = texto.trim().replace(/[%,]/g, '');
  if (q.length < 2) return [];

  const { data } = await supabase
    .from('riders')
    .select('id, nombre, dni')
    .eq('activo', true)
    .or(`dni.ilike.%${q}%,nombre.ilike.%${q}%`)
    .order('nombre')
    .limit(15);

  return (data ?? []).map((r) => ({ id: r.id, nombre: r.nombre, dni: r.dni }));
}
