import 'server-only';
import { obtenerAccessToken } from '@/lib/googleDrive';

/**
 * Envío de correo vía Gmail API, reutilizando el mismo access_token
 * (y por tanto el mismo refresh_token) que Drive/Docs/Sheets — el
 * refresh_token debe haberse autorizado incluyendo el scope
 * 'https://www.googleapis.com/auth/gmail.send', si no Google devuelve
 * 403 insufficient_scope (mismo patrón que cuando faltó habilitar la
 * API de Docs/Sheets).
 */

const ALIAS_REMITENTE = 'Stock Closer Logistics';

function base64UrlDesdeMime(mime: string): string {
  return Buffer.from(mime, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// La API de Gmail firma "From" con la cuenta autenticada — no se puede
// suplantar otra dirección, pero el NOMBRE que se muestra (el alias)
// sí es libre. La dirección real se fija por variable de entorno en
// vez de pedirla a users.getProfile: ese endpoint exige un scope de
// LECTURA (gmail.readonly/metadata) que no se autorizó — solo se pidió
// gmail.send (escritura), y da 403 insufficient scope si se intenta.
function cuentaGmail(): string {
  const cuenta = process.env.GOOGLE_MAIL_FROM_ADDRESS;
  if (!cuenta) throw new Error('Falta la variable de entorno GOOGLE_MAIL_FROM_ADDRESS (la cuenta de Gmail autorizada para enviar).');
  return cuenta;
}

export async function enviarCorreoGmail(destinatarios: string[], asunto: string, htmlBody: string): Promise<void> {
  const token = await obtenerAccessToken();
  const cuenta = cuentaGmail();

  const mime =
    `From: "${ALIAS_REMITENTE}" <${cuenta}>\r\n` +
    `To: ${destinatarios.join(', ')}\r\n` +
    `Subject: =?UTF-8?B?${Buffer.from(asunto, 'utf-8').toString('base64')}?=\r\n` +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    htmlBody;

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64UrlDesdeMime(mime) }),
  });

  if (!resp.ok) {
    throw new Error(`No se pudo enviar el correo por Gmail (HTTP ${resp.status}): ${await resp.text()}`);
  }
}

/** Una fila "etiqueta: valor" dentro del cuerpo del correo. */
export interface FilaCorreoStock {
  etiqueta: string;
  valor: string;
}

/**
 * Plantilla visual compartida para los correos de Stock — usa los
 * mismos colores de marca que el panel (tailwind.config.ts: primary
 * #7BB4B8, ink #2C3E50, bg #F4F7F8) para que se sienta parte del
 * mismo producto en vez de un aviso de sistema genérico.
 */
export function plantillaCorreoStock(opts: {
  titulo: string;
  colorAcento?: string; // por defecto el primary de marca; usar danger/warning para avisos
  filas: FilaCorreoStock[];
  notaDestacada?: string; // ej. la diferencia detectada, resaltada aparte
  colorNotaDestacada?: string;
  observaciones?: string | null;
}): string {
  const acento = opts.colorAcento ?? '#7BB4B8';
  const filasHtml = opts.filas
    .map(
      (f) => `
        <tr>
          <td style="padding:6px 0;color:#64748B;font-size:13px;width:130px;vertical-align:top">${f.etiqueta}</td>
          <td style="padding:6px 0;color:#2C3E50;font-size:13px;font-weight:600">${f.valor}</td>
        </tr>`
    )
    .join('');

  return `
  <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#F4F7F8;padding:32px 16px">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E1E8EB">
      <div style="background:${acento};padding:20px 24px">
        <p style="margin:0;color:#FFFFFF;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.85">Stock · Closer Logistics</p>
        <h1 style="margin:4px 0 0;color:#FFFFFF;font-size:18px;font-weight:700">${opts.titulo}</h1>
      </div>
      <div style="padding:20px 24px">
        <table style="width:100%;border-collapse:collapse">${filasHtml}</table>
        ${
          opts.notaDestacada
            ? `<div style="margin-top:14px;background:${opts.colorNotaDestacada ?? '#FBE6E3'}1a;border-left:3px solid ${opts.colorNotaDestacada ?? '#D6402F'};padding:10px 12px;border-radius:6px;font-size:13px;font-weight:600;color:${opts.colorNotaDestacada ?? '#D6402F'}">${opts.notaDestacada}</div>`
            : ''
        }
        ${
          opts.observaciones
            ? `<div style="margin-top:12px;font-size:12px;color:#64748B"><b style="color:#2C3E50">Observaciones:</b> ${opts.observaciones}</div>`
            : ''
        }
      </div>
      <div style="padding:12px 24px;background:#F4F7F8;border-top:1px solid #E1E8EB">
        <p style="margin:0;font-size:11px;color:#94A3B8">Aviso automático del panel de Stock. No respondas a este correo.</p>
      </div>
    </div>
  </div>`;
}
