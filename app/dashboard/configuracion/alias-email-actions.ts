'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { registrarError } from '@/lib/utils';

async function assertSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data: admin } = await supabase.from('admins').select('id, rol, activo').eq('auth_user_id', user.id).single();
  if (!admin || !admin.activo || admin.rol !== 'super_admin') throw new Error('Solo Super Admin puede gestionar alias de email');
  return { supabase, admin };
}

export interface AliasEmail {
  id: number;
  email_uber: string;
  rider_id: string;
  rider_nombre: string;
  rider_dni: string;
  nota: string | null;
  creado_en: string;
}

export async function listarAliasEmail(): Promise<AliasEmail[]> {
  const { supabase } = await assertSuperAdmin();
  const { data } = await supabase
    .from('rider_email_alias')
    .select('id, email_uber, rider_id, nota, creado_en, riders(nombre, dni)')
    .order('creado_en', { ascending: false });

  return (data ?? []).map((a) => ({
    id: a.id,
    email_uber: a.email_uber,
    rider_id: a.rider_id,
    rider_nombre: (a.riders as unknown as { nombre: string } | null)?.nombre ?? '—',
    rider_dni: (a.riders as unknown as { dni: string } | null)?.dni ?? '—',
    nota: a.nota,
    creado_en: a.creado_en,
  }));
}

export type AliasActionState = { error?: string; success?: boolean } | undefined;

/**
 * Registra que un email que reporta Uber (`emailUber`) corresponde en
 * realidad a un rider concreto de Closer CRM (`riderId`), aunque no
 * tengan relación de texto entre sí (a diferencia del alias "+driver",
 * que se deduce con una regla, esto requiere confirmación humana).
 */
export async function crearAliasEmail(_prev: AliasActionState, formData: FormData): Promise<AliasActionState> {
  const { supabase, admin } = await assertSuperAdmin();

  const emailUber = String(formData.get('emailUber') || '').trim().toLowerCase();
  const riderDni = String(formData.get('riderDni') || '').trim().toUpperCase();
  const nota = String(formData.get('nota') || '').trim() || null;

  if (!emailUber || !emailUber.includes('@')) return { error: 'Escribe un email válido' };
  if (!riderDni) return { error: 'Selecciona un rider de la lista' };

  const { data: rider } = await supabase.from('riders').select('id').eq('dni', riderDni).maybeSingle();
  if (!rider) return { error: 'No se encontró ese rider' };

  const admClient = createAdminClient();
  const { error } = await admClient.from('rider_email_alias').insert({
    email_uber: emailUber,
    rider_id: rider.id,
    creado_por: admin.id,
    nota,
  });

  if (error) {
    if (error.code === '23505') return { error: 'Ese email de Uber ya está vinculado a otro rider' };
    return { error: registrarError('crearAliasEmail', error, 'No se pudo guardar el alias') };
  }

  revalidatePath('/dashboard/configuracion');
  return { success: true };
}

export async function eliminarAliasEmail(id: number): Promise<{ error?: string }> {
  await assertSuperAdmin();
  const admClient = createAdminClient();
  const { error } = await admClient.from('rider_email_alias').delete().eq('id', id);
  if (error) return { error: registrarError('eliminarAliasEmail', error, 'No se pudo eliminar') };
  revalidatePath('/dashboard/configuracion');
  return {};
}
