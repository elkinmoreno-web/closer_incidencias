import { NextRequest, NextResponse } from 'next/server';
import { getAdminActual } from '@/lib/supabase/server';
import { guardarConexionGmail, COOKIE_ESTADO_GMAIL } from '@/lib/gmailPropio';
import { CORREOS_GESTION_RECLAMACIONES } from '@/lib/utils';

/**
 * Vuelta desde Google tras "Conectar mi Gmail". Comprueba el `state`,
 * guarda el permiso y devuelve a Reclamaciones con el resultado en la URL
 * (?gmail=ok o ?gmail=error&motivo=...), que pinta GmailConexion.
 */
export async function GET(request: NextRequest) {
  const volver = (params: Record<string, string>) => {
    const url = new URL('/dashboard/reclamaciones', request.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = NextResponse.redirect(url);
    r.cookies.delete({ name: COOKIE_ESTADO_GMAIL, path: '/api/gmail' });
    return r;
  };

  const yo = await getAdminActual();
  if (!yo?.activo || !yo.email || !CORREOS_GESTION_RECLAMACIONES.includes(yo.email)) {
    return NextResponse.redirect(new URL('/gestor/login', request.url));
  }

  const q = request.nextUrl.searchParams;
  // Cancelar en la pantalla de Google vuelve con ?error=access_denied.
  if (q.get('error')) return volver({ gmail: 'error', motivo: 'Has cancelado la conexión en Google.' });

  const estado = q.get('state');
  if (!estado || estado !== request.cookies.get(COOKIE_ESTADO_GMAIL)?.value) {
    return volver({ gmail: 'error', motivo: 'La conexión ha caducado. Vuelve a pulsar "Conectar mi Gmail".' });
  }
  const codigo = q.get('code');
  if (!codigo) return volver({ gmail: 'error', motivo: 'Google no devolvió la autorización.' });

  const r = await guardarConexionGmail(yo.id, yo.email, codigo, request.nextUrl.origin);
  return 'error' in r ? volver({ gmail: 'error', motivo: r.error }) : volver({ gmail: 'ok' });
}
