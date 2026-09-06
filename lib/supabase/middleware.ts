import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresca la sesión de Supabase en cada petición y la propaga tanto a la
 * petición actual como a la respuesta, para que las cookies de sesión no
 * caduquen mientras el usuario navega por Server Components.
 *
 * TIMEOUT EXPLÍCITO: se confirmó en producción que auth.getUser() puede
 * colgarse desde el Edge Runtime de Vercel (causa real de un 504
 * MIDDLEWARE_INVOCATION_TIMEOUT incluso en rutas que sí necesitan
 * sesión, como /rider/dashboard) — el middleware no tenía ningún límite
 * propio y esperaba hasta que Vercel cortaba a los 25s. Aquí se le pone
 * un límite de 4s: si Supabase no responde a tiempo, se trata como
 * "sesión no verificable ahora" (timedOut=true) en vez de colgar la
 * petición — el middleware, al ver esto, deja pasar la petición sin
 * bloquear al usuario; la página en sí (Server Component) vuelve a
 * comprobar la sesión con más margen, así que la seguridad no depende
 * solo de este paso.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  const timeoutMs = 4000;
  const resultado = await Promise.race([
    supabase.auth.getUser().then((r) => ({ timedOut: false as const, user: r.data.user })),
    new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), timeoutMs)),
  ]);

  const user = resultado.timedOut ? null : resultado.user;

  return { response, user, supabase, timedOut: resultado.timedOut };
}
