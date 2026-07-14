import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { descargarArchivoDrive } from '@/lib/googleDrive';

/**
 * Sirve un archivo guardado en Google Drive, verificando primero que
 * quien lo pide es un admin activo. El archivo en Drive NUNCA se
 * comparte con un enlace público — este endpoint es la única puerta de
 * entrada, y exige sesión válida cada vez, igual que antes exigíamos una
 * URL firmada de Supabase (pero aquí, en vez de caducar a los 5
 * minutos, la barrera es la sesión misma).
 *
 * Uso: /api/drive-file?id=<fileId>
 */
export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get('id');
  if (!fileId) return NextResponse.json({ error: 'Falta el parámetro id' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: admin } = await supabase.from('admins').select('id, activo').eq('auth_user_id', user.id).maybeSingle();
  if (!admin || !admin.activo) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 });

  // Nota: la restricción de ZONA (que un moderador de Madrid no vea un
  // archivo de un registro de Barcelona) ya la garantiza RLS en la
  // consulta que trajo el fileId hasta la página — si no podía ver la
  // fila de la incidencia/ausencia, nunca habría llegado a tener este
  // fileId para pedirlo aquí.

  const archivo = await descargarArchivoDrive(fileId);
  if (!archivo) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });

  return new NextResponse(new Uint8Array(archivo.buffer), {
    headers: {
      'Content-Type': archivo.mimeType,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
