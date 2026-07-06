'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

async function assertSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase
    .from('admins')
    .select('rol')
    .eq('auth_user_id', user.id)
    .single();

  // Comprobación explícita aquí porque las siguientes operaciones usan el
  // cliente de service_role, que se salta las políticas RLS de la base
  // de datos. Sin esta línea, cualquier admin (no solo super_admin)
  // podría crear otros admins.
  if (!admin || admin.rol !== 'super_admin') throw new Error('Solo un Super Admin puede hacer esto');

  return supabase;
}

export async function toggleCentro(id: number, activo: boolean) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('centros').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

export async function toggleVehiculo(id: number, activo: boolean) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('vehiculos').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

export async function toggleMotivo(id: number, activo: boolean) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('motivos').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

export async function toggleMotivoAusencia(id: number, activo: boolean) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('motivos_ausencia').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

export async function publicarAnuncio(mensaje: string) {
  const supabase = await assertSuperAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user!.id).single();

  // Solo un anuncio activo a la vez: desactivamos cualquier anterior.
  await supabase.from('anuncios').update({ activo: false }).eq('activo', true);

  const { error } = await supabase.from('anuncios').insert({
    mensaje: mensaje.trim(),
    activo: true,
    created_by: admin?.id ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/configuracion');
  revalidatePath('/rider/dashboard');
}

export async function desactivarAnuncio(id: number) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('anuncios').update({ activo: false }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/configuracion');
  revalidatePath('/rider/dashboard');
}
export async function crearCentro(nombre: string) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('centros').insert({ nombre: nombre.trim() });
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

const crearAdminSchema = z.object({
  usuario: z.string().trim().min(3),
  email: z.string().trim().email(),
  password: z.string().min(8),
  rol: z.enum(['super_admin', 'moderador', 'admin_zona']),
});

export type CrearAdminState = { error?: string; success?: boolean } | undefined;

export async function crearAdmin(_prev: CrearAdminState, formData: FormData): Promise<CrearAdminState> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = crearAdminSchema.safeParse({
    usuario: formData.get('usuario'),
    email: formData.get('email'),
    password: formData.get('password'),
    rol: formData.get('rol'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const ciudadIds = formData.getAll('ciudadIds').map((v) => Number(v)).filter(Boolean);
  if (parsed.data.rol === 'admin_zona' && ciudadIds.length === 0) {
    return { error: 'Selecciona al menos una ciudad para un Admin de zona' };
  }

  // A partir de aquí SÍ necesitamos el cliente de service_role: crear un
  // usuario de Auth no es una operación normal de base de datos.
  const admin = createAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    return { error: authError?.message ?? 'No se pudo crear el usuario' };
  }

  const { data: nuevoAdmin, error: insertError } = await admin
    .from('admins')
    .insert({
      auth_user_id: authUser.user.id,
      usuario: parsed.data.usuario,
      rol: parsed.data.rol,
      acceso_panel: true,
    })
    .select('id')
    .single();

  if (insertError || !nuevoAdmin) {
    // Revertimos la creación del usuario de Auth para no dejar huérfanos.
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: insertError?.message ?? 'No se pudo crear el administrador' };
  }

  if (parsed.data.rol === 'admin_zona' && ciudadIds.length > 0) {
    const { error: zonasError } = await admin
      .from('admin_ciudades')
      .insert(ciudadIds.map((ciudadId) => ({ admin_id: nuevoAdmin.id, ciudad_id: ciudadId })));

    if (zonasError) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      await admin.from('admins').delete().eq('id', nuevoAdmin.id);
      return { error: zonasError.message };
    }
  }

  revalidatePath('/dashboard/configuracion');
  return { success: true };
}

export async function actualizarZonasAdmin(adminId: string, ciudadIds: number[]) {
  const admin = createAdminClient();
  await assertSuperAdmin();

  await admin.from('admin_ciudades').delete().eq('admin_id', adminId);
  if (ciudadIds.length > 0) {
    const { error } = await admin.from('admin_ciudades').insert(ciudadIds.map((ciudadId) => ({ admin_id: adminId, ciudad_id: ciudadId })));
    if (error) throw new Error(error.message);
  }
  revalidatePath('/dashboard/configuracion');
}
