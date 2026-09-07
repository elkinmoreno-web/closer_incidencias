import { NextRequest, NextResponse } from 'next/server';
import { leerHojaRidersGoogleSheets } from '@/lib/googleSheets';
import { mapearFilasExcel } from '@/lib/xlsxImport';
import { importarRidersLoteInterno } from '@/app/dashboard/riders/actions';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Sincroniza riders desde el Google Sheets de RRHH (pestaña "BBDD") —
 * NO se dispara con el cron nativo de Vercel (que en el plan gratuito
 * limita a 2 ejecuciones/día), sino por un Apps Script en la cuenta
 * del usuario, usando UrlFetchApp con un trigger de tiempo configurado
 * en los horarios reales de actualización (ej. 08:00 y 10:00) — así
 * no depende del plan de Vercel para nada.
 *
 * Protegido igual que el resto de crons: exige
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secretoEsperado = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secretoEsperado || auth !== `Bearer ${secretoEsperado}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const filasCrudas = await leerHojaRidersGoogleSheets();
    if (filasCrudas.length === 0) {
      const resultado = { exito: false, error: 'La hoja no devolvió filas (¿pestaña vacía o nombre incorrecto?).' };
      await admin.from('riders_sync_log').insert({ exito: false, error_general: resultado.error });
      return NextResponse.json(resultado, { status: 200 });
    }

    const { validas, errores: erroresMapeo } = mapearFilasExcel(filasCrudas);
    const resultadoImport = await importarRidersLoteInterno(validas);

    await admin.from('riders_sync_log').insert({
      exito: true,
      creados: resultadoImport.creados,
      actualizados: resultadoImport.actualizados,
      sin_centro: resultadoImport.sinCentro,
      errores: [...erroresMapeo, ...resultadoImport.errores],
    });

    return NextResponse.json({
      exito: true,
      filasLeidas: filasCrudas.length,
      filasValidas: validas.length,
      ...resultadoImport,
      erroresMapeo,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await admin.from('riders_sync_log').insert({ exito: false, error_general: mensaje });
    return NextResponse.json({ exito: false, error: mensaje }, { status: 500 });
  }
}
