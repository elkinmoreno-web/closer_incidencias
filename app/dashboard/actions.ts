'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

async function getCurrentAdminId(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin, error } = await supabase
    .from('admins')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !admin) throw new Error('Cuenta sin acceso de administrador');
  return admin.id as string;
}

async function registrarAuditoria(
  supabase: ReturnType<typeof createClient>,
  adminId: string,
  accion: string,
  detalles: string,
  centroId: number | null = null
) {
  // No frenamos la acción principal si falla el log de auditoría.
  await supabase.from('auditoria').insert({ admin_id: adminId, accion, detalles, centro_id: centroId }).select().maybeSingle();
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/gestor/login');
}

export async function editarIncidencia(
  id: string,
  data: {
    motivoId: number;
    codigoPedido: string | null;
    observaciones: string | null;
    direccionRecogida: string | null;
    direccionEntrega: string | null;
    centroId: number | null;
  }
) {
  const supabase = createClient();
  const adminId = await getCurrentAdminId(supabase);

  const { error } = await supabase
    .from('incidencias')
    .update({
      motivo_id: data.motivoId,
      codigo_pedido: data.codigoPedido,
      observaciones: data.observaciones,
      direccion_recogida: data.direccionRecogida,
      direccion_entrega: data.direccionEntrega,
      centro_id: data.centroId,
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, adminId, 'Editar', `Editó campos de la incidencia ${id}`, data.centroId);
  revalidatePath('/dashboard/incidencias');
  revalidatePath('/dashboard');
}

export async function aprobarIncidencia(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdminId(supabase);

  const { data: fila, error } = await supabase
    .from('incidencias')
    .update({
      estado: 'aprobada',
      gestor_id: adminId,
      fecha_gestion: new Date().toISOString(),
      motivo_rechazo: null, // si venía de un rechazo, limpiamos el motivo anterior
    })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, adminId, 'Aprobar', `Aprobó la incidencia ${id}`, fila?.centro_id ?? null);
  revalidatePath('/dashboard/incidencias');
  revalidatePath('/dashboard');
}

export async function rechazarIncidencia(id: string, motivoRechazo: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdminId(supabase);

  const { data: fila, error } = await supabase
    .from('incidencias')
    .update({
      estado: 'rechazada',
      gestor_id: adminId,
      fecha_gestion: new Date().toISOString(),
      motivo_rechazo: motivoRechazo || null,
    })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, adminId, 'Rechazar', `Rechazó la incidencia ${id}: ${motivoRechazo}`, fila?.centro_id ?? null);
  revalidatePath('/dashboard/incidencias');
  revalidatePath('/dashboard');
}

export async function enviarAPapelera(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdminId(supabase);

  const { data: fila, error } = await supabase
    .from('incidencias')
    .update({
      estado: 'papelera',
      eliminado_por_id: adminId,
      fecha_eliminacion: new Date().toISOString(),
    })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, adminId, 'Enviar a papelera', `Movió a papelera la incidencia ${id}`, fila?.centro_id ?? null);
  revalidatePath('/dashboard/incidencias');
  revalidatePath('/dashboard/papelera');
}

export async function recuperarDePapelera(id: string) {
  const supabase = createClient();
  const adminId = await getCurrentAdminId(supabase);

  const { data: fila, error } = await supabase
    .from('incidencias')
    .update({ estado: 'pendiente', eliminado_por_id: null, fecha_eliminacion: null })
    .eq('id', id)
    .select('centro_id')
    .single();

  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, adminId, 'Recuperar', `Recuperó de la papelera la incidencia ${id}`, fila?.centro_id ?? null);
  revalidatePath('/dashboard/incidencias');
  revalidatePath('/dashboard/papelera');
}
