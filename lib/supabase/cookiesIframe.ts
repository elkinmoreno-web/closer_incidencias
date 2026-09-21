import type { CookieOptions } from '@supabase/ssr';

/**
 * Modo "el panel va dentro de un iframe de OTRO sitio".
 *
 * Por defecto las cookies de sesión de Supabase salen con SameSite=Lax,
 * que es lo correcto: una cookie Lax no viaja en peticiones de otro
 * sitio, y eso es media defensa contra CSRF regalada.
 *
 * El precio es que dentro de un iframe ajeno esa cookie tampoco se
 * envía. El resultado no es un error visible: el panel simplemente
 * aparece deslogueado, y si el usuario intenta entrar desde dentro del
 * iframe, la cookie de la respuesta de login también se descarta. Para
 * que funcione hace falta SameSite=None, que obliga a Secure.
 *
 * `partitioned` (CHIPS) guarda la cookie en un compartimento separado
 * por sitio contenedor. Sin ella, Chrome ya está bloqueando cookies de
 * terceros y esto dejaría de funcionar igualmente.
 *
 * ADVERTENCIA: Safari bloquea cookies de terceros por defecto y no
 * atiende a nada de esto. En iPhone el panel empotrado puede seguir sin
 * sesión aunque el modo esté activado. Si hace falta que funcione en
 * todas partes, la solución no es esta bandera: es servir el panel
 * desde el mismo dominio raíz que la app contenedora, y entonces no
 * hace falta tocar ninguna cookie.
 *
 * Es NEXT_PUBLIC_ porque el cliente del navegador también escribe
 * cookies de sesión y tiene que usar las mismas opciones; si solo se
 * cambiaran las del servidor, la sesión se rompería a la primera
 * renovación hecha desde el navegador.
 *
 * Pensada para un despliegue de PREVIEW (una demo, una exposición), no
 * para producción.
 */
export function modoIframeActivo(): boolean {
  return process.env.NEXT_PUBLIC_COOKIES_IFRAME === '1';
}

/** Opciones que hay que fusionar con las que trae Supabase. Vacío = comportamiento de siempre. */
export function opcionesCookieIframe(): CookieOptions {
  if (!modoIframeActivo()) return {};
  return { sameSite: 'none', secure: true, partitioned: true };
}
