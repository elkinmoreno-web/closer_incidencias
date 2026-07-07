import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Genera una URL firmada temporal para un archivo de un bucket privado.
 * El enlace caduca a los 5 minutos: suficiente para verlo/descargarlo,
 * pero no queda un enlace público permanente circulando por ahí.
 */
export async function getSignedUrl(bucket: string, path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

/**
 * Lista los archivos bajo un prefijo (carpeta) y devuelve cada uno con
 * su URL firmada. Se usa para las ausencias, que pueden tener varios
 * justificantes en la misma "carpeta".
 */
export async function listSignedUrls(bucket: string, prefix: string): Promise<{ name: string; url: string | null }[]> {
  const supabase = createClient();
  const { data: archivos } = await supabase.storage.from(bucket).list(prefix);
  if (!archivos || archivos.length === 0) return [];

  return Promise.all(
    archivos
      .filter((f) => f.name && !f.name.startsWith('.'))
      .map(async (f) => {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(`${prefix}/${f.name}`, 300);
        return { name: f.name, url: data?.signedUrl ?? null };
      })
  );
}
