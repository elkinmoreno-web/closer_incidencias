import type { CookieOptions } from '@supabase/ssr';

/**
 * Modo "el panel va dentro de un iframe de OTRO sitio".
 *
 * Por defecto las cookies de sesión de Supabase salen con SameSite=Lax,
 * que es lo correcto: una cookie Lax no viaja en peticiones de otro
 * sitio, y eso es media defensa contra CSRF regalada.
 *
 * El precio es que dentro de un iframe ajeno esa cookie no se envía: el
 * panel aparece deslogueado, y si el usuario intenta entrar desde dentro,
 * la cookie de la respuesta de login también se descarta. Para que viaje
 * hace falta SameSite=None, que obliga a Secure.
 *
 * OJO: dos dominios de *.vercel.app NO son el mismo sitio. vercel.app está
 * en la Lista de Sufijos Públicos (como .com o github.io), así que
 * closerlogistics.vercel.app y panel-closer.vercel.app son para el
 * navegador tan distintos como dos dominios cualesquiera.
 *
 * ── Por qué NO se usa `partitioned` (CHIPS) ──────────────────────────
 *
 * Estuvo puesto y rompió producción el 28-sep-2026: echó a login a todo el
 * que tenía sesión abierta y hubo que revertir el despliegue.
 *
 * Una cookie particionada se guarda en OTRO compartimento del navegador.
 * Quien ya tenía sesión la tenía en el compartimento normal, así que al
 * refrescarse aparecía una SEGUNDA cookie con el mismo nombre en el
 * particionado. El navegador manda las dos, Supabase mezcla dos sesiones
 * distintas, el token no vale y el middleware redirige a login en cada
 * página.
 *
 * Y no se arreglaba solo: al borrar, el código también marcaba la cookie
 * como particionada, así que solo vaciaba el compartimento nuevo. La
 * cookie vieja quedaba atascada hasta caducar, y ni cerrar sesión servía.
 *
 * Sin `partitioned`, cambiar SameSite de Lax a None ACTUALIZA la cookie
 * que ya existía, en el mismo compartimento. No hay segunda cookie.
 *
 * ── Qué navegadores funcionan así ────────────────────────────────────
 *
 *   · Chrome / Edge: sí, con la configuración por defecto.
 *   · Firefox: sí. Su Total Cookie Protection particiona las cookies de
 *     terceros por su cuenta, sin que nosotros lo pidamos.
 *   · Safari / iPhone: NO. Bloquea las cookies de terceros siempre. Para
 *     él la vía es la Storage Access API (un clic del usuario que pide
 *     permiso), no un atributo de cookie.
 *
 * Es NEXT_PUBLIC_ porque el cliente del navegador también escribe
 * cookies de sesión y tiene que usar las mismas opciones; si solo se
 * cambiaran las del servidor, la sesión se rompería a la primera
 * renovación hecha desde el navegador. Por eso mismo, activarlo o
 * desactivarlo exige REDESPLEGAR.
 */
export function modoIframeActivo(): boolean {
  return process.env.NEXT_PUBLIC_COOKIES_IFRAME === '1';
}

/** Opciones que hay que fusionar con las que trae Supabase. Vacío = comportamiento de siempre. */
export function opcionesCookieIframe(): CookieOptions {
  if (!modoIframeActivo()) return {};
  return { sameSite: 'none', secure: true };
}
