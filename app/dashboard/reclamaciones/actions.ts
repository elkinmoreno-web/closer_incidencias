'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { enviarCorreoGmail } from '@/lib/googleMail';
import { plantillaAvisoGestor, asuntoAvisoGestor } from '@/lib/avisoGestorCorreo';
import { registrarError, formatFecha, leerImporte, CORREOS_GESTION_RECLAMACIONES } from '@/lib/utils';
import { resolverIdioma } from '@/lib/i18n/resolverIdioma';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import type { EstadoReclamacion, ViaPagoReclamacion } from '@/lib/types';
import { moduloAdminActivo } from '@/lib/modulos';
import { aplicarFiltrosPago } from '@/lib/reclamacionesFiltros';

async function getCurrentAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single();
  if (!admin) throw new Error('Sin acceso');

  // No basta con que sea admin: el módulo puede estar apagado para él.
  // Sin esto, el interruptor de Configuración solo escondía la pantalla
  // y cualquier gestor podía seguir resolviendo o mandando a papelera
  // llamando a la acción directamente.
  if (!(await moduloAdminActivo('reclamaciones'))) throw new Error('Sin acceso a este módulo');
  return admin.id as string;
}

/** Etiqueta legible del estado, para el texto de auditoría. */
const ETIQUETA_ESTADO: Record<EstadoReclamacion, string> = {
  pendiente: 'Pendiente',
  en_tramite: 'En trámite',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  papelera: 'En papelera',
};

/**
 * Resuelve una reclamación: cambia el estado y deja la respuesta al rider.
 *
 * Aquí la respuesta va SIEMPRE, no solo al rechazar como en ausencias:
 * el rider tiene que poder leer la resolución se apruebe o se deniegue,
 * que es lo que se pidió ("que tenga registro de sus reclamaciones y la
 * respuesta de resolución, bien sea positiva o negativa").
 *
 * 'en_tramite' es el estado intermedio para las que ya están en manos de
 * nóminas y tardan semanas: sin él, el gestor tendría que dejarlas en
 * "pendiente" y no se distinguiría lo que nadie ha mirado de lo que está
 * en curso.
 */
export interface DatosResolucion {
  /**
   * Lo que se aprueba pagar, TAL CUAL lo escribió el gestor ("1.234,50").
   * Se interpreta aquí, en el servidor, con leerImporte(): antes el
   * navegador solo cambiaba la coma por un punto, así que "1.234,50" no era
   * un número y la reclamación quedaba aprobada sin importe.
   */
  importeAprobadoTexto?: string | null;
  /** Primera remesa o siguiente nómina. Obligatorio al aprobar. */
  viaPago?: ViaPagoReclamacion | null;
}

export async function resolverReclamacion(
  id: string,
  estado: EstadoReclamacion,
  respuesta: string,
  datos: DatosResolucion = {}
): Promise<{ error: string } | { success: true }> {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const texto = respuesta.trim();
  // Rechazar sin explicar deja al rider sin saber qué hacer después.
  if (estado === 'rechazada' && !texto) return { error: 'Explica al rider por qué se rechaza' };
  // Aprobar sin decir cuándo se paga deja la reclamación resuelta a medias:
  // el rider sabe que le dan la razón pero no cuándo verá el dinero, y
  // vuelve a preguntar. Es el dato que más se reclama después.
  if (estado === 'aprobada' && !datos.viaPago) return { error: 'Indica si se paga en la primera remesa o en la siguiente nómina' };

  // Una aprobada SIN importe deja al rider sabiendo que le dan la razón pero
  // no cuánto cobra. Había 10 así el 7-oct-2026.
  let importeAprobado: number | null = null;
  if (estado === 'aprobada') {
    importeAprobado = leerImporte(datos.importeAprobadoTexto ?? '');
    if (importeAprobado === null) return { error: 'Indica el importe aprobado' };
    if (Number.isNaN(importeAprobado)) return { error: 'El importe aprobado no es un número válido (ej: 19,85 o 1.234,50)' };
    if (importeAprobado > 99_999_999) return { error: 'El importe aprobado es demasiado grande' };
  }

  // Una regularizada ya está pagada: cambiarle el estado dejaría pagado algo
  // que figura como rechazado o en trámite. Primero hay que deshacer la
  // regularización, que solo pueden hacer los de CORREOS_GESTION_RECLAMACIONES.
  const { data: previa } = await supabase.from('reclamaciones').select('regularizada_en').eq('id', id).maybeSingle();
  if (previa?.regularizada_en) return { error: 'Esta reclamación ya está regularizada (pagada). No se puede cambiar su estado.' };

  const { data: fila, error } = await supabase
    .from('reclamaciones')
    .update({
      estado,
      respuesta: texto || null,
      // Solo se tocan al aprobar: si luego se pasa a trámite o se rechaza,
      // se limpian para no dejar un importe aprobado en una reclamación
      // que ya no lo está.
      importe_aprobado: estado === 'aprobada' ? importeAprobado : null,
      via_pago: estado === 'aprobada' ? (datos.viaPago ?? null) : null,
      revisado_por_id: adminId,
      fecha_gestion: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) return { error: error.message };

  await supabase.from('auditoria').insert({
    admin_id: adminId,
    accion: 'Resolver reclamación',
    detalles: `Marcó la reclamación ${id} como ${ETIQUETA_ESTADO[estado]}`,
    centro_id: fila?.centro_id ?? null,
  });

  revalidatePath('/dashboard/reclamaciones');
  revalidatePath('/rider/dashboard');
  return { success: true };
}

/** Manda una reclamación a la papelera (no se borra: se recupera desde /dashboard/papelera). */
export async function enviarReclamacionAPapelera(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const { data: fila, error } = await supabase
    .from('reclamaciones')
    .update({ estado: 'papelera', eliminado_por_id: adminId, fecha_eliminacion: new Date().toISOString() })
    .eq('id', id)
    // Una regularizada ya está pagada: no se tira a la papelera. En la
    // tabla ni se ofrece el botón; esto cubre la llamada directa.
    .is('regularizada_en', null)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await supabase.from('auditoria').insert({
    admin_id: adminId,
    accion: 'Enviar a papelera',
    detalles: `Movió a papelera la reclamación ${id}`,
    centro_id: fila?.centro_id ?? null,
  });
  revalidatePath('/dashboard/reclamaciones');
  revalidatePath('/dashboard/papelera');
}

/** Devuelve una reclamación de la papelera a "pendiente". */
export async function recuperarReclamacionDePapelera(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdmin(supabase);

  const { data: fila, error } = await supabase
    .from('reclamaciones')
    .update({ estado: 'pendiente', eliminado_por_id: null, fecha_eliminacion: null })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await supabase.from('auditoria').insert({
    admin_id: adminId,
    accion: 'Recuperar de papelera',
    detalles: `Recuperó la reclamación ${id}`,
    centro_id: fila?.centro_id ?? null,
  });
  revalidatePath('/dashboard/reclamaciones');
  revalidatePath('/dashboard/papelera');
}

export interface FilaExportReclamacion {
  creada: string;
  periodo: string;
  rider: string;
  dni: string;
  centro: string;
  concepto: string;
  importe: string;
  importeAprobado: string;
  viaPago: string;
  comentario: string | null;
  estado: string;
  respuesta: string | null;
  resueltaPor: string | null;
  fechaResolucion: string | null;
  regularizadaPor: string | null;
  fechaRegularizacion: string | null;
}

/** Exporta TODAS las que coinciden con los filtros activos, no solo la página visible. */
export async function exportarReclamaciones(filtros: {
  estado?: string;
  centro?: string;
  motivo?: string;
  ciudad?: string;
  periodo?: string;
  q?: string;
  via?: string;
  reg?: string;
}): Promise<FilaExportReclamacion[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  // Esta acción no pasa por getCurrentAdmin, así que comprueba el módulo aparte.
  if (!(await moduloAdminActivo('reclamaciones'))) return [];
  const idioma = await resolverIdioma();

  let query = supabase
    .from('reclamaciones')
    .select('created_at, periodo, nombre_rider, dni, importe, importe_aprobado, via_pago, comentario, estado, respuesta, fecha_gestion, regularizada_en, centros(nombre), motivos_reclamacion(nombre, nombre_en), admins:revisado_por_id(usuario), regularizador:regularizada_por_id(usuario)')
    .neq('estado', 'papelera')
    .order('created_at', { ascending: false });

  query = aplicarFiltrosPago(query, filtros.via, filtros.reg);

  if (filtros.estado) query = query.eq('estado', filtros.estado);
  if (filtros.centro) query = query.eq('centro_id', Number(filtros.centro));
  if (filtros.motivo) query = query.eq('motivo_id', Number(filtros.motivo));
  if (filtros.periodo) query = query.eq('periodo', `${filtros.periodo}-01`);
  if (filtros.q) {
    const q = filtros.q.replace(/[%,]/g, '');
    query = query.or(`nombre_rider.ilike.%${q}%,dni.ilike.%${q}%`);
  }
  if (filtros.ciudad) {
    const { data: centrosDeCiudad } = await supabase.from('centros').select('id').eq('ciudad_id', Number(filtros.ciudad));
    query = query.in('centro_id', (centrosDeCiudad ?? []).map((c) => c.id));
  }

  const { data, error } = await query.limit(5000);
  if (error) {
    registrarError('exportarReclamaciones', error);
    return [];
  }

  return (data ?? []).map((r) => {
    const motivo = r.motivos_reclamacion as unknown as { nombre: string; nombre_en: string | null } | null;
    return {
      creada: formatFecha(r.created_at),
      periodo: String(r.periodo).slice(0, 7),
      rider: r.nombre_rider,
      dni: r.dni,
      centro: (r.centros as unknown as { nombre: string } | null)?.nombre ?? '—',
      concepto: motivo ? nombreSegunIdioma(idioma, motivo.nombre, motivo.nombre_en) : '—',
      // Sin separador de miles y con punto decimal: así Excel lo lee como número.
      importe: r.importe === null || r.importe === undefined ? '' : Number(r.importe).toFixed(2),
      importeAprobado: r.importe_aprobado === null || r.importe_aprobado === undefined ? '' : Number(r.importe_aprobado).toFixed(2),
      viaPago: r.via_pago === 'primera_remesa' ? 'Primera remesa' : r.via_pago === 'siguiente_nomina' ? 'Siguiente nómina' : '',
      comentario: r.comentario,
      estado: ETIQUETA_ESTADO[r.estado as EstadoReclamacion] ?? r.estado,
      respuesta: r.respuesta,
      resueltaPor: (r.admins as unknown as { usuario: string } | null)?.usuario ?? null,
      fechaResolucion: r.fecha_gestion ? formatFecha(r.fecha_gestion) : null,
      regularizadaPor: (r.regularizador as unknown as { usuario: string } | null)?.usuario ?? null,
      fechaRegularizacion: r.regularizada_en ? formatFecha(r.regularizada_en) : null,
    };
  });
}

export type AvisoGestorState = { error: string } | { success: true; para: string; correoEnviado: boolean } | undefined;

/**
 * Escribe al gestor que APROBÓ O RECHAZÓ una reclamación.
 *
 * Caso típico: un gestor resuelve algo que no le correspondía, y
 * Nicolás le avisa desde la propia reclamación. El destinatario es siempre
 * `revisado_por_id`, el que sale en "Resuelta por"; si nadie la ha
 * gestionado todavía no hay a quién avisar y se rechaza.
 *
 * Se GUARDA antes de enviar: si Gmail falla, el aviso queda registrado en
 * reclamacion_avisos y quien lo escribe sabe que el correo no ha salido.
 */
export async function avisarGestorReclamacion(id: string, mensaje: string): Promise<AvisoGestorState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Comprobación en el servidor: esconder el botón no basta, la acción se
    // podría invocar directamente.
    if (!user?.email || !CORREOS_GESTION_RECLAMACIONES.includes(user.email)) {
      return { error: 'No tienes permiso para enviar avisos a los gestores.' };
    }
    const deAdminId = await getCurrentAdmin(supabase);

    const texto = mensaje.trim();
    if (texto.length < 3) return { error: 'Escribe el mensaje para el gestor.' };
    if (texto.length > 5000) return { error: 'El mensaje es demasiado largo.' };

    const adm = createAdminClient();
    const { data: r } = await adm
      .from('reclamaciones')
      .select('id, nombre_rider, dni, periodo, importe, importe_aprobado, estado, respuesta, revisado_por_id, centros(nombre), motivos_reclamacion(nombre)')
      .eq('id', id)
      .maybeSingle();
    if (!r) return { error: 'Esa reclamación no existe.' };
    if (!r.revisado_por_id) return { error: 'Nadie ha gestionado todavía esta reclamación: no hay a quién avisar.' };

    const { data: gestor } = await adm.from('admins').select('id, usuario, auth_user_id').eq('id', r.revisado_por_id).maybeSingle();
    if (!gestor?.auth_user_id) return { error: 'No se encuentra al gestor que la resolvió.' };
    const { data: authGestor } = await adm.auth.admin.getUserById(gestor.auth_user_id);
    const emailGestor = authGestor?.user?.email;
    if (!emailGestor) return { error: `${gestor.usuario} no tiene correo registrado.` };

    const { data: aviso, error } = await adm
      .from('reclamacion_avisos')
      .insert({ reclamacion_id: r.id, de_admin_id: deAdminId, para_admin_id: gestor.id, mensaje: texto })
      .select('id')
      .single();
    if (error || !aviso) return { error: registrarError('reclamaciones:avisoGestor', error, 'No se pudo guardar el aviso') };

    const centro = (r.centros as unknown as { nombre: string } | null)?.nombre ?? '—';
    const concepto = (r.motivos_reclamacion as unknown as { nombre: string } | null)?.nombre ?? '—';
    const { data: autor } = await adm.from('admins').select('usuario').eq('id', deAdminId).maybeSingle();
    const html = plantillaAvisoGestor({
      autor: autor?.usuario ?? user.email,
      gestor: gestor.usuario,
      mensaje: texto,
      rider: r.nombre_rider,
      dni: r.dni,
      centro,
      concepto,
      periodo: String(r.periodo).slice(0, 7),
      importe: r.importe === null || r.importe === undefined ? null : Number(r.importe),
      estado: ETIQUETA_ESTADO[r.estado as EstadoReclamacion] ?? r.estado,
      respuesta: r.respuesta,
    });

    let correoEnviado = false;
    try {
      // Sale desde la dirección de quien escribe (Nicolás, Rodrigo...) y
      // con su nombre: para el gestor es un mensaje de esa persona, no un
      // aviso del sistema. Requiere que esa dirección sea alias "Enviar
      // como" de la cuenta de envío; si no, Gmail lo manda desde la cuenta
      // de envío y el Reply-To sigue llevando la respuesta a quien escribe.
      await enviarCorreoGmail([emailGestor], asuntoAvisoGestor(r.nombre_rider, concepto), html, {
        alias: autor?.usuario ?? 'Closer CRM',
        desde: user.email,
        responderA: user.email,
      });
      correoEnviado = true;
      await adm.from('reclamacion_avisos').update({ correo_enviado: true }).eq('id', aviso.id);
    } catch (e) {
      registrarError('reclamaciones:avisoGestorCorreo', e, 'No se pudo enviar el correo al gestor');
    }

    await supabase.from('auditoria').insert({
      admin_id: deAdminId,
      accion: 'Aviso al gestor sobre reclamación',
      detalles: `A ${gestor.usuario} sobre la reclamación de ${r.nombre_rider} (${concepto})`,
      centro_id: null,
    });

    return { success: true, para: gestor.usuario, correoEnviado };
  } catch (e) {
    return { error: registrarError('reclamaciones:avisoGestor', e, 'No se pudo enviar el aviso') };
  }
}


export type EditarReclamacionState = { error: string } | { success: true } | undefined;

/** Todo lo editable de una reclamación, tal cual sale del formulario. */
export interface DatosEdicionReclamacion {
  motivoId: number;
  /** aaaa-mm */
  periodo: string;
  importeTexto: string;
  comentario: string;
  respuesta: string;
  /** Solo cuentan si la reclamación está aprobada. */
  importeAprobadoTexto: string;
  viaPago: ViaPagoReclamacion | '';
}

/**
 * Corrige cualquier dato de una reclamación SIN resolverla de nuevo.
 *
 * Existe porque la única forma de corregir algo era volver a aprobarla, y
 * eso reescribía `revisado_por_id`: "Resuelta por" pasaba a ser quien
 * corregía y se perdía quién había decidido de verdad. Aquí no se tocan ni
 * el estado, ni quién la resolvió, ni el rider ni su centro (el centro
 * decide qué gestores la ven).
 *
 * Importe aprobado y vía de pago solo se tocan si está aprobada: en otro
 * estado no existen. Cada campo que cambia queda en Auditoría con su valor
 * anterior. Solo los de CORREOS_GESTION_RECLAMACIONES.
 */
export async function editarReclamacion(id: string, datos: DatosEdicionReclamacion): Promise<EditarReclamacionState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || !CORREOS_GESTION_RECLAMACIONES.includes(user.email)) {
      return { error: 'No tienes permiso para editar reclamaciones.' };
    }
    const adminId = await getCurrentAdmin(supabase);

    const { data: actual } = await supabase
      .from('reclamaciones')
      .select('motivo_id, periodo, importe, importe_aprobado, via_pago, comentario, respuesta, estado, centro_id, nombre_rider, motivos_reclamacion(nombre)')
      .eq('id', id)
      .maybeSingle();
    if (!actual) return { error: 'Esa reclamación no existe.' };

    const { data: motivo } = await supabase.from('motivos_reclamacion').select('id, nombre').eq('id', datos.motivoId).maybeSingle();
    if (!motivo) return { error: 'Elige un concepto válido.' };

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(datos.periodo)) return { error: 'Elige el mes de la nómina.' };
    const periodo = `${datos.periodo}-01`;

    // El reclamado puede quedar vacío: hay riders que no saben cuánto les falta.
    const importe = leerImporte(datos.importeTexto);
    if (Number.isNaN(importe)) return { error: 'El importe reclamado no es un número válido (ej: 19,85 o 1.234,50).' };

    const comentario = datos.comentario.trim();
    const respuesta = datos.respuesta.trim();
    if (comentario.length > 5000 || respuesta.length > 5000) return { error: 'El texto es demasiado largo.' };
    if (actual.estado === 'rechazada' && !respuesta) return { error: 'Una reclamación rechazada necesita la respuesta al rider.' };

    const cambios: Record<string, unknown> = {
      motivo_id: motivo.id,
      periodo,
      importe,
      comentario: comentario || null,
      respuesta: respuesta || null,
      updated_at: new Date().toISOString(),
    };

    let aprobado: number | null = null;
    if (actual.estado === 'aprobada') {
      aprobado = leerImporte(datos.importeAprobadoTexto);
      if (aprobado === null) return { error: 'Una reclamación aprobada necesita importe aprobado.' };
      if (Number.isNaN(aprobado)) return { error: 'El importe aprobado no es un número válido (ej: 19,85 o 1.234,50).' };
      if (!datos.viaPago) return { error: 'Indica si se paga en la primera remesa o en la siguiente nómina.' };
      cambios.importe_aprobado = aprobado;
      cambios.via_pago = datos.viaPago;
    }
    // El tope de la columna es numeric(10,2): por encima, Postgres revienta.
    if ((importe ?? 0) > 99_999_999 || (aprobado ?? 0) > 99_999_999) return { error: 'El importe es demasiado grande.' };

    // .select() a propósito: si el RLS bloquea el UPDATE no da error, solo
    // no cambia nada, y así se detecta en vez de fingir que se guardó.
    const { data: guardado, error } = await supabase.from('reclamaciones').update(cambios).eq('id', id).select('id');
    if (error) return { error: error.message };
    if (!guardado || guardado.length === 0) return { error: 'No se pudo guardar: no tienes acceso a esta reclamación.' };

    const eur = (n: unknown) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(2).replace('.', ',')} €`);
    const num = (n: unknown) => (n === null || n === undefined ? null : Number(n));
    const motivoAntes = (actual.motivos_reclamacion as unknown as { nombre: string } | null)?.nombre ?? '—';
    const detalle = [
      actual.motivo_id !== motivo.id ? `concepto ${motivoAntes} → ${motivo.nombre}` : null,
      String(actual.periodo).slice(0, 7) !== datos.periodo ? `mes ${String(actual.periodo).slice(0, 7)} → ${datos.periodo}` : null,
      num(actual.importe) !== importe ? `reclamado ${eur(actual.importe)} → ${eur(importe)}` : null,
      actual.estado === 'aprobada' && num(actual.importe_aprobado) !== aprobado ? `aprobado ${eur(actual.importe_aprobado)} → ${eur(aprobado)}` : null,
      actual.estado === 'aprobada' && actual.via_pago !== datos.viaPago ? `vía de pago ${actual.via_pago ?? '—'} → ${datos.viaPago}` : null,
      (actual.comentario ?? '') !== comentario ? 'comentario' : null,
      (actual.respuesta ?? '') !== respuesta ? 'respuesta' : null,
    ]
      .filter(Boolean)
      .join('; ');
    await supabase.from('auditoria').insert({
      admin_id: adminId,
      accion: 'Editar reclamación',
      detalles: `${actual.nombre_rider}: ${detalle || 'sin cambios'}`,
      centro_id: actual.centro_id ?? null,
    });

    revalidatePath('/dashboard/reclamaciones');
    revalidatePath('/rider/dashboard');
    return { success: true };
  } catch (e) {
    return { error: registrarError('reclamaciones:editar', e, 'No se pudo guardar la reclamación') };
  }
}

export type RegularizarState = { error: string } | { success: true } | undefined;

/**
 * Marca (o desmarca) una reclamación aprobada como regularizada: el pago ya
 * se ha hecho en nómina.
 *
 * Al marcarla sale del listado por defecto —así no se vuelve a revisar— y
 * pasa al filtro "Regularizadas", que ven todos. Desmarcar existe para
 * corregir un clic equivocado. Solo los de CORREOS_GESTION_RECLAMACIONES.
 */
export async function marcarRegularizada(id: string, regularizada: boolean): Promise<RegularizarState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || !CORREOS_GESTION_RECLAMACIONES.includes(user.email)) {
      return { error: 'No tienes permiso para regularizar reclamaciones.' };
    }
    const adminId = await getCurrentAdmin(supabase);

    const { data: actual } = await supabase
      .from('reclamaciones')
      .select('estado, regularizada_en, importe_aprobado, centro_id, nombre_rider')
      .eq('id', id)
      .maybeSingle();
    if (!actual) return { error: 'Esa reclamación no existe.' };
    if (regularizada && actual.estado !== 'aprobada') return { error: 'Solo se pueden regularizar las reclamaciones aprobadas.' };
    // Sin importe no se sabe qué se ha pagado: que se corrija antes con el lápiz.
    if (regularizada && actual.importe_aprobado === null) {
      return { error: 'Falta el importe aprobado. Corrígelo con el lápiz antes de regularizar.' };
    }
    if (regularizada === !!actual.regularizada_en) return { success: true }; // otro ya lo hizo: nada que cambiar

    const { data: guardado, error } = await supabase
      .from('reclamaciones')
      .update({
        regularizada_en: regularizada ? new Date().toISOString() : null,
        regularizada_por_id: regularizada ? adminId : null,
      })
      .eq('id', id)
      .select('id');
    if (error) return { error: error.message };
    if (!guardado || guardado.length === 0) return { error: 'No se pudo guardar: no tienes acceso a esta reclamación.' };

    await supabase.from('auditoria').insert({
      admin_id: adminId,
      accion: regularizada ? 'Regularizar reclamación' : 'Deshacer regularización de reclamación',
      detalles: `${actual.nombre_rider}: ${Number(actual.importe_aprobado ?? 0).toFixed(2).replace('.', ',')} €`,
      centro_id: actual.centro_id ?? null,
    });

    revalidatePath('/dashboard/reclamaciones');
    return { success: true };
  } catch (e) {
    return { error: registrarError('reclamaciones:regularizar', e, 'No se pudo guardar la regularización') };
  }
}
