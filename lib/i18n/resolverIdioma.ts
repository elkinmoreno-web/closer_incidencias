import 'server-only';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export type Idioma = 'es' | 'en';

const COOKIE_IDIOMA = 'closer_idioma_manual';

/**
 * Resuelve el idioma a usar para la persona autenticada actual:
 *
 * 1. Si eligió manualmente un idioma en esta sesión/navegador (cookie),
 *    ese gana siempre — es una preferencia puntual, nunca sobreescribe
 *    el país real de nadie en la base de datos.
 * 2. Si no, se calcula desde el país de su centro (rider o admin):
 *    centro -> ciudad -> pais. Alemania = inglés, España = español.
 * 3. Si no se puede determinar (sin sesión, sin centro asignado, etc.),
 *    español como valor por defecto — nunca debe romper una pantalla
 *    por no encontrar idioma.
 *
 * Se llama una sola vez por request (Server Component/Server Action),
 * nunca dentro de un bucle sobre filas — mismo principio de rendimiento
 * que ya aplicamos para las zonas de admin.
 */
export async function resolverIdioma(): Promise<Idioma> {
  const cookieStore = cookies();
  const manual = cookieStore.get(COOKIE_IDIOMA)?.value;
  if (manual === 'es' || manual === 'en') return manual;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 'es';

    const admin = createAdminClient();

    // Puede ser un rider o un admin — se intenta cada tabla, la que
    // tenga el auth_user_id correcto es la que aplica.
    const { data: rider } = await admin.from('riders').select('centro_id').eq('auth_user_id', user.id).maybeSingle();
    const { data: adminRow } = await admin.from('admins').select('id').eq('auth_user_id', user.id).maybeSingle();

    let centroId: number | null = rider?.centro_id ?? null;

    if (!centroId && adminRow) {
      // Un admin no tiene centro propio — se usa el centro/ciudad de
      // alguna de sus ciudades asignadas. Si tiene varias (zona mixta
      // España+Alemania), se prioriza español por defecto — un caso
      // así de todas formas necesita el botón de cambio manual.
      const { data: ciudadAdmin } = await admin
        .from('admin_ciudades')
        .select('ciudades(pais)')
        .eq('admin_id', adminRow.id)
        .limit(1)
        .maybeSingle();
      const pais = (ciudadAdmin?.ciudades as unknown as { pais: string } | null)?.pais;
      return pais === 'DE' ? 'en' : 'es';
    }

    if (!centroId) return 'es';

    const { data: centro } = await admin.from('centros').select('ciudades(pais)').eq('id', centroId).maybeSingle();
    const pais = (centro?.ciudades as unknown as { pais: string } | null)?.pais;
    return pais === 'DE' ? 'en' : 'es';
  } catch {
    // Nunca dejar que un fallo al resolver idioma rompa la pantalla —
    // español como respaldo seguro.
    return 'es';
  }
}

/** Guarda la preferencia manual de idioma para esta sesión/navegador (no toca el país real de la persona en la base de datos). */
export async function establecerIdiomaManual(idioma: Idioma) {
  cookies().set(COOKIE_IDIOMA, idioma, { maxAge: 60 * 60 * 24 * 365, path: '/' });
}

/**
 * Versión ligera para páginas SIN sesión (login) — antes de
 * autenticarse no hay centro/país que consultar, así que solo se
 * respeta la preferencia manual ya guardada (si el navegador la
 * tenía de una visita anterior); español por defecto.
 */
export function resolverIdiomaSinSesion(): Idioma {
  const manual = cookies().get(COOKIE_IDIOMA)?.value;
  return manual === 'es' || manual === 'en' ? manual : 'es';
}
