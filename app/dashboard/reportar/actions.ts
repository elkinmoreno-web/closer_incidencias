'use server';

import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { enviarCorreoGmail } from '@/lib/googleMail';
import { registrarError, ROLES_PUEDEN_REPORTAR } from '@/lib/utils';

/**
 * Quién recibe los tickets. Una sola lista, aquí: si cambia el equipo de
 * soporte, se cambia en este sitio y ya.
 */
const DESTINATARIOS_SOPORTE = [
  'nicolas.correa@closerlogistics.com',
  'rodrigo.heredero@closerlogistics.com',
  'elkin.moreno@closerlogistics.com',
];

const ETIQUETA_TIPO = {
  error: 'Error en el panel',
  sugerencia: 'Sugerencia de mejora',
  acceso: 'Problema de acceso o permisos',
  otro: 'Otro',
} as const;

const ticketSchema = z.object({
  tipo: z.enum(['error', 'sugerencia', 'acceso', 'otro']),
  asunto: z.string().trim().min(3, 'El asunto es demasiado corto').max(150, 'El asunto es demasiado largo'),
  descripcion: z
    .string()
    .trim()
    .min(10, 'Cuéntanos un poco más: al menos 10 caracteres')
    .max(5000, 'La descripción es demasiado larga'),
  pagina: z.string().trim().max(300).optional(),
});

export type ReportarState = { error: string } | { success: true; id: number; correoEnviado: boolean } | undefined;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function plantillaTicket(d: {
  id: number;
  tipo: keyof typeof ETIQUETA_TIPO;
  asunto: string;
  descripcion: string;
  pagina?: string;
  autor: string;
  email: string | null;
  rol: string;
}): string {
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:5px 0;color:#64748B;width:120px;vertical-align:top">${k}</td><td style="padding:5px 0;font-weight:600">${v}</td></tr>`;
  return `
  <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#F4F7F8;padding:32px 16px">
    <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E1E8EB">
      <div style="background:#2C3E50;padding:16px 24px">
        <p style="margin:0;color:#FFFFFF;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Closer CRM · Ticket #${d.id}</p>
      </div>
      <div style="padding:24px;color:#2C3E50;font-size:14px;line-height:1.6">
        <p style="margin:0 0 16px;font-size:17px;font-weight:700">${esc(d.asunto)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
          ${fila('Tipo', esc(ETIQUETA_TIPO[d.tipo]))}
          ${fila('Reportado por', `${esc(d.autor)}${d.email ? ` &lt;${esc(d.email)}&gt;` : ''}`)}
          ${fila('Rol', esc(d.rol))}
          ${d.pagina ? fila('Página', esc(d.pagina)) : ''}
        </table>
        <div style="padding:14px 16px;background:#F9FBFB;border:1px solid #E1E8EB;border-radius:10px;white-space:pre-wrap">${esc(d.descripcion)}</div>
        <p style="margin:16px 0 0;font-size:12px;color:#64748B">Responde a este correo para contestar directamente a quien lo reportó.</p>
      </div>
    </div>
  </div>`;
}

/**
 * Crea el ticket y lo manda por correo al equipo de soporte.
 *
 * Primero se GUARDA y después se envía: si Gmail falla, el reporte no se
 * pierde —queda en tickets_soporte con correo_enviado = false— y el admin
 * recibe el aviso de que no ha salido el correo, en vez de creer que sí.
 */
export async function crearTicket(_prev: ReportarState, formData: FormData): Promise<ReportarState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' };

    const { data: admin } = await supabase.from('admins').select('id, usuario, rol, activo').eq('auth_user_id', user.id).maybeSingle();
    // Se comprueba aquí y no solo escondiendo el botón: la acción se podría
    // invocar directamente.
    if (!admin || !admin.activo || !(ROLES_PUEDEN_REPORTAR as readonly string[]).includes(admin.rol)) {
      return { error: 'No tienes permiso para reportar incidencias.' };
    }

    const parsed = ticketSchema.safeParse({
      tipo: formData.get('tipo'),
      asunto: formData.get('asunto'),
      descripcion: formData.get('descripcion'),
      pagina: formData.get('pagina') || undefined,
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' };

    const { data: ticket, error } = await supabase
      .from('tickets_soporte')
      .insert({
        admin_id: admin.id,
        email_autor: user.email ?? null,
        tipo: parsed.data.tipo,
        asunto: parsed.data.asunto,
        descripcion: parsed.data.descripcion,
        pagina: parsed.data.pagina ?? null,
      })
      .select('id')
      .single();
    if (error || !ticket) return { error: registrarError('tickets:crear', error, 'No se pudo guardar el reporte') };

    let correoEnviado = false;
    try {
      await enviarCorreoGmail(
        DESTINATARIOS_SOPORTE,
        `[Ticket #${ticket.id}] ${ETIQUETA_TIPO[parsed.data.tipo]}: ${parsed.data.asunto}`,
        plantillaTicket({
          id: ticket.id,
          ...parsed.data,
          autor: admin.usuario,
          email: user.email ?? null,
          rol: admin.rol,
        }),
        // Responder al correo le llega a quien reportó, no al buzón remitente.
        { alias: 'Closer CRM · Soporte', responderA: user.email ?? undefined }
      );
      correoEnviado = true;
      // El UPDATE va con el cliente de servicio: la tabla solo deja insertar
      // y leer lo propio, no modificar.
      await createAdminClient().from('tickets_soporte').update({ correo_enviado: true }).eq('id', ticket.id);
    } catch (e) {
      registrarError('tickets:correo', e, 'No se pudo enviar el correo del ticket');
    }

    return { success: true, id: ticket.id, correoEnviado };
  } catch (e) {
    return { error: registrarError('tickets:crear', e, 'No se pudo enviar el reporte') };
  }
}
