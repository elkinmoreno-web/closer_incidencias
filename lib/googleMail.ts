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

function base64UrlDesdeMime(mime: string): string {
  return Buffer.from(mime, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function enviarCorreoGmail(destinatarios: string[], asunto: string, htmlBody: string): Promise<void> {
  const token = await obtenerAccessToken();

  const mime =
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
