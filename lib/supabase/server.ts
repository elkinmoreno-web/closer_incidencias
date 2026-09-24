import { cache } from 'react';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { opcionesCookieIframe } from '@/lib/supabase/cookiesIframe';
import type { Database } from '@/lib/types';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Lee/escribe la sesión desde las cookies HTTP-only de la petición.
 *
 * Va envuelto en React.cache() a propósito: dentro de UNA petición todas
 * las llamadas devuelven el MISMO cliente.
 *
 * Sin esto, una sola carga del panel creaba ocho o más clientes
 * independientes (el layout, la page, cada helper de lib/modulos.ts, cada
 * getRiderActual...). Cada cliente monta su propio gestor de sesión y, al
 * usarse por primera vez, lee la sesión de las cookies; si el token está
 * a punto de caducar, TODOS lanzan un refresco a la vez. Supabase rota el
 * token de refresco en cada uno, así que solo el primero vale y los demás
 * se descartan con `AuthRefreshDiscardedError` (409) — el error que salía
 * repetido en los logs de producción.
 *
 * Además de callar ese ruido, evita el riesgo de fondo: con refrescos
 * simultáneos se puede perder el token bueno y echar al usuario a la
 * pantalla de login sin motivo.
 */
export const createClient = cache(() => {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...opcionesCookieIframe() })
            );
          } catch {
            // Se llama desde un Server Component sin permiso de escritura;
            // el middleware ya se encarga de refrescar la sesión en ese caso.
          }
        },
      },
    }
  );
});

/**
 * Cliente con privilegios de administrador total (service_role).
 * SOLO para usarse en Server Actions muy concretas (ej. crear un usuario
 * de Auth para un rider nuevo). Nunca se expone al navegador y nunca
 * debe usarse para leer/escribir datos normales: eso siempre pasa por
 * el cliente normal + RLS.
 */
export function createAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

/**
 * Usuario autenticado actual, cacheado con React.cache() — dentro de
 * una misma petición (ej. el layout y la page se renderizan como parte
 * del mismo request), llamar a esto varias veces solo golpea la red de
 * Supabase Auth UNA vez; las siguientes llamadas devuelven el mismo
 * resultado ya resuelto, sin round-trip adicional. Antes, cada archivo
 * (middleware, layout, page, cada Server Action) hacía su propia
 * llamada a auth.getUser(), multiplicando innecesariamente las
 * peticiones de una sola carga de página.
 */
export const getUsuarioAutenticado = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Fila de `admins` del usuario autenticado actual (o null si no es
 * admin o no está autenticado). También cacheado por petición — el
 * layout, la page y cualquier chequeo de permisos dentro de la misma
 * carga reutilizan el mismo resultado.
 */
export const getAdminActual = cache(async () => {
  const user = await getUsuarioAutenticado();
  if (!user) return null;
  const supabase = createClient();
  const { data: admin } = await supabase.from('admins').select('id, usuario, rol, activo').eq('auth_user_id', user.id).maybeSingle();
  return admin ? { ...admin, email: user.email ?? null } : null;
});

/** Fila de `riders` del usuario autenticado actual (o null). Cacheado por petición, igual que getAdminActual. */
export const getRiderActual = cache(async () => {
  const user = await getUsuarioAutenticado();
  if (!user) return null;
  const supabase = createClient();
  const { data: rider } = await supabase.from('riders').select('id, nombre, dni, activo').eq('auth_user_id', user.id).maybeSingle();
  return rider;
});
