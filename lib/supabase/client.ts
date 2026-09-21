import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';
import { opcionesCookieIframe } from '@/lib/supabase/cookiesIframe';

/**
 * Cliente de Supabase para Client Components (navegador).
 * Usa la clave "anon": es pública a propósito, la seguridad real la
 * garantiza RLS en la base de datos, no el secreto de esta clave.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Las cookies que escribe el navegador tienen que salir con las
    // mismas opciones que las del servidor; si no, la sesión se rompe
    // en cuanto el cliente renueva el token.
    { cookieOptions: opcionesCookieIframe() }
  );
}
