import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAdminActual } from '@/lib/supabase/server';
import { urlAutorizacionGmail, COOKIE_ESTADO_GMAIL } from '@/lib/gmailPropio';
import { CORREOS_GESTION_RECLAMACIONES } from '@/lib/utils';

/**
 * Primer paso de "Conectar mi Gmail": manda a Google con un `state`
 * aleatorio que se guarda también en una cookie. Al volver, el callback
 * exige que coincidan: así nadie puede colarle a un admin una autorización
 * iniciada por otro.
 */
export async function GET(request: NextRequest) {
  const yo = await getAdminActual();
  if (!yo?.activo || !yo.email) return NextResponse.redirect(new URL('/gestor/login', request.url));
  if (!CORREOS_GESTION_RECLAMACIONES.includes(yo.email)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 });
  }

  const estado = randomBytes(24).toString('base64url');
  const respuesta = NextResponse.redirect(urlAutorizacionGmail(request.nextUrl.origin, estado, yo.email));
  respuesta.cookies.set(COOKIE_ESTADO_GMAIL, estado, {
    httpOnly: true,
    secure: true,
    // lax: la vuelta desde Google es una navegación normal y la lleva.
    sameSite: 'lax',
    path: '/api/gmail',
    maxAge: 600,
  });
  return respuesta;
}
