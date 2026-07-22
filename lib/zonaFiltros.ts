import 'server-only';
import { createClient, getAdminActual } from '@/lib/supabase/server';
import type { Centro, Ciudad } from '@/lib/types';

/**
 * Devuelve las ciudades y centros que el admin/moderador de la sesión
 * puede ver, acotados a su zona. El super_admin ve todo; el resto solo
 * lo de sus ciudades asignadas.
 *
 * Esto es para poblar los DESPLEGABLES de filtros (ciudad/centro) de las
 * tablas y los formularios de alta. El acceso a los datos en sí ya lo
 * protege RLS; esto solo evita que a un gestor de Madrid le aparezcan en
 * el selector las ciudades y centros de toda España, que no le sirven.
 */
export async function ciudadesYCentrosDeMiZona(): Promise<{
  esSuperAdmin: boolean;
  ciudades: Ciudad[];
  centros: Centro[];
}> {
  const supabase = createClient();
  const yo = await getAdminActual();
  if (!yo) return { esSuperAdmin: false, ciudades: [], centros: [] };

  const esSuperAdmin = yo.rol === 'super_admin';

  if (esSuperAdmin) {
    const [{ data: ciudades }, { data: centros }] = await Promise.all([
      supabase.from('ciudades').select('*').order('nombre'),
      supabase.from('centros').select('*, ciudades(id, nombre)').eq('activo', true).order('nombre'),
    ]);
    return { esSuperAdmin: true, ciudades: (ciudades ?? []) as Ciudad[], centros: (centros ?? []) as Centro[] };
  }

  const { data: misCiudades } = await supabase.from('admin_ciudades').select('ciudad_id').eq('admin_id', yo!.id);
  const ciudadIds = (misCiudades ?? []).map((c) => c.ciudad_id);
  if (ciudadIds.length === 0) return { esSuperAdmin: false, ciudades: [], centros: [] };

  const [{ data: ciudades }, { data: centros }] = await Promise.all([
    supabase.from('ciudades').select('*').in('id', ciudadIds).order('nombre'),
    supabase.from('centros').select('*, ciudades(id, nombre)').in('ciudad_id', ciudadIds).eq('activo', true).order('nombre'),
  ]);

  return { esSuperAdmin: false, ciudades: (ciudades ?? []) as Ciudad[], centros: (centros ?? []) as Centro[] };
}
