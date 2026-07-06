import { createClient } from '@/lib/supabase/server';

/** URL firmada de un único archivo (válida unos minutos). */
export async function getSignedUrl(bucket: string, path: string, expiresIn = 300) {
  const supabase = createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/** URLs firmadas de todos los archivos bajo un prefijo (ej. una ausencia con varios justificantes). */
export async function listSignedUrls(bucket: string, prefix: string, expiresIn = 300) {
  const supabase = createClient();
  const { data: files } = await supabase.storage.from(bucket).list(prefix);
  if (!files || files.length === 0) return [];

  return Promise.all(
    files.map(async (f) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(`${prefix}/${f.name}`, expiresIn);
      return { name: f.name, url: data?.signedUrl ?? null };
    })
  );
}
