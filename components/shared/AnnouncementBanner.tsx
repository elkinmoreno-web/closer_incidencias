import { createClient } from '@/lib/supabase/server';

interface Anuncio {
  id: number;
  mensaje: string;
  ciudadNombre: string | null; // null = global
}

/**
 * Banner con los anuncios activos que le corresponden a quien mira, en
 * dos dimensiones independientes:
 * - Zona: globales + los de sus ciudades (admin/moderador), o el global
 *   + el de su propia ciudad (rider). El super_admin ve todos.
 * - Audiencia: un anuncio puede ser para 'todos', solo 'admins' o solo
 *   'riders' (ej. un aviso de gestión interna que no debe ver un rider).
 * Pueden mostrarse varios a la vez, uno debajo del otro.
 */
export async function AnnouncementBanner() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const anuncios = await resolverAnunciosVisibles(supabase, user.id);
  if (anuncios.length === 0) return null;

  return (
    <div className="divide-y divide-amber-200 border-b border-amber-200 bg-amber-50">
      {anuncios.map((a) => (
        <div key={a.id} className="px-6 py-2.5 text-sm font-medium text-amber-900">
          📣 {a.ciudadNombre && <span className="mr-1.5 rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-semibold">{a.ciudadNombre}</span>}
          {a.mensaje}
        </div>
      ))}
    </div>
  );
}

async function resolverAnunciosVisibles(supabase: ReturnType<typeof createClient>, authUserId: string): Promise<Anuncio[]> {
  // ¿Es un admin?
  const { data: admin } = await supabase.from('admins').select('id, rol').eq('auth_user_id', authUserId).maybeSingle();

  if (admin) {
    const { data } = await supabase
      .from('anuncios')
      .select('id, mensaje, ciudad_id, audiencia, ciudades(nombre)')
      .eq('activo', true)
      .in('audiencia', ['todos', 'admins'])
      .order('created_at', { ascending: false });

    if (admin.rol === 'super_admin') return (data ?? []).map(mapAnuncio);

    const { data: misCiudades } = await supabase.from('admin_ciudades').select('ciudad_id').eq('admin_id', admin.id);
    const ciudadIds = (misCiudades ?? []).map((c) => c.ciudad_id);
    return (data ?? []).filter((a) => a.ciudad_id === null || ciudadIds.includes(a.ciudad_id)).map(mapAnuncio);
  }

  // Si no es admin, es un rider: resolver su ciudad a través de su centro.
  const { data: rider } = await supabase.from('riders').select('centro_id').eq('auth_user_id', authUserId).maybeSingle();
  const centroId = rider?.centro_id ?? null;
  let ciudadIdDelRider: number | null = null;
  if (centroId) {
    const { data: centro } = await supabase.from('centros').select('ciudad_id').eq('id', centroId).maybeSingle();
    ciudadIdDelRider = centro?.ciudad_id ?? null;
  }

  const { data } = await supabase
    .from('anuncios')
    .select('id, mensaje, ciudad_id, audiencia, ciudades(nombre)')
    .eq('activo', true)
    .in('audiencia', ['todos', 'riders'])
    .order('created_at', { ascending: false });

  return (data ?? []).filter((a) => a.ciudad_id === null || a.ciudad_id === ciudadIdDelRider).map(mapAnuncio);
}

function mapAnuncio(a: { id: number; mensaje: string; ciudades?: { nombre: string } | { nombre: string }[] | null }): Anuncio {
  const ciudadRel = Array.isArray(a.ciudades) ? a.ciudades[0] : a.ciudades;
  return { id: a.id, mensaje: a.mensaje, ciudadNombre: ciudadRel?.nombre ?? null };
}
