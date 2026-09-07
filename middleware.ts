import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Control de acceso central. Se ejecuta antes de cualquier página protegida.
 * No confiamos solo en esto (RLS en la base de datos es la barrera real),
 * pero evita que alguien sin sesión llegue a ver el HTML del panel.
 *
 * IMPORTANTE: la comprobación de qué ruta es se hace ANTES de llamar a
 * updateSession() — esta última hace una petición HTTP real a Supabase
 * Auth (auth.getUser()) desde el Edge Runtime, con recursos más
 * restringidos que una función normal. Si esa llamada se colgaba (red,
 * DNS, latencia de Supabase) en una ruta que ni siquiera necesita
 * sesión — como /rider/login o /gestor/login, páginas públicas — el
 * middleware se quedaba esperando hasta el timeout de Vercel (25s),
 * devolviendo 504 en una página que no debería tocar la base de datos
 * para nada. Confirmado como causa real de un 504
 * MIDDLEWARE_INVOCATION_TIMEOUT en /rider/login.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isDashboardRoute = path.startsWith('/dashboard');
  const isRiderRoute = path.startsWith('/rider/dashboard');

  // Rutas públicas (login, marketing, lo que sea que no matchee las dos
  // de arriba): responde de inmediato, SIN llamar a Supabase.
  if (!isDashboardRoute && !isRiderRoute) {
    return NextResponse.next();
  }

  const { response, user, supabase, timedOut } = await updateSession(request);

  // Si Supabase no respondió a tiempo, no se puede saber con certeza si
  // hay sesión o no — se deja pasar la petición en vez de redirigir a
  // login (que sería un falso "no tienes sesión" para alguien que sí la
  // tiene). La página real (Server Component) vuelve a comprobar la
  // sesión con más margen de tiempo, así que la seguridad no depende
  // solo de este paso.
  if (timedOut) {
    return response;
  }

  const { response, user, supabase } = await updateSession(request);

  if (!user) {
    const loginPath = isDashboardRoute ? '/gestor/login' : '/rider/login';
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  if (isDashboardRoute) {
    const { data: admin } = await supabase
      .from('admins')
      .select('id, activo')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!admin || !admin.activo) {
      return NextResponse.redirect(new URL('/gestor/login?error=sin_acceso', request.url));
    }
  }

  if (isRiderRoute) {
    const { data: rider } = await supabase
      .from('riders')
      .select('id, activo')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!rider || !rider.activo) {
      return NextResponse.redirect(new URL('/rider/login?error=sin_acceso', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica a todo excepto archivos estáticos y de imagen, para no
     * frenar esos recursos con una consulta a la base de datos.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)',
  ],
};
