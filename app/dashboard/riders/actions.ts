'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { dniSchema } from '@/lib/validations';
import { generarPasswordRider } from '@/lib/utils';
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
    return { error: (e as Error).message };
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
    return { ok: false, motivo: (e as Error).message };
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
// IMPORTACIÓN DESDE EXCEL — versión rápida por lotes
//
// La versión anterior hacía ~5 consultas por cada fila (comprobar
// duplicado, buscar/crear centro, buscar/crear vehículo...), lo que con
// ~4500 filas se traducía en decenas de miles de idas y vueltas a la
// base de datos. Como el mismo Excel completo se sube a diario y la
// inmensa mayoría de filas ya existen, el cambio clave es: en vez de
// tratar cada fila una por una, resolvemos centros/vehículos en memoria
// (una sola consulta por lote, no una por fila), separamos de una vez
// quién ya existe (una sola consulta con "IN", no una por fila) y
// actualizamos a todos los existentes con un único UPSERT. Solo los
// riders genuinamente NUEVOS necesitan pasar por la creación de su
// acceso (Auth), que es lo único que no se puede hacer en bloque — para
// eso usamos varias creaciones en paralelo en vez de una por una.
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
    return { creados: 0, actualizados: 0, errores: [(e as Error).message], sinCentro: [] };
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

  // ---- 2. Traer centros y vehículos UNA vez para todo el lote ----
  const [{ data: centros }, { data: vehiculos }] = await Promise.all([
    admin.from('centros').select('id, nombre'),
    admin.from('vehiculos').select('id, nombre'),
  ]);

  // Mapa de centros de la BD indexado por nombre normalizado, para
  // encontrarlos sin importar tildes/mayúsculas.
  const centroMap = new Map((centros ?? []).map((c) => [normalizarNombreCentro(c.nombre), c.id]));
  const vehiculoMap = new Map((vehiculos ?? []).map((v) => [v.nombre.toLowerCase().trim(), v.id]));

  /**
   * Traduce el nombre del Excel al centro real de la BD. NO crea centros.
   * - Si el nombre del Excel está en el mapeo y ese centro existe → su id.
   * - Si no está en el mapeo, probamos por si el nombre del Excel ya
   *   coincide tal cual con un centro de la BD.
   * - Si no hay forma → null, y lo anotamos para avisar.
   */
  function resolverCentro(nombreExcel: string | null, nombreRider: string): number | null {
    if (!nombreExcel) return null;

    const oficial = nombreCentroOficial(nombreExcel);
    if (oficial) {
      const id = centroMap.get(normalizarNombreCentro(oficial));
      if (id) return id;
    }

    // Por si el Excel ya trae el nombre tal cual está en la BD.
    const directo = centroMap.get(normalizarNombreCentro(nombreExcel));
    if (directo) return directo;

    sinCentro.push(`${nombreRider}: centro "${nombreExcel}" no reconocido, se importa sin centro`);
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
    const centroId = resolverCentro(v.fila.centro, v.fila.nombre);
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
