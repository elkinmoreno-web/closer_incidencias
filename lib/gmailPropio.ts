import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { enviarCorreoGmail, enviarConToken, type OpcionesCorreo } from '@/lib/googleMail';
import { registrarError } from '@/lib/utils';

/**
 * Gmail PROPIO de cada admin: que un correo que escribe Nicolás salga de su
 * cuenta (sus Enviados, las respuestas a su bandeja) y no de la cuenta de
 * envío del sistema.
 *
 * Usa el mismo cliente OAuth que Drive (GOOGLE_DRIVE_CLIENT_ID): es una app
 * "Externa" en producción de un proyecto propio, y el Workspace de Closer
 * deja que sus usuarios la autoricen —así se autorizó la cuenta de envío—.
 * Solo se pide gmail.send: enviar, nunca leer.
 */

export const ALCANCE_GMAIL_SEND = 'https://www.googleapis.com/auth/gmail.send';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
/** Cookie con el `state` del flujo OAuth, entre /api/gmail/conectar y /api/gmail/callback. */
export const COOKIE_ESTADO_GMAIL = 'gmail_oauth_estado';

function credencialesOAuth() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Faltan GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET');
  return { clientId, clientSecret };
}

/** La dirección de vuelta de Google. Tiene que estar dada de alta TAL CUAL en el cliente OAuth. */
export function urlRetornoGmail(origen: string): string {
  return `${origen}/api/gmail/callback`;
}

export function urlAutorizacionGmail(origen: string, estado: string, email: string): string {
  const { clientId } = credencialesOAuth();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: urlRetornoGmail(origen),
    response_type: 'code',
    scope: `openid email ${ALCANCE_GMAIL_SEND}`,
    // offline + consent: sin ellos Google no devuelve refresh token si la
    // persona ya había autorizado la app antes.
    access_type: 'offline',
    prompt: 'consent',
    login_hint: email,
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// ── Cifrado ────────────────────────────────────────────────────────────
// AES-256-GCM: además de cifrar, detecta si alguien ha manipulado el texto.
// Formato guardado: iv.tag.datos, cada parte en base64.

function claveCifrado(): Buffer {
  const b64 = process.env.GMAIL_TOKENS_KEY;
  if (!b64) throw new Error('Falta la variable de entorno GMAIL_TOKENS_KEY');
  const clave = Buffer.from(b64, 'base64');
  if (clave.length !== 32) throw new Error('GMAIL_TOKENS_KEY debe ser de 32 bytes en base64 (openssl rand -base64 32)');
  return clave;
}

function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', claveCifrado(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}

function descifrar(guardado: string): string {
  const [iv, tag, datos] = guardado.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', claveCifrado(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}

// ── Conexión ───────────────────────────────────────────────────────────

/** Email que viene dentro del id_token. Llega directo de Google por HTTPS en la respuesta del token, así que no hace falta verificar la firma. */
function emailDelIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return payload.email_verified === false ? null : (payload.email ?? null);
  } catch {
    return null;
  }
}

/**
 * Canjea el código que devuelve Google y guarda el permiso cifrado.
 *
 * Exige que la cuenta autorizada sea la MISMA del panel: si Nicolás elige
 * por error su Gmail personal, los avisos saldrían desde ahí.
 */
export async function guardarConexionGmail(
  adminId: string,
  emailEsperado: string,
  codigo: string,
  origen: string
): Promise<{ error: string } | { ok: true }> {
  const { clientId, clientSecret } = credencialesOAuth();
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codigo,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: urlRetornoGmail(origen),
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    registrarError('gmail:canje', await resp.text());
    return { error: 'Google no aceptó la autorización. Vuelve a intentarlo.' };
  }
  const datos = await resp.json();

  const email = emailDelIdToken(datos.id_token);
  if (!email || email.toLowerCase() !== emailEsperado.toLowerCase()) {
    return { error: `Tienes que elegir la cuenta ${emailEsperado}, no ${email ?? 'otra'}.` };
  }
  // En la pantalla de Google se puede desmarcar el permiso de enviar.
  if (!String(datos.scope ?? '').split(' ').includes(ALCANCE_GMAIL_SEND)) {
    return { error: 'Falta el permiso de enviar correo: marca la casilla en la pantalla de Google.' };
  }
  if (!datos.refresh_token) return { error: 'Google no devolvió el permiso permanente. Vuelve a intentarlo.' };

  const { error } = await createAdminClient()
    .from('gmail_cuentas_admin')
    .upsert({
      admin_id: adminId,
      email,
      refresh_token_cifrado: cifrar(datos.refresh_token),
      conectado_en: new Date().toISOString(),
      ultimo_error: null,
      ultimo_error_en: null,
    });
  if (error) return { error: registrarError('gmail:guardar', error, 'No se pudo guardar la conexión') };
  return { ok: true };
}

export interface EstadoGmail {
  email: string;
  /** true si Google rechazó el permiso la última vez y hay que reconectar. */
  caducado: boolean;
}

export async function estadoGmailPropio(adminId: string): Promise<EstadoGmail | null> {
  const { data } = await createAdminClient().from('gmail_cuentas_admin').select('email, ultimo_error').eq('admin_id', adminId).maybeSingle();
  return data ? { email: data.email, caducado: !!data.ultimo_error } : null;
}

/** Borra la conexión y le pide a Google que anule el permiso. */
export async function desconectarGmailPropio(adminId: string): Promise<void> {
  const adm = createAdminClient();
  const { data } = await adm.from('gmail_cuentas_admin').select('refresh_token_cifrado').eq('admin_id', adminId).maybeSingle();
  if (data) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(descifrar(data.refresh_token_cifrado))}`, { method: 'POST' });
    } catch (e) {
      // Si Google no responde da igual: sin la fila el CRM ya no puede usarlo.
      registrarError('gmail:revocar', e);
    }
  }
  await adm.from('gmail_cuentas_admin').delete().eq('admin_id', adminId);
}

// ── Envío ──────────────────────────────────────────────────────────────

/**
 * Envía desde el Gmail propio del admin y, si no lo ha conectado o Google
 * rechaza su permiso, desde la cuenta de envío del sistema. Un aviso nunca
 * se queda sin salir por un problema de conexión de quien lo escribe.
 *
 * Devuelve por dónde salió, para decírselo a quien lo envía.
 */
export async function enviarComoAdmin(
  adminId: string,
  destinatarios: string[],
  asunto: string,
  html: string,
  opciones: OpcionesCorreo & { nombre: string }
): Promise<'propio' | 'sistema'> {
  const adm = createAdminClient();
  const { data: cuenta } = await adm.from('gmail_cuentas_admin').select('email, refresh_token_cifrado').eq('admin_id', adminId).maybeSingle();

  if (cuenta) {
    // Dos fallos distintos, tratados distinto: si Google rechaza el PERMISO
    // (lo revocó, cambió la contraseña...) se marca para que reconecte; si
    // falla solo el ENVÍO, el permiso sigue bueno y no se le molesta.
    let accessToken: string | null = null;
    try {
      const { clientId, clientSecret } = credencialesOAuth();
      const resp = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: descifrar(cuenta.refresh_token_cifrado),
          grant_type: 'refresh_token',
        }),
      });
      if (!resp.ok) throw new Error(`Google rechazó el permiso (HTTP ${resp.status}): ${await resp.text()}`);
      accessToken = (await resp.json()).access_token ?? null;
      if (!accessToken) throw new Error('Google no devolvió access_token');
    } catch (e) {
      registrarError('gmail:permisoPropio', e);
      await adm
        .from('gmail_cuentas_admin')
        .update({ ultimo_error: (e instanceof Error ? e.message : String(e)).slice(0, 500), ultimo_error_en: new Date().toISOString() })
        .eq('admin_id', adminId);
    }

    if (accessToken) {
      try {
        // Sin Reply-To: sale de su cuenta, así que responder ya le llega a él.
        await enviarConToken(accessToken, cuenta.email, destinatarios, asunto, html, { alias: opciones.nombre });
        await adm.from('gmail_cuentas_admin').update({ ultimo_error: null, ultimo_error_en: null }).eq('admin_id', adminId);
        return 'propio';
      } catch (e) {
        registrarError('gmail:enviarPropio', e);
      }
    }
  }

  await enviarCorreoGmail(destinatarios, asunto, html, opciones);
  return 'sistema';
}
