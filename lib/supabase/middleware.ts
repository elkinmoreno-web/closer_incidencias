import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresca la sesión de Supabase en cada petición y la propaga tanto a la
 * petición actual como a la respuesta, para que las cookies de sesión no
 * caduquen mientras el usuario navega por Server Components.
 *
 * TIMEOUT EXPLÍCITO CON AbortSignal.timeout: se confirmó en producción
 * que auth.getUser() puede colgarse desde el Edge Runtime de Vercel
 * (causa real de un 504 MIDDLEWARE_INVOCATION_TIMEOUT incluso en rutas
 * que sí necesitan sesión, como /rider/dashboard). Siguiendo la
 * recomendación oficial de Vercel para este error exacto ("Optimize
 * external calls... consider specifying a fetch timeout using
 * AbortSignal.timeout"), se inyecta un `fetch` personalizado en el
 * cliente de Supabase (opción `global.fetch`) que aplica el timeout a
 * la petición HTTP real — a diferencia de un `Promise.race` externo,
 * esto CANCELA la petición de verdad (libera el socket) en vez de
 * dejarla corriendo de fondo sin que nadie la espere.
 *
 * Si la petición se cancela por timeout, auth.getUser() lanza un
 * AbortError — se captura y se trata como "sesión no verificable
 * ahora" (timedOut=true): el middleware deja pasar la petición sin
 * bloquear al usuario, y la página real (Server Component) vuelve a
 * comprobar la sesión con más margen, así que la seguridad no depende
 * solo de este paso.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const fetchConTimeout: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(4000) });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchConTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  let timedOut = false;
  try {
    // IMPORTANTE: no borrar esta línea. Refresca el token si ha caducado.
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    // AbortError (por el timeout de arriba) u otro fallo de red —
    // ambos se tratan igual: no se pudo confirmar la sesión a tiempo.
    timedOut = true;
  }

  return { response, user, supabase, timedOut };
}
