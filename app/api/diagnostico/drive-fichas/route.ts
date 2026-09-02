import { NextRequest, NextResponse } from 'next/server';
import { archivoExisteYEsAccesible } from '@/lib/googleDrive';

/**
 * Diagnóstico temporal: confirma si GOOGLE_DRIVE_FICHAS_FOLDER_ID es
 * accesible para la cuenta OAuth del CRM — sin esto, cualquier
 * intento de crear una carpeta DENTRO de esa raíz da 404 (Google
 * devuelve 404 al crear un hijo de un padre que la cuenta no puede
 * ver, no 403), que es justo el error que se estaba viendo y que no
 * se resolvía tocando el resto del flujo (búsqueda por nombre, mapa
 * de IDs de gestor, parámetros de subida) porque el problema estaba
 * un nivel más arriba: la propia carpeta raíz.
 *
 * Protegido igual que el cron — exige el mismo CRON_SECRET, para que
 * nadie más pueda consultar esto llamando a la URL directamente.
 * Borrar este endpoint cuando ya no haga falta diagnosticar.
 */
export async function GET(request: NextRequest) {
  const secretoEsperado = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secretoEsperado || auth !== `Bearer ${secretoEsperado}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const raizId = process.env.GOOGLE_DRIVE_FICHAS_FOLDER_ID;
  if (!raizId) {
    return NextResponse.json({ ok: false, motivo: 'GOOGLE_DRIVE_FICHAS_FOLDER_ID no está configurada en este entorno.' });
  }

  const accesible = await archivoExisteYEsAccesible(raizId);
  return NextResponse.json({
    ok: accesible,
    raizId,
    motivo: accesible
      ? 'La carpeta raíz es accesible para la cuenta OAuth del CRM.'
      : 'La carpeta raíz NO es accesible para la cuenta OAuth del CRM — hay que compartirla con esa cuenta, o revisar que el ID sea correcto.',
  });
}
