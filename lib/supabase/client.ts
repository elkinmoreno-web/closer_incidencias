import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';

/**
 * Cliente de Supabase para Client Components (navegador).
 * Usa la clave "anon": es pública a propósito, la seguridad real la
 * garantiza RLS en la base de datos, no el secreto de esta clave.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
