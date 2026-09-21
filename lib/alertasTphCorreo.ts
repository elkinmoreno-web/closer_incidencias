import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { enviarCorreoGmail } from '@/lib/googleMail';
import { mensajeError } from '@/lib/utils';

/**
 * Aviso automático por correo a los riders con TPH bajo (el "rojo" del
 * semáforo de Alertas) del día anterior.
 *
 * Decisiones que conviene no deshacer sin pensarlo:
 *
 * · Se exige un mínimo de horas conectado (correo_horas_min). Sin él, el
 *   aviso le llegaría a gente que se conectó veinte minutos, a quien
 *   decirle que "el volumen de pedidos no equivale a las horas que pasas
 *   activo" es sencillamente falso — y un correo falso quema el canal
 *   para los 300 a los que sí les aplica.
 *
 * · El envío es idempotente: antes de escribir se registra la fila en
 *   alertas_tph_correos, que tiene unique (rider_id, fecha). Dispararlo
 *   dos veces no manda dos correos. Esto importa más de lo normal porque
 *   son correos a personas reales: un duplicado no se puede deshacer.
 *
 * · Hay un interruptor maestro en base de datos (correo_activo) y un
 *   modo de pruebas por variable de entorno. Mientras se ajusta, todo
 *   va a una única dirección de pruebas y no se toca a ningún rider.
 */

/** Nombre visible del remitente. La dirección la fija GOOGLE_MAIL_FROM_ADDRESS (Gmail no deja suplantar otra). */
const ALIAS_REMITENTE = 'Closer Logistics · Operaciones';

/**
 * A dónde van las respuestas de los riders.
 *
 * Sin esto, las respuestas caen en el buzón personal de quien autorizó
 * la cuenta de Gmail — que es lo que pasó el primer día de envío real.
 * La dirección del remitente no se puede cambiar (Gmail la firma con la
 * cuenta autenticada), pero el Reply-To sí es libre, así que es la única
 * palanca para que no acaben donde no toca.
 *
 * Apúntala SOLO a un buzón que alguien lea de verdad. Si se deja vacía,
 * las respuestas siguen yendo a la cuenta remitente: el correo ya pide
 * no responder y remite al gestor de flota, pero alguno responderá igual
 * y conviene que ese alguno no se quede sin respuesta si tiene un
 * problema real con la app.
 */
function responderA(): string | undefined {
  return process.env.ALERTAS_TPH_REPLY_TO?.trim() || undefined;
}

/**
 * Ritmo de envío, en correos por minuto.
 *
 * La cuota que manda es `totalQueryCostPerMinutePerUser`: 6.000 unidades
 * por minuto y por usuario, y un messages.send cuesta 100 → el techo
 * duro son 60 correos/minuto. Se deja en 50 para tener margen: el
 * contador es del PROYECTO de Google, así que los correos de Stock y
 * cualquier otra cosa que envíe también consumen de ahí.
 *
 * Medido en producción el 21-sep: con una pausa fija de 400 ms salieron
 * 64 y 62 correos en dos minutos seguidos y Gmail cortó con 403 en 19 de
 * 209. Una pausa fija no sirve porque la latencia de la API varía; lo
 * que hay que fijar es el hueco entre ARRANQUES de cada envío.
 */
const CORREOS_POR_MINUTO = 50;
const MS_ENTRE_ENVIOS = Math.ceil(60000 / CORREOS_POR_MINUTO);

/**
 * Presupuesto de tiempo de la ejecución, por debajo del maxDuration de
 * la función (300 s).
 *
 * Importa más de lo que parece: la fila se reserva ANTES de enviar, así
 * que si la función muere entre el insert y el envío, ese rider queda
 * marcado como avisado sin haber recibido nada — y nadie se entera. Al
 * parar por las buenas antes del límite eso no puede pasar, y lo que
 * quede lo recoge el siguiente disparo del cron, que es idempotente.
 */
const PRESUPUESTO_MS = 240000;

/** Tope de seguridad por ejecución: si un día el criterio se afloja por error, no se mandan miles de correos de golpe. */
const MAX_CORREOS_POR_EJECUCION = 800;

/** Cuántos correos reales se mandan en modo de pruebas (todos a la misma dirección; no hace falta recibir 370). */
const MAX_CORREOS_EN_PRUEBAS = 3;

export interface DestinatarioTph {
  rider_id: string;
  nombre: string;
  email: string;
  centro_id: number | null;
  centro: string | null;
  online_hours: number;
  num_of_trips: number;
  tph: number;
}

export interface ResultadoAlertaTph {
  exito: boolean;
  fecha: string;
  modo: 'produccion' | 'prueba' | 'desactivado';
  candidatos: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
  errores: string[];
  /** En pruebas, a quién se le habría escrito de verdad. */
  muestra?: { nombre: string; email: string; tph: number; horas: number; pedidos: number }[];
}

/** Fecha de ayer en horario de Madrid, en yyyy-mm-dd. */
export function ayerEnMadrid(): string {
  const ahora = new Date();
  const madrid = new Date(ahora.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  madrid.setDate(madrid.getDate() - 1);
  const y = madrid.getFullYear();
  const m = String(madrid.getMonth() + 1).padStart(2, '0');
  const d = String(madrid.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const fmtDMY = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const num = (n: number, dec = 2) => n.toFixed(dec).replace('.', ',');

/** Escapa lo que venga de la base de datos antes de meterlo en el HTML del correo. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** El nombre de pila basta: "Hola Juan" lee mucho mejor que el nombre completo en mayúsculas del Excel de RRHH. */
export function nombrePila(nombreCompleto: string): string {
  const limpio = nombreCompleto.trim().split(/\s+/)[0] ?? '';
  if (!limpio) return '';
  return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
}

/**
 * Asunto. Corto, serio y sin nombre: el móvil corta sobre los 40
 * caracteres, así que todo lo que no sea la advertencia estorba. Entero
 * cabe en la vista previa de la bandeja, que es donde tiene que hacer
 * su trabajo.
 *
 * Recibe el nombre por compatibilidad con quien ya la llama; hoy no lo
 * usa a propósito.
 */
export function asuntoAlertaTph(_nombre: string): string {
  return '⚠️ Aviso: TPH por debajo del mínimo exigido';
}

/**
 * Cuerpo del correo. El texto es el acordado con operaciones, palabra
 * por palabra; lo único que se añade es el recuadro con las cifras
 * reales del rider, para que el aviso sea comprobable y no una frase
 * genérica que se pueda ignorar.
 */
export function plantillaAlertaTph(d: DestinatarioTph, fechaIso: string): string {
  // Versión corta y en tono de advertencia. El primer párrafo va en
  // negrita y va solo: es lo único que se lee seguro, así que tiene que
  // bastar por sí mismo para que el rider entienda que esto es un aviso
  // y no un boletín. Justo debajo van sus cifras, y solo después el
  // detalle de qué hacer.
  const aviso =
    'Tu TPH (pedidos por hora) está por debajo del mínimo exigido: completas muy pocos pedidos para el tiempo que pasas activo.';

  const parrafos = [
    'Esto incumple los estándares operativos y debe corregirse de inmediato. Ubícate en zonas de mayor demanda —áreas de restaurantes— y acepta los pedidos con agilidad para evitar tiempos muertos en tu jornada.',
    'Haremos seguimiento de tu evolución en los próximos días. Si tienes un problema técnico con la aplicación que te impida trabajar con normalidad, comunícaselo a tu gestor de flota para que pueda revisarlo.',
  ]
    .map((p) => `<p style="margin:0 0 14px;color:#2C3E50;font-size:14px;line-height:1.6">${p}</p>`)
    .join('');

  const dato = (etiqueta: string, valor: string, destacado = false) => `
    <td style="padding:10px 12px;text-align:center;border-right:1px solid #E1E8EB">
      <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.04em">${etiqueta}</div>
      <div style="font-size:19px;font-weight:700;color:${destacado ? '#D6402F' : '#2C3E50'};margin-top:2px">${valor}</div>
    </td>`;

  return `
  <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#F4F7F8;padding:32px 16px">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E1E8EB">
      <div style="background:#7BB4B8;padding:16px 24px">
        <p style="margin:0;color:#FFFFFF;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.85">Closer Logistics</p>
      </div>

      <div style="padding:24px">
        <p style="margin:0 0 14px;color:#2C3E50;font-size:14px;line-height:1.6">Hola ${esc(nombrePila(d.nombre))},</p>
        <p style="margin:0 0 18px;color:#2C3E50;font-size:15px;font-weight:700;line-height:1.55">${aviso}</p>

        <div style="margin:0 0 6px;font-size:12px;color:#64748B">Tus datos del ${fmtDMY(fechaIso)}</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #E1E8EB;border-left:3px solid #D6402F;border-radius:10px;overflow:hidden;background:#F9FBFB;margin-bottom:18px">
          <tr>
            ${dato('Horas online', num(d.online_hours, 1))}
            ${dato('Pedidos', String(d.num_of_trips))}
            ${dato('Pedidos / hora', num(d.tph), true)}
          </tr>
        </table>

        ${parrafos}

        <p style="margin:18px 0 0;color:#2C3E50;font-size:14px;line-height:1.6">Un saludo,<br>El equipo de Closer Logistics</p>
      </div>

      <div style="padding:12px 24px;background:#F4F7F8;border-top:1px solid #E1E8EB">
        <p style="margin:0;font-size:11px;color:#94A3B8">Aviso automático generado a partir de tus métricas de conexión. <b>No respondas a este correo</b>, es un buzón que no se atiende: si crees que hay un error o tienes cualquier problema, contacta con tu gestor de flota.</p>
      </div>
    </div>
  </div>`;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintenta un envío ante errores temporales de Gmail.
 *
 * El límite diario de la cuenta lo comparte TODO lo que envía ese
 * usuario (la API y su Gmail normal), así que un 429
 * "User-rate limit exceeded (Mail sending)" es perfectamente posible en
 * una tanda larga. Sin reintento, ese rider se quedaba sin aviso por un
 * pico de medio segundo.
 */
async function conReintento(accion: () => Promise<void>, intentos = 3): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await accion();
      return;
    } catch (e) {
      // Gmail devuelve el exceso de cuota como 403 con reason
      // rateLimitExceeded, NO como 429. Buscar solo 429 hacía que el
      // reintento no saltara nunca justo cuando más falta hacía.
      const texto = String(e);
      const temporal = /HTTP (429|5\d\d)/.test(texto) || /rateLimitExceeded|RATE_LIMIT_EXCEEDED/i.test(texto);
      if (!temporal || i >= intentos) throw e;
      // Si es la cuota del minuto la que se agotó, no sirve esperar dos
      // segundos: hay que dejar que la ventana se renueve.
      const esCuota = /rateLimitExceeded|RATE_LIMIT_EXCEEDED/i.test(texto);
      await esperar(esCuota ? 20000 * i : 2000 * i);
    }
  }
}

/**
 * Comprueba que los datos del día que vamos a analizar estén asentados.
 *
 * El pipeline externo escribe a lo largo de la mañana, y un día entra
 * PARCIAL y se completa al día siguiente. Si el cron se adelanta al
 * pipeline, calcularíamos el TPH sobre una jornada a medias y le
 * escribiríamos a riders que en realidad cumplieron: un falso positivo
 * que no se puede retirar una vez enviado el correo.
 *
 * Por eso se exige que driver_daily_stats se haya escrito HOY antes de
 * mandar nada.
 */
async function datosFrescos(supabase: ReturnType<typeof createAdminClient>): Promise<{ ok: boolean; ultima: string | null }> {
  const { data } = await supabase
    .from('driver_daily_stats')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.created_at) return { ok: false, ultima: null };

  const ultima = new Date(data.created_at);
  const hoyMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const ultimaMadrid = ultima.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  return { ok: ultimaMadrid >= hoyMadrid, ultima: data.created_at };
}

/**
 * Avisa por correo de que el pipeline de métricas no ha escrito hoy, para
 * que alguien lo lance a mano.
 *
 * Sin esto, el fallo era SILENCIOSO: el cron detectaba datos viejos, no
 * enviaba nada (bien) y devolvía el motivo en un JSON que no lee nadie —
 * los logs de Vercel duran una hora en Hobby. El resultado es que los
 * riders se quedan sin aviso ese día y nadie se entera hasta que alguien
 * lo mira por casualidad.
 *
 * Se manda UNA vez al día: la clave primaria de alertas_pipeline_avisos
 * es la fecha, así que el segundo disparo del cron no repite el correo.
 * Un aviso que llega dos veces se aprende a ignorar.
 */
async function avisarPipelineParado(
  supabase: ReturnType<typeof createAdminClient>,
  fechaDatos: string,
  ultimaEscritura: string | null
): Promise<boolean> {
  const destino = process.env.ALERTAS_PIPELINE_EMAIL?.trim();
  if (!destino) return false;

  const hoyMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

  // Se reserva el hueco ANTES de enviar: si falla la escritura después del
  // envío, mañana volvería a avisar igual, que es lo de menos.
  const { error } = await supabase
    .from('alertas_pipeline_avisos')
    .insert({ fecha: hoyMadrid, ultima_escritura: ultimaEscritura });
  if (error) return false; // ya se avisó hoy (choque con la primary key)

  const ultima = ultimaEscritura
    ? new Date(ultimaEscritura).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
    : 'nunca';

  const html = `
  <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#F4F7F8;padding:32px 16px">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E1E8EB">
      <div style="background:#D6402F;padding:16px 24px">
        <p style="margin:0;color:#FFFFFF;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Closer Logistics · Aviso interno</p>
      </div>
      <div style="padding:24px;color:#2C3E50;font-size:14px;line-height:1.6">
        <p style="margin:0 0 14px;font-weight:700">El pipeline de métricas no ha escrito hoy, así que NO se ha enviado el aviso de TPH a los riders.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:5px 0;color:#64748B;width:170px">Última escritura</td><td style="padding:5px 0;font-weight:600">${esc(ultima)}</td></tr>
          <tr><td style="padding:5px 0;color:#64748B">Día que se iba a analizar</td><td style="padding:5px 0;font-weight:600">${fmtDMY(fechaDatos)}</td></tr>
        </table>
        <p style="margin:16px 0 0">Lanza el pipeline a mano. Cuando haya escrito, el aviso a los riders se puede disparar en el momento sin esperar a mañana.</p>
      </div>
    </div>
  </div>`;

  try {
    await enviarCorreoGmail([destino], '⚠️ El pipeline de métricas no ha corrido hoy', html, { alias: ALIAS_REMITENTE });
    return true;
  } catch (e) {
    // Si el aviso no sale, se libera el hueco para poder reintentarlo.
    await supabase.from('alertas_pipeline_avisos').delete().eq('fecha', hoyMadrid);
    console.error('[avisarPipelineParado]', mensajeError(e));
    return false;
  }
}

export interface OpcionesEnvioTph {
  /** Día de los datos a analizar (yyyy-mm-dd). Por defecto, ayer en Madrid. */
  fecha?: string;
  /** Calcula y devuelve los destinatarios sin enviar ni registrar nada. */
  simular?: boolean;
  /** Salta la comprobación de frescura del pipeline. Solo para pruebas manuales. */
  ignorarFrescura?: boolean;
  /** Tope de correos de esta ejecución. Sirve para la primera salida real a un grupo pequeño. */
  limite?: number;
}

/**
 * Punto de entrada del aviso diario.
 *
 * Modo de pruebas: si existe ALERTAS_TPH_EMAIL_PRUEBA, TODOS los correos
 * van a esa dirección (como mucho MAX_CORREOS_EN_PRUEBAS), no se toca a
 * ningún rider y no se registra nada en alertas_tph_correos — así el
 * envío real del día siguiente no se queda bloqueado por las pruebas.
 */
export async function enviarAlertasTphDiarias(opciones: OpcionesEnvioTph = {}): Promise<ResultadoAlertaTph> {
  const supabase = createAdminClient();
  const fecha = opciones.fecha ?? ayerEnMadrid();
  const emailPrueba = process.env.ALERTAS_TPH_EMAIL_PRUEBA?.trim() || null;
  const errores: string[] = [];

  const base: ResultadoAlertaTph = {
    exito: true,
    fecha,
    modo: emailPrueba ? 'prueba' : 'produccion',
    candidatos: 0,
    enviados: 0,
    fallidos: 0,
    omitidos: 0,
    errores,
  };

  const { data: params } = await supabase
    .from('alertas_parametros')
    .select('correo_tph_max, correo_horas_min, correo_activo')
    .eq('id', 1)
    .maybeSingle();

  const tphMax = Number(params?.correo_tph_max ?? 1);
  const horasMin = Number(params?.correo_horas_min ?? 0.75);
  const activo = params?.correo_activo ?? false;

  // El interruptor maestro solo frena el envío REAL. En modo de pruebas
  // se puede seguir trabajando con él apagado, que es justo el escenario
  // de "lo estamos ajustando y todavía no queremos que salga".
  if (!activo && !emailPrueba && !opciones.simular) {
    return { ...base, modo: 'desactivado', errores: ['El envío está desactivado (alertas_parametros.correo_activo = false).'] };
  }

  if (!opciones.simular && !opciones.ignorarFrescura) {
    const frescura = await datosFrescos(supabase);
    if (!frescura.ok) {
      const avisado = await avisarPipelineParado(supabase, fecha, frescura.ultima);
      return {
        ...base,
        exito: false,
        errores: [
          `Los datos de métricas no se han actualizado hoy (última escritura: ${frescura.ultima ?? 'ninguna'}). No se envía nada para no avisar sobre una jornada incompleta.`,
          avisado
            ? 'Se ha avisado por correo para que se lance el pipeline a mano.'
            : 'Aviso por correo no enviado (ya se avisó hoy, o falta ALERTAS_PIPELINE_EMAIL).',
        ],
      };
    }
  }

  const { data: destinatarios, error } = await supabase.rpc('destinatarios_alerta_tph', {
    p_fecha: fecha,
    p_tph_max: tphMax,
    p_horas_min: horasMin,
  });

  if (error) {
    return { ...base, exito: false, errores: [`No se pudieron calcular los destinatarios: ${error.message}`] };
  }

  const lista = (destinatarios ?? []) as DestinatarioTph[];
  base.candidatos = lista.length;

  if (opciones.simular) {
    return {
      ...base,
      muestra: lista.slice(0, 20).map((d) => ({ nombre: d.nombre, email: d.email, tph: d.tph, horas: d.online_hours, pedidos: d.num_of_trips })),
    };
  }

  const topeBase = emailPrueba ? MAX_CORREOS_EN_PRUEBAS : MAX_CORREOS_POR_EJECUCION;
  const tope = opciones.limite ? Math.min(opciones.limite, topeBase) : topeBase;
  const aEnviar = lista.slice(0, tope);
  base.omitidos = lista.length - aEnviar.length;

  let enviados = 0;
  let fallidos = 0;
  let cortadoPorTiempo = 0;
  const arranque = Date.now();
  let siguienteEnvio = arranque;

  for (const [indice, d] of aEnviar.entries()) {
    // Parada limpia antes de que la función se quede sin tiempo (ver
    // PRESUPUESTO_MS). Lo que quede se manda en el siguiente disparo.
    if (Date.now() - arranque > PRESUPUESTO_MS) {
      cortadoPorTiempo = aEnviar.length - indice;
      break;
    }

    // Ritmo por hueco entre arranques, no por pausa fija: si un envío
    // tarda 900 ms, solo se espera lo que falte para el siguiente hueco.
    const esperaNecesaria = siguienteEnvio - Date.now();
    if (esperaNecesaria > 0) await esperar(esperaNecesaria);
    siguienteEnvio = Date.now() + MS_ENTRE_ENVIOS;

    const destino = emailPrueba ?? d.email;

    // En producción se reserva el hueco ANTES de enviar: si el correo
    // sale pero el registro falla después, el rider recibiría otro
    // aviso en la siguiente ejecución. Es preferible arriesgarse a no
    // enviar uno que a enviar el mismo dos veces.
    if (!emailPrueba) {
      const { error: errorReserva } = await supabase.from('alertas_tph_correos').insert({
        rider_id: d.rider_id,
        fecha,
        email: destino,
        tph: d.tph,
        online_hours: d.online_hours,
        num_of_trips: d.num_of_trips,
        centro_id: d.centro_id,
      });
      // Violación de la unique = otra ejecución ya se ocupó de este rider.
      if (errorReserva) continue;
    }

    try {
      await conReintento(() => enviarCorreoGmail([destino], asuntoAlertaTph(d.nombre), plantillaAlertaTph(d, fecha), { alias: ALIAS_REMITENTE, responderA: responderA() }));
      enviados++;
    } catch (e) {
      fallidos++;
      if (errores.length < 10) errores.push(`${d.email}: ${mensajeError(e)}`);
      // Se libera el hueco para poder reintentar este rider más tarde.
      if (!emailPrueba) await supabase.from('alertas_tph_correos').delete().eq('rider_id', d.rider_id).eq('fecha', fecha);
    }
  }

  return {
    ...base,
    exito: fallidos === 0 && cortadoPorTiempo === 0,
    enviados,
    fallidos,
    omitidos: base.omitidos + cortadoPorTiempo,
    errores: cortadoPorTiempo
      ? [...errores, `Quedan ${cortadoPorTiempo} sin enviar: se paró para no agotar el tiempo de la función. El siguiente disparo los recoge.`]
      : errores,
    muestra: emailPrueba
      ? aEnviar.map((d) => ({ nombre: d.nombre, email: d.email, tph: d.tph, horas: d.online_hours, pedidos: d.num_of_trips }))
      : undefined,
  };
}
