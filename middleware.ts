import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Control de acceso central. Se ejecuta antes de cualquier página protegida.
 * No confiamos solo en esto (RLS en la base de datos es la barrera real),
 * pero evita que alguien sin sesión llegue a ver el HTML del panel.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isDashboardRoute = path.startsWith('/dashboard');
  const isRiderRoute = path.startsWith('/rider/dashboard');

  // Antes se llamaba a updateSession() (una petición de red a Supabase
  // Auth) para CUALQUIER ruta, incluidas /rider/login y /gestor/login
  // que ni siquiera necesitan sesión — si Supabase iba lento, esa
  // llamada colgaba el middleware de TODO el sitio, no solo del panel.
  // Ahora solo se paga ese costo en las rutas realmente protegidas.
  if (!isDashboardRoute && !isRiderRoute) {
    return NextResponse.next();
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
