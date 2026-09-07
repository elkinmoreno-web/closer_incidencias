import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresca la sesión de Supabase en cada petición y la propaga tanto a la
 * petición actual como a la respuesta, para que las cookies de sesión no
 * caduquen mientras el usuario navega por Server Components.
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
      // Sin esto, una llamada lenta o colgada a Supabase Auth bloqueaba
      // el middleware hasta el timeout de la plataforma (25s en
      // Vercel) — causa real de los 504 MIDDLEWARE_INVOCATION_TIMEOUT
      // vistos en producción. Con AbortSignal.timeout, la petición
      // falla rápido (8s) y sigue como "sin sesión" en vez de colgar
      // TODA la respuesta.
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    }
  );

  // IMPORTANTE: no borrar esta línea. Refresca el token si ha caducado.
  // Si falla (timeout, Supabase caído, etc.) se trata como "sin
  // sesión" — el middleware redirige a login como si no hubiera
  // cookie, en vez de tumbar toda la petición con un 504. RLS sigue
  // siendo la barrera real de todas formas.
  let user = null;
  try {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  } catch (e) {
    console.error('[middleware] auth.getUser() falló (timeout o Supabase caído):', e instanceof Error ? e.message : e);
  }

  return { response, user, supabase };
}
