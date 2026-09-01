import { NextRequest, NextResponse } from 'next/server';
import { sincronizarZonasConexion } from '@/lib/zonasConexion';

/**
 * Cron semanal, cada lunes (ver vercel.json), que sincroniza las
 * zonas de conexión desde el mapa de Google Drive.
 *
 * Vercel Cron llama a este endpoint con un header
 * `Authorization: Bearer <CRON_SECRET>` — se exige ese secreto para
 * que nadie más pueda disparar la sincronización llamando a la URL
 * directamente.
 */
export async function GET(request: NextRequest) {
  const secretoEsperado = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secretoEsperado || auth !== `Bearer ${secretoEsperado}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const resultado = await sincronizarZonasConexion();
  return NextResponse.json(resultado, { status: resultado.exito ? 200 : 500 });
}
