'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { dniSchema } from '@/lib/validations';
import { generarPasswordRider, mensajeError, registrarError } from '@/lib/utils';
import { nombreCentroOficial, normalizarNombreCentro } from '@/lib/mapeoCentros';

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id, activo').eq('auth_user_id', user.id).single();
  if (!admin || !admin.activo) throw new Error('Sin acceso');

  return supabase;
}

const riderSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre demasiado corto'),
  dni: dniSchema,
  email: z.string().trim().toLowerCase().email('Email no válido'),
  centroId: z.number().int().positive().nullable(),
  vehiculoId: z.number().int().positive().nullable(),
});

type RiderInput = z.infer<typeof riderSchema>;

interface RiderExtra {
  gestor?: string | null;
  activo?: boolean;
  nacionalidad?: string | null;
  genero?: string | null;
  empresaContratante?: string | null;
  provincia?: string | null;
  puesto?: string | null;
  fechaAlta?: string | null;
  fechaBaja?: string | null;
  tipoBaja?: string | null;
  motivoBaja?: string | null;
  fechaNacimiento?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  horasTrabajo?: number | null;
  turno?: string | null;
}

/**
 * Crea el usuario de Auth (contraseña generada a partir del nombre) y la
 * fila en `riders` en la misma operación. Si algo falla a mitad de
 * camino, deshace lo ya creado para no dejar huérfanos.
 */
async function crearUsuarioYFila(
  admin: ReturnType<typeof createAdminClient>,
  data: RiderInput,
  extra: RiderExtra = {},
  comprobarDuplicado = true
) {
  // En la importación por lotes ya sabemos de antemano quién es nuevo
  // (se separó con una única consulta "IN"), así que se puede saltar
  // esta comprobación y ahorrar una consulta por cada rider nuevo. En el
  // alta individual sí la hacemos.
  if (comprobarDuplicado) {
    const { data: existente } = await admin
      .from('riders')
      .select('id')
      .or(`dni.eq.${data.dni},email.eq.${data.email}`)
      .maybeSingle();
    if (existente) return { ok: false as const, motivo: 'DNI o email ya registrado' };
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: generarPasswordRider(data.nombre),
    email_confirm: true,
  });
  if (authError || !authUser.user) return { ok: false as const, motivo: authError?.message ?? 'No se pudo crear el acceso' };

  const { error: insertError } = await admin.from('riders').insert({
    auth_user_id: authUser.user.id,
    nombre: data.nombre,
    dni: data.dni,
    email: data.email,
    centro_id: data.centroId,
    vehiculo_id: data.vehiculoId,
    gestor: extra.gestor ?? null,
    activo: extra.activo ?? true,
    nacionalidad: extra.nacionalidad ?? null,
    genero: extra.genero ?? null,
    empresa_contratante: extra.empresaContratante ?? null,
    provincia: extra.provincia ?? null,
    puesto: extra.puesto ?? null,
    fecha_alta: extra.fechaAlta ?? null,
    fecha_baja: extra.fechaBaja ?? null,
    tipo_baja: extra.tipoBaja ?? null,
    motivo_baja: extra.motivoBaja ?? null,
    fecha_nacimiento: extra.fechaNacimiento ?? null,
    telefono: extra.telefono ?? null,
    direccion: extra.direccion ?? null,
    horas_trabajo: extra.horasTrabajo ?? null,
    turno: extra.turno ?? null,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { ok: false as const, motivo: insertError.message };
  }
  return { ok: true as const };
}

export type RiderFormState = { error?: string; success?: boolean } | undefined;

export async function crearRider(_prev: RiderFormState, formData: FormData): Promise<RiderFormState> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: mensajeError(e) };
  }

  const parsed = riderSchema.safeParse({
    nombre: formData.get('nombre'),
    dni: formData.get('dni'),
    email: formData.get('email'),
    centroId: formData.get('centroId') ? Number(formData.get('centroId')) : null,
    vehiculoId: formData.get('vehiculoId') ? Number(formData.get('vehiculoId')) : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };

  const admin = createAdminClient();
  const result = await crearUsuarioYFila(admin, parsed.data);
  if (!result.ok) return { error: result.motivo };

  revalidatePath('/dashboard/riders');
  return { success: true };
}

export async function toggleRiderActivo(id: string, activo: boolean) {
  const supabase = await assertAdmin();
  const { error } = await supabase.from('riders').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/riders');
}

/**
 * Recalcula la contraseña de un rider según el esquema actual
 * (inicial del nombre + inicial del apellido + 123456). Útil para
 * riders creados antes de este cambio, que todavía tienen su DNI
 * como contraseña.
 */
export async function restablecerPasswordRider(riderId: string): Promise<{ ok: boolean; motivo?: string; passwordNueva?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { ok: false, motivo: mensajeError(e) };
  }

  const admin = createAdminClient();
  const { data: rider } = await admin.from('riders').select('nombre, auth_user_id').eq('id', riderId).maybeSingle();
  if (!rider || !rider.auth_user_id) return { ok: false, motivo: 'Rider no encontrado' };

  const nuevaPassword = generarPasswordRider(rider.nombre);
  const { error } = await admin.auth.admin.updateUserById(rider.auth_user_id, { password: nuevaPassword });
  if (error) return { ok: false, motivo: error.message };

  return { ok: true, passwordNueva: nuevaPassword };
}

// ============================================================
// IMPORTACIÓN DESDE EXCEL — por lotes
//
// Centros/vehículos se resuelven en memoria (una consulta por lote, no
// por fila); existentes se detectan con un único IN y se actualizan con
// un UPSERT en bloque. Solo los riders nuevos pasan por creación de
// Auth (no se puede hacer en bloque), en paralelo.
// ============================================================
export interface FilaImportacion {
  nombre: string;
  dni: string;
  email: string;
  nacionalidad: string | null;
  genero: string | null;
  centro: string | null;
  empresaContratante: string | null;
  provincia: string | null;
  puesto: string | null;
  fechaAlta: string | null;
  fechaBaja: string | null;
  tipoBaja: string | null;
  motivoBaja: string | null;
  fechaNacimiento: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  vehiculo: string | null;
  horasTrabajo: number | null;
  turno: string | null;
  gestor: string | null;
}

export interface ResultadoImportacionLote {
  creados: number;
  actualizados: number;
  errores: string[];
  sinCentro: string[];
}

/** Ejecuta un array de tareas asíncronas con un límite de concurrencia,
 *  para no lanzar miles de peticiones a la vez ni ir una por una. */
async function conConcurrencia<T, R>(items: T[], limite: number, tarea: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let indice = 0;
  async function trabajador() {
    while (indice < items.length) {
      const i = indice++;
      resultados[i] = await tarea(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}

/**
 * Procesa un lote (chunk) de filas ya parseadas en el navegador. El
 * cliente llama a esto varias veces en trozos, para no agotar el tiempo
 * máximo de una función serverless con el archivo completo de golpe.
 */
export async function importarRidersLote(filas: FilaImportacion[]): Promise<ResultadoImportacionLote> {
  try {
    await assertAdmin();
  } catch (e) {
    return { creados: 0, actualizados: 0, errores: [mensajeError(e)], sinCentro: [] };
  }

  const admin = createAdminClient();
  const errores: string[] = [];
  const sinCentro: string[] = [];

  // ---- 1. Validar cada fila y quedarnos con las que tienen datos correctos ----
  const validas: { fila: FilaImportacion; dni: string; email: string }[] = [];
  for (const fila of filas) {
    const parsed = riderSchema.safeParse({
      nombre: fila.nombre,
      dni: fila.dni,
      email: fila.email,
      centroId: null,
      vehiculoId: null,
    });
    if (!parsed.success) {
      errores.push(`${fila.nombre} (${fila.dni}): ${parsed.error.issues[0]?.message}`);
      continue;
    }
    validas.push({ fila, dni: parsed.data.dni, email: parsed.data.email });
  }
  if (validas.length === 0) return { creados: 0, actualizados: 0, errores, sinCentro };

  // ---- 2. Traer centros, vehículos y ciudades UNA vez para todo el lote ----
  const [{ data: centros }, { data: vehiculos }, { data: ciudades }] = await Promise.all([
    admin.from('centros').select('id, nombre'),
    admin.from('vehiculos').select('id, nombre'),
    admin.from('ciudades').select('id, nombre'),
  ]);

  // Mapa de centros de la BD indexado por nombre normalizado, para
  // encontrarlos sin importar tildes/mayúsculas.
  const centroMap = new Map((centros ?? []).map((c) => [normalizarNombreCentro(c.nombre), c.id]));
  const vehiculoMap = new Map((vehiculos ?? []).map((v) => [v.nombre.toLowerCase().trim(), v.id]));
  const ciudadMap = new Map((ciudades ?? []).map((c) => [normalizarNombreCentro(c.nombre), c.id]));

  /**
   * Crea un centro nuevo (y su ciudad, si hace falta) y los guarda en
   * los mapas en memoria para no repetir la creación dentro del mismo
   * lote.
   */
  async function crearCentroYCiudad(nombreCentro: string, nombreCiudad: string): Promise<number | null> {
    const claveCentro = normalizarNombreCentro(nombreCentro);
    const claveCiudad = normalizarNombreCentro(nombreCiudad);

    let ciudadId = ciudadMap.get(claveCiudad);
    if (!ciudadId) {
      const { data: ciudadNueva } = await admin.from('ciudades').insert({ nombre: nombreCiudad }).select('id').single();
      if (ciudadNueva) {
        ciudadId = ciudadNueva.id;
        ciudadMap.set(claveCiudad, ciudadNueva.id);
      }
    }

    const { data: centroNuevo } = await admin
      .from('centros')
      .insert({ nombre: nombreCentro, ciudad_id: ciudadId ?? null, activo: true })
      .select('id')
      .single();
    if (centroNuevo) {
      centroMap.set(claveCentro, centroNuevo.id);
      return centroNuevo.id;
    }
    return null;
  }

  /** Crea un centro SIN ciudad asignada (para que un admin se la asigne después desde Configuración). */
  async function crearCentroSinCiudad(nombreCentro: string): Promise<number | null> {
    const claveCentro = normalizarNombreCentro(nombreCentro);
    const { data: centroNuevo } = await admin.from('centros').insert({ nombre: nombreCentro, ciudad_id: null, activo: true }).select('id').single();
    if (centroNuevo) {
      centroMap.set(claveCentro, centroNuevo.id);
      return centroNuevo.id;
    }
    return null;
  }

  /**
   * Traduce el nombre del Excel al centro real de la BD.
   * - Si el nombre del Excel está en el mapeo y ese centro existe → su id.
   * - Si no está en el mapeo, probamos por si el nombre del Excel ya
   *   coincide tal cual con un centro de la BD.
   * - Si es un centro "MCD" (operación aparte, con sus propios riders) y
   *   no existe todavía, SÍ se crea: tanto el centro como una ciudad con
   *   el mismo nombre.
   * - Si la fila es de Alemania (Closer Go Germany GmbH) y el centro no
   *   existe todavía, TAMBIÉN se crea, con la ciudad derivada del nombre.
   * - Para cualquier OTRO centro no reconocido → también se crea, pero
   *   SIN ciudad asignada (queda pendiente de asignar a mano desde
   *   Configuración → Centros); así ningún rider se queda sin centro
   *   solo porque el nombre no estaba en el mapeo.
   */
  async function resolverCentro(nombreExcel: string | null, nombreRider: string, empresaContratante: string | null): Promise<number | null> {
    if (!nombreExcel) return null;

    const oficial = nombreCentroOficial(nombreExcel);
    if (oficial) {
      const id = centroMap.get(normalizarNombreCentro(oficial));
      if (id) return id;
    }

    // Por si el Excel ya trae el nombre tal cual está en la BD.
    const directo = centroMap.get(normalizarNombreCentro(nombreExcel));
    if (directo) return directo;

    if (normalizarNombreCentro(nombreExcel).startsWith('mcd')) {
      const nombreLimpio = nombreExcel.trim();
      const id = await crearCentroYCiudad(nombreLimpio, nombreLimpio);
      if (id) return id;
    }

    const esAlemania = normalizarNombreCentro(empresaContratante ?? '') === 'closer go germany gmbh';
    if (esAlemania) {
      const nombreCiudad = nombreExcel.trim().replace(/^fd\s+/i, '').toUpperCase();
      const id = await crearCentroYCiudad(nombreExcel.trim(), nombreCiudad);
      if (id) return id;
    }

    // Cualquier otro centro no reconocido: se crea igual, sin ciudad.
    const idSinCiudad = await crearCentroSinCiudad(nombreExcel.trim());
    if (idSinCiudad) {
      sinCentro.push(`${nombreRider}: centro "${nombreExcel}" no existía, se creó nuevo pero SIN ciudad asignada — asígnasela en Configuración`);
      return idSinCiudad;
    }

    sinCentro.push(`${nombreRider}: centro "${nombreExcel}" no reconocido y no se pudo crear, se importa sin centro`);
    return null;
  }

  async function resolverVehiculo(nombre: string | null): Promise<number | null> {
    if (!nombre) return null;
    const key = nombre.toLowerCase().trim();
    const existenteId = vehiculoMap.get(key);
    if (existenteId) return existenteId;
    // Los vehículos sí se crean (son pocos y no afectan a la visibilidad
    // por zona como los centros).
    const { data } = await admin.from('vehiculos').insert({ nombre }).select('id').single();
    if (data) vehiculoMap.set(key, data.id);
    return data?.id ?? null;
  }

  // Resolver centro (en memoria, instantáneo) y vehículo de cada fila.
  const conIds = [];
  for (const v of validas) {
    const centroId = await resolverCentro(v.fila.centro, v.fila.nombre, v.fila.empresaContratante);
    const vehiculoId = await resolverVehiculo(v.fila.vehiculo);
    conIds.push({ ...v, centroId, vehiculoId });
  }

  // ---- 3. Averiguar en UNA consulta quiénes ya existen (por DNI) ----
  const dnis = conIds.map((v) => v.dni);
  const { data: existentes } = await admin.from('riders').select('id, dni, email, auth_user_id').in('dni', dnis);
  const existentePorDni = new Map((existentes ?? []).map((r) => [r.dni, r]));

  const paraActualizar = conIds.filter((v) => existentePorDni.has(v.dni));
  const paraCrear = conIds.filter((v) => !existentePorDni.has(v.dni));

  let actualizados = 0;
  let creados = 0;

  // ---- 4. Actualizar los que ya existen: un único UPSERT para todos ----
  if (paraActualizar.length > 0) {
    const filasUpdate = paraActualizar.map((v) => ({
      id: existentePorDni.get(v.dni)!.id,
      nombre: v.fila.nombre,
      dni: v.dni,
      email: v.email,
      centro_id: v.centroId,
      vehiculo_id: v.vehiculoId,
      gestor: v.fila.gestor,
      activo: v.fila.activo,
      nacionalidad: v.fila.nacionalidad,
      genero: v.fila.genero,
      empresa_contratante: v.fila.empresaContratante,
      provincia: v.fila.provincia,
      puesto: v.fila.puesto,
      fecha_alta: v.fila.fechaAlta,
      fecha_baja: v.fila.fechaBaja,
      tipo_baja: v.fila.tipoBaja,
      motivo_baja: v.fila.motivoBaja,
      fecha_nacimiento: v.fila.fechaNacimiento,
      telefono: v.fila.telefono,
      direccion: v.fila.direccion,
      horas_trabajo: v.fila.horasTrabajo,
      turno: v.fila.turno,
    }));

    const { error } = await admin.from('riders').upsert(filasUpdate, { onConflict: 'id' });
    if (error) {
      errores.push(`No se pudieron actualizar ${filasUpdate.length} riders existentes: ${error.message}`);
    } else {
      actualizados = filasUpdate.length;
    }

    // Si además cambió el email respecto al que tenían, hay que
    // actualizarlo también en Auth (si no, el login dejaría de coincidir).
    const conEmailCambiado = paraActualizar.filter((v) => existentePorDni.get(v.dni)!.email !== v.email);
    if (conEmailCambiado.length > 0) {
      await conConcurrencia(conEmailCambiado, 10, async (v) => {
        const authId = existentePorDni.get(v.dni)!.auth_user_id;
        if (!authId) return;
        const { error: authErr } = await admin.auth.admin.updateUserById(authId, { email: v.email });
        if (authErr) errores.push(`${v.fila.nombre} (${v.dni}): no se pudo actualizar el email de acceso — ${authErr.message}`);
      });
    }
  }

  // ---- 5. Crear los genuinamente nuevos (necesitan usuario de Auth) ----
  if (paraCrear.length > 0) {
    const resultados = await conConcurrencia(paraCrear, 10, async (v) => {
      const result = await crearUsuarioYFila(
        admin,
        { nombre: v.fila.nombre, dni: v.dni, email: v.email, centroId: v.centroId, vehiculoId: v.vehiculoId },
        {
          gestor: v.fila.gestor,
          activo: v.fila.activo,
          nacionalidad: v.fila.nacionalidad,
          genero: v.fila.genero,
          empresaContratante: v.fila.empresaContratante,
          provincia: v.fila.provincia,
          puesto: v.fila.puesto,
          fechaAlta: v.fila.fechaAlta,
          fechaBaja: v.fila.fechaBaja,
          tipoBaja: v.fila.tipoBaja,
          motivoBaja: v.fila.motivoBaja,
          fechaNacimiento: v.fila.fechaNacimiento,
          telefono: v.fila.telefono,
          direccion: v.fila.direccion,
          horasTrabajo: v.fila.horasTrabajo,
          turno: v.fila.turno,
        },
        false // ya sabemos que es nuevo; no repetir la comprobación de duplicado
      );
      return { v, result };
    });

    for (const { v, result } of resultados) {
      if (result.ok) creados++;
      else errores.push(`${v.fila.nombre} (${v.dni}): ${result.motivo}`);
    }
  }

  revalidatePath('/dashboard/riders');
  return { creados, actualizados, errores, sinCentro };
}

/**
 * Recalcula la contraseña de TODOS los riders con acceso, usando el
 * esquema actual. Pensado para cuando se ha reimportado el Excel y las
 * contraseñas quedaron desactualizadas (ej. porque los riders no se
 * borraron de verdad, solo se desactivaron, así que el import los trató
 * como "ya existentes" y nunca tocó su contraseña). Requiere super_admin
 * por lo disruptivo que es: cambia el acceso de todo el mundo de golpe.
 */
export async function recalcularTodasLasPasswords(): Promise<{ ok: boolean; actualizados: number; errores: string[] }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, actualizados: 0, errores: ['No autenticado'] };

  const { data: yo } = await supabase.from('admins').select('rol').eq('auth_user_id', user.id).single();
  if (yo?.rol !== 'super_admin') return { ok: false, actualizados: 0, errores: ['Solo un Super Admin puede hacer esto'] };

  const admin = createAdminClient();
  const { data: riders } = await admin.from('riders').select('id, nombre, auth_user_id').not('auth_user_id', 'is', null);
  if (!riders || riders.length === 0) return { ok: true, actualizados: 0, errores: [] };

  const errores: string[] = [];
  const resultados = await conConcurrencia(riders, 10, async (rider) => {
    const nuevaPassword = generarPasswordRider(rider.nombre);
    const { error } = await admin.auth.admin.updateUserById(rider.auth_user_id!, { password: nuevaPassword });
    return { rider, ok: !error, error };
  });

  let actualizados = 0;
  for (const { rider, ok, error } of resultados) {
    if (ok) actualizados++;
    else errores.push(`${rider.nombre}: ${error?.message}`);
  }

  return { ok: true, actualizados, errores };
}

/**
 * Edita los datos de un rider ya existente — pensado para corregir
 * errores al crearlo (centro equivocado, DNI mal tecleado, etc.), no
 * para el uso diario. Solo super_admin puede hacerlo, dado el impacto
 * (cambiar el email, por ejemplo, también cambia con qué inicia sesión).
 */
const editarRiderSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre demasiado corto'),
  dni: dniSchema,
  email: z.string().trim().toLowerCase().email('Email no válido'),
  centroId: z.number().int().positive().nullable(),
  vehiculoId: z.number().int().positive().nullable(),
});

export async function editarRider(
  riderId: string,
  datos: { nombre: string; dni: string; email: string; centroId: number | null; vehiculoId: number | null }
): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: 'No autenticado' };

  const { data: yo } = await supabase.from('admins').select('rol, activo').eq('auth_user_id', user.id).single();
  if (!yo?.activo || yo.rol !== 'super_admin') return { ok: false, motivo: 'Solo un Super Admin puede editar riders' };

  const parsed = editarRiderSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, motivo: parsed.error.issues[0]?.message ?? 'Datos no válidos' };

  const admin = createAdminClient();

  const { data: actual } = await admin.from('riders').select('auth_user_id, email, dni').eq('id', riderId).maybeSingle();
  if (!actual) return { ok: false, motivo: 'Rider no encontrado' };

  // DNI/email únicos entre los DEMÁS riders (no chocar consigo mismo).
  const { data: choque } = await admin
    .from('riders')
    .select('id')
    .or(`dni.eq.${parsed.data.dni},email.eq.${parsed.data.email}`)
    .neq('id', riderId)
    .maybeSingle();
  if (choque) return { ok: false, motivo: 'Ese DNI o email ya lo usa otro rider' };

  // Si cambia el email, también hay que actualizarlo en Auth — el
  // rider inicia sesión con su DNI, pero por dentro Supabase Auth usa
  // el email; si no coinciden, se rompe el login.
  if (actual.auth_user_id && parsed.data.email !== actual.email) {
    const { error: authError } = await admin.auth.admin.updateUserById(actual.auth_user_id, { email: parsed.data.email });
    if (authError) return { ok: false, motivo: `No se pudo actualizar el email de acceso: ${mensajeError(authError)}` };
  }

  const { error } = await admin
    .from('riders')
    .update({
      nombre: parsed.data.nombre,
      dni: parsed.data.dni,
      email: parsed.data.email,
      centro_id: parsed.data.centroId,
      vehiculo_id: parsed.data.vehiculoId,
    })
    .eq('id', riderId);
  if (error) return { ok: false, motivo: mensajeError(error) };

  revalidatePath('/dashboard/riders');
  return { ok: true };
}
