/**
 * Correo que recibe un gestor cuando le escriben sobre una reclamación de
 * nómina que él aprobó o rechazó. Vive fuera del actions.ts para poder
 * generarlo también en pruebas con la MISMA plantilla que el envío real.
 */

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function asuntoAvisoGestor(rider: string, concepto: string): string {
  return `Reclamación de ${rider} (${concepto})`;
}

export function plantillaAvisoGestor(d: {
  /** Quien escribe (usuario del panel). */
  autor: string;
  gestor: string;
  mensaje: string;
  rider: string;
  dni: string;
  centro: string;
  concepto: string;
  periodo: string;
  importe: number | null;
  estado: string;
  respuesta: string | null;
}): string {
  const euros = (n: number | null) => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`);
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 0;color:#64748B;width:140px">${k}</td><td style="padding:4px 0;font-weight:600">${escHtml(v)}</td></tr>`;
  return `
  <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#F4F7F8;padding:32px 16px">
    <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E1E8EB">
      <div style="background:#2C3E50;padding:16px 24px">
        <p style="margin:0;color:#FFFFFF;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Reclamación de nómina</p>
      </div>
      <div style="padding:24px;color:#2C3E50;font-size:14px;line-height:1.6">
        <p style="margin:0 0 14px">Hola ${escHtml(d.gestor)},</p>
        <p style="margin:0 0 6px;color:#64748B;font-size:12px">${escHtml(d.autor)} te ha escrito sobre una reclamación que gestionaste:</p>
        <div style="padding:14px 16px;background:#FFF8E6;border:1px solid #F3D58A;border-radius:10px;white-space:pre-wrap;margin-bottom:18px">${escHtml(d.mensaje)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${fila('Rider', `${d.rider} (${d.dni})`)}
          ${fila('Centro', d.centro)}
          ${fila('Concepto', d.concepto)}
          ${fila('Mes', d.periodo)}
          ${fila('Importe reclamado', euros(d.importe))}
          ${fila('Estado', d.estado)}
          ${d.respuesta ? fila('Tu respuesta', d.respuesta) : ''}
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#64748B">Responde a este correo para contestarle directamente.</p>
      </div>
    </div>
  </div>`;
}
