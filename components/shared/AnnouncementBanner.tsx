import { createClient } from '@/lib/supabase/server';

/** Banner con el anuncio global activo (si hay alguno). Se usa en ambos portales. */
export async function AnnouncementBanner() {
  const supabase = createClient();
  const { data } = await supabase
    .from('anuncios')
    .select('id, mensaje')
    .eq('activo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm font-medium text-amber-900">
      📣 {data.mensaje}
    </div>
  );
}
