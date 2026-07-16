'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

import { mensajeError } from '@/lib/utils';
async function getCallerRol(): Promise<{ supabase: ReturnType<typeof createClient>; rol: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('rol').eq('auth_user_id', user.id).single();
  if (!admin) throw new Error('Sin acceso');

  return { supabase, rol: admin.rol };
}

/** Solo Super Admin: catálogos y gestión total de administradores. */
async function assertSuperAdmin() {
  const { supabase, rol } = await getCallerRol();
  if (rol !== 'super_admin') throw new Error('Solo un Super Admin puede hacer esto');
  return supabase;
}

/** Super Admin o Administrador: anuncio global y creación de moderadores. */
async function assertSuperAdminOAdministrador() {
  const { supabase, rol } = await getCallerRol();
  if (rol !== 'super_admin' && rol !== 'administrador') throw new Error('No tienes permiso para hacer esto');
  return { supabase, rol };
}

export async function toggleCentro(id: number, activo: boolean) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('centros').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

/**
 * Asigna (o cambia) la ciudad de un centro. Hace falta sobre todo para
 * los centros que se crean solos al importar el Excel de riders: si el
 * nombre no permitió adivinar la ciudad (p. ej. centros fuera de
 * España), quedan sin agrupar y por tanto invisibles para los admins
 * restringidos por zona hasta que alguien se la asigna aquí.
 */
export async function asignarCiudadCentro(centroId: number, ciudadId: number | null) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('centros').update({ ciudad_id: ciudadId }).eq('id', centroId);
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

/**
 * Guarda las instrucciones que ve el rider en un popup cuando se aprueba
 * una incidencia de este motivo. Vacío = no se muestra ningún popup.
 */
export async function actualizarInstruccionesMotivo(id: number, instrucciones: string) {
  const supabase = await assertSuperAdmin();
  const valor = instrucciones.trim() || null;
  const { error } = await supabase.from('motivos').update({ instrucciones_aprobacion: valor }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

export async function toggleMotivoAusencia(id: number, activo: boolean) {
  const supabase = await assertSuperAdmin();
  const { error } = await supabase.from('motivos_ausencia').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/configuracion');
}

/**
 * Publica un anuncio, global o dirigido a una ciudad concreta. Ahora
 * pueden coexistir varios anuncios activos a la vez (uno global + varios
 * por ciudad, o los que hagan falta) — ya no se desactivan los
 * anteriores automáticamente.
 *
 * - Super Admin: puede publicar global (ciudadId = null) o en cualquier ciudad.
 * - Administrador (zona limitada): SOLO puede publicar en una de sus
 *   propias ciudades asignadas, nunca global ni en ciudad ajena.
 */
export async function publicarAnuncio(mensaje: string, ciudadId: number | null, audiencia: 'todos' | 'admins' | 'riders' = 'todos') {
  const { supabase, rol } = await assertSuperAdminOAdministrador();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user!.id).single();

  if (rol !== 'super_admin') {
    if (ciudadId === null) throw new Error('Solo un Super Admin puede publicar un anuncio global');
    const { data: misCiudades } = await supabase.from('admin_ciudades').select('ciudad_id').eq('admin_id', admin!.id);
    const permitido = (misCiudades ?? []).some((c) => c.ciudad_id === ciudadId);
    if (!permitido) throw new Error('Solo puedes publicar anuncios en tus propias ciudades');
  }

  const { error } = await supabase.from('anuncios').insert({
    mensaje: mensaje.trim(),
    activo: true,
    ciudad_id: ciudadId,
    audiencia,
    created_by: admin?.id ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/configuracion');
  revalidatePath('/rider/dashboard');
}

export async function desactivarAnuncio(id: number) {
  const { supabase, rol } = await assertSuperAdminOAdministrador();

  if (rol !== 'super_admin') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user!.id).single();
    const { data: anuncio } = await supabase.from('anuncios').select('ciudad_id').eq('id', id).single();
    if (!anuncio) throw new Error('Anuncio no encontrado');
    if (anuncio.ciudad_id === null) throw new Error('Solo un Super Admin puede quitar un anuncio global');
    const { data: misCiudades } = await supabase.from('admin_ciudades').select('ciudad_id').eq('admin_id', admin!.id);
    const permitido = (misCiudades ?? []).some((c) => c.ciudad_id === anuncio.ciudad_id);
    if (!permitido) throw new Error('No puedes quitar un anuncio de una ciudad que no es tuya');
  }

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
  rol: z.enum(['super_admin', 'administrador', 'moderador']),
});

export type CrearAdminState = { error?: string; success?: boolean } | undefined;

export async function crearAdmin(_prev: CrearAdminState, formData: FormData): Promise<CrearAdminState> {
  let callerRol: string;
  try {
    const res = await assertSuperAdminOAdministrador();
    callerRol = res.rol;
  } catch (e) {
    return { error: mensajeError(e) };
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

  // Un Administrador (no Super Admin) solo puede crear moderadores,
  // sin importar lo que llegue en el formulario.
  if (callerRol === 'administrador' && parsed.data.rol !== 'moderador') {
    return { error: 'Solo puedes crear cuentas de tipo Moderador' };
  }

  const ciudadIds = formData.getAll('ciudadIds').map((v) => Number(v)).filter(Boolean);
  if ((parsed.data.rol === 'moderador' || parsed.data.rol === 'administrador') && ciudadIds.length === 0) {
    return { error: 'Selecciona al menos una ciudad para este usuario' };
  }

  // Si quien crea es Administrador, las ciudades asignadas deben ser un
  // subconjunto de las suyas (defensa en servidor, no solo en el form).
  if (callerRol === 'administrador') {
    const supabaseAuth = createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    const { data: yo } = await supabaseAuth.from('admins').select('id').eq('auth_user_id', user!.id).single();
    const { data: misCiudades } = await supabaseAuth.from('admin_ciudades').select('ciudad_id').eq('admin_id', yo!.id);
    const permitidas = new Set((misCiudades ?? []).map((c) => c.ciudad_id));
    const fueraDeZona = ciudadIds.filter((c) => !permitidas.has(c));
    if (fueraDeZona.length > 0) {
      return { error: 'Solo puedes asignar ciudades que están dentro de tu propia zona' };
    }
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

  if ((parsed.data.rol === 'moderador' || parsed.data.rol === 'administrador') && ciudadIds.length > 0) {
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
  await assertSuperAdminOAdministrador();
  const admin = createAdminClient();

  await admin.from('admin_ciudades').delete().eq('admin_id', adminId);
  if (ciudadIds.length > 0) {
    const { error } = await admin.from('admin_ciudades').insert(ciudadIds.map((ciudadId) => ({ admin_id: adminId, ciudad_id: ciudadId })));
    if (error) throw new Error(error.message);
  }
  revalidatePath('/dashboard/configuracion');
}

/**
 * Cambia el rol de un administrador. Solo el Super Admin puede hacerlo.
 * No se permite cambiar el propio rol (para no quedarse sin super_admin
 * por error) ni dejar a alguien con un rol inválido.
 *
 * IMPORTANTE: si el nuevo rol es 'administrador' o 'moderador' (roles
 * restringidos por zona), hay que indicar `ciudadIds` con al menos una
 * ciudad — si no, la persona quedaría con un rol de zona pero sin
 * ninguna zona asignada, viendo el panel completamente vacío/bloqueado.
 * El cambio de rol y la asignación de ciudades se guardan juntos, en la
 * misma operación, para que nunca quede a medias.
 */
export async function cambiarRolAdmin(adminId: string, nuevoRol: 'super_admin' | 'administrador' | 'moderador', ciudadIds: number[] = []) {
  const supabase = await assertSuperAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: objetivo } = await supabase.from('admins').select('id, auth_user_id, rol').eq('id', adminId).single();
  if (!objetivo) throw new Error('Administrador no encontrado');
  if (objetivo.auth_user_id === user!.id) throw new Error('No puedes cambiar tu propio rol');

  if (nuevoRol !== 'super_admin' && ciudadIds.length === 0) {
    throw new Error('Este rol necesita al menos una ciudad asignada; selecciona una antes de aplicar el cambio');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('admins').update({ rol: nuevoRol }).eq('id', adminId);
  if (error) throw new Error(error.message);

  // Guardamos las ciudades en la misma operación (nunca queda un rol de
  // zona sin ciudades). Si pasa a super_admin, no tocamos sus ciudades
  // anteriores (quedan guardadas por si vuelve a bajar de rol luego).
  if (nuevoRol !== 'super_admin') {
    await admin.from('admin_ciudades').delete().eq('admin_id', adminId);
    const { error: errorCiudades } = await admin.from('admin_ciudades').insert(ciudadIds.map((ciudadId) => ({ admin_id: adminId, ciudad_id: ciudadId })));
    if (errorCiudades) throw new Error(errorCiudades.message);
  }

  revalidatePath('/dashboard/configuracion');
}

/**
 * Activa o desactiva un administrador (sin borrarlo). Un admin
 * desactivado no puede entrar (is_admin() exige activo=true). No puedes
 * desactivarte a ti mismo.
 */
export async function toggleAdminActivo(adminId: string, activo: boolean) {
  const supabase = await assertSuperAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: objetivo } = await supabase.from('admins').select('id, auth_user_id').eq('id', adminId).single();
  if (!objetivo) throw new Error('Administrador no encontrado');
  if (objetivo.auth_user_id === user!.id) throw new Error('No puedes desactivar tu propia cuenta');

  const admin = createAdminClient();
  const { error } = await admin.from('admins').update({ activo }).eq('id', adminId);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/configuracion');
}

/**
 * Establece una nueva contraseña para un administrador. Solo Super
 * Admin. La contraseña la escribe el Super Admin en el momento (mínimo 8
 * caracteres) y se aplica directamente en Auth; no se guarda en claro en
 * ningún sitio.
 */
export async function cambiarPasswordAdmin(adminId: string, nuevaPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertSuperAdmin();
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }

  if (!nuevaPassword || nuevaPassword.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const admin = createAdminClient();
  const { data: objetivo } = await admin.from('admins').select('auth_user_id').eq('id', adminId).single();
  if (!objetivo?.auth_user_id) return { ok: false, error: 'Administrador no encontrado o sin cuenta de acceso' };

  const { error } = await admin.auth.admin.updateUserById(objetivo.auth_user_id, { password: nuevaPassword });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
