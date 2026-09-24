import { NextRequest, NextResponse } from 'next/server';
import { enviarAlertasTphDiarias } from '@/lib/alertasTphCorreo';

/**
 * Aviso diario por correo a los riders con TPH bajo del día anterior.
 *
 * Vercel Cron llama con `Authorization: Bearer <CRON_SECRET>`; sin ese
 * secreto no se hace nada. Importa más que en los otros crons: esta
 * ruta manda correos a personas reales, así que no puede quedar abierta.
 *
 * HORARIO. Los crons de Vercel se expresan en UTC y no admiten zona
 * horaria, pero la hora acordada es "las 9:00 de la mañana en España",
 * que son las 07:00 UTC en verano y las 08:00 UTC en invierno. Por eso
 * en vercel.json hay DOS disparos (07:00 y 08:00 UTC) y es esta ruta la
 * que decide cuál de los dos toca. Así se envía a las 9:00 hora local
 * todo el año, con cambio de hora incluido.
 *
 * La ventana es de las 9 a las 11 y no "solo las 9" porque en el plan
 * Hobby de Vercel la hora del cron solo está garantizada DENTRO de la
 * hora: un disparo puede saltar 50 minutos, y con una ventana justa se
 * habría perdido el aviso de ese día. Abrirla no provoca envíos dobles: la
 * unique (rider_id, fecha) hace que la segunda pasada no encuentre
 * candidatos nuevos y no mande nada.
 *
 * POR QUÉ ES POR LA TARDE (y no por la mañana, como estaba al principio):
 * los datos de un día NO se completan ese día, sino al siguiente, y el
 * pipeline los trae en dos tandas — una hacia las 09:30 con algo más de la
 * mitad, y el resto hacia las 13:30. Con la ventana en 09:00-11:30 el cron
 * ganaba la carrera casi siempre y el aviso salía sobre media jornada: el
 * 21-sep se enviaron 22 correos de 397 riders en rojo, y el 22-sep, 42 de
 * 306. El único día que funcionó (214 de 215) fue aquel en que la carga
 * entró a las 11:01 y el correo salió a las 11:44, por detrás.
 *
 * La ventana va de 13:00 a 19:00 hora de Madrid para cubrir las dos
 * franjas del cambio de hora y las cargas tardías (la más tardía medida,
 * a las 15:23). Quien decide de verdad es la comprobación de completitud
 * de datosFrescos; estos intentos solo le dan varias oportunidades.
 *
 * Parámetros (para pruebas manuales, no los usa el cron):
 *   ?forzar=1        salta SOLO la comprobación de la hora, para lanzarlo a mano
 *   ?simular=1       calcula los destinatarios y NO envía ni registra nada
 *   ?fecha=...       analiza otro día (yyyy-mm-dd) en vez de ayer
 *   ?limite=N        envía como mucho a N riders — para la primera salida
 *                    real a un grupo pequeño antes de abrirlo a todos
 *   ?sin_frescura=1  salta la comprobación de que el pipeline haya escrito hoy
 *
 * `sin_frescura` va aparte de `forzar` a propósito. Antes iban juntas, y
 * eso convertía "lánzalo ahora aunque no sean las 9" en "lánzalo ahora
 * aunque los datos estén a medias" sin que nadie lo pidiera. Con datos
 * incompletos el TPH sale artificialmente bajo y el aviso se le manda a
 * gente que sí cumplió — y un correo enviado no se puede retirar.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secretoEsperado = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secretoEsperado || auth !== `Bearer ${secretoEsperado}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const forzar = params.get('forzar') === '1';
  const simular = params.get('simular') === '1';
  // Lo pone SOLO la última entrada de cron del día en vercel.json. El aviso
  // de "pipeline parado" se manda únicamente desde ese último intento:
  // antes saltaba en el primero, cuando el pipeline todavía no había
  // terminado, así que llegaba un correo falso TODOS los días mientras los
  // intentos siguientes sí enviaban bien. Un aviso que se aprende a
  // ignorar no sirve cuando el fallo es real.
  const ultimoIntento = params.get('ultimo') === '1';
  const fecha = params.get('fecha') ?? undefined;
  const sinFrescura = params.get('sin_frescura') === '1';
  const limiteParam = Number(params.get('limite'));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? Math.floor(limiteParam) : undefined;

  const horaMadrid = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }));
  if (!forzar && !simular && (horaMadrid < 13 || horaMadrid > 18)) {
    return NextResponse.json({ omitido: true, motivo: `En Madrid son las ${horaMadrid}:00, fuera de la ventana de envío (9:00-11:59).` });
  }

  const resultado = await enviarAlertasTphDiarias({ fecha, simular, limite, ignorarFrescura: sinFrescura, ultimoIntento });
  return NextResponse.json(resultado, { status: resultado.exito ? 200 : 500 });
}
