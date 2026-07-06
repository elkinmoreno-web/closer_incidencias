'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { dniSchema } from '@/lib/validations';

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

/** Busca un centro por nombre (sin distinguir mayúsculas); si no existe, lo crea. */
async function resolverCentroId(admin: ReturnType<typeof createAdminClient>, nombre: string | null): Promise<number | null> {
  if (!nombre) return null;
  const { data: existente } = await admin.from('centros').select('id').ilike('nombre', nombre).maybeSingle();
  if (existente) return existente.id;
  const { data: creado } = await admin.from('centros').insert({ nombre }).select('id').single();
  return creado?.id ?? null;
}

/** Igual que resolverCentroId pero para vehículos. */
async function resolverVehiculoId(admin: ReturnType<typeof createAdminClient>, nombre: string | null): Promise<number | null> {
  if (!nombre) return null;
  const { data: existente } = await admin.from('vehiculos').select('id').ilike('nombre', nombre).maybeSingle();
  if (existente) return existente.id;
  const { data: creado } = await admin.from('vehiculos').insert({ nombre }).select('id').single();
  return creado?.id ?? null;
}

/**
 * Crea el usuario de Auth (contraseña = DNI, sin email de por medio) y la
 * fila en `riders` en la misma operación. Si algo falla a mitad de
 * camino, deshace lo ya creado para no dejar huérfanos.
 */
async function crearUsuarioYFila(admin: ReturnType<typeof createAdminClient>, data: RiderInput, extra: RiderExtra = {}) {
  const { data: existente } = await admin
    .from('riders')
    .select('id')
    .or(`dni.eq.${data.dni},email.eq.${data.email}`)
    .maybeSingle();
  if (existente) return { ok: false as const, motivo: 'DNI o email ya registrado' };

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.dni,
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

export type BulkResultState = { error?: string; resumen?: string } | undefined;

export async function crearRidersMasivo(_prev: BulkResultState, formData: FormData): Promise<BulkResultState> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const texto = String(formData.get('lineas') || '');
  const lineas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lineas.length === 0) return { error: 'Pega al menos una línea' };
  if (lineas.length > 200) return { error: 'Máximo 200 riders por lote' };

  const admin = createAdminClient();
  const [{ data: centros }, { data: vehiculos }] = await Promise.all([
    admin.from('centros').select('id, nombre'),
    admin.from('vehiculos').select('id, nombre'),
  ]);

  let ok = 0;
  const errores: string[] = [];

  for (const linea of lineas) {
    const [nombre, dniRaw, email, centroNombre, vehiculoNombre] = linea.split(',').map((p) => p.trim());

    const parsed = riderSchema.safeParse({
      nombre,
      dni: dniRaw,
      email,
      centroId: centros?.find((c) => c.nombre.toLowerCase() === (centroNombre || '').toLowerCase())?.id ?? null,
      vehiculoId: vehiculos?.find((v) => v.nombre.toLowerCase() === (vehiculoNombre || '').toLowerCase())?.id ?? null,
    });

    if (!parsed.success) {
      errores.push(`${linea} → ${parsed.error.issues[0]?.message}`);
      continue;
    }

    const result = await crearUsuarioYFila(admin, parsed.data);
    if (result.ok) ok++;
    else errores.push(`${linea} → ${result.motivo}`);
  }

  revalidatePath('/dashboard/riders');

  const resumen =
    `${ok} rider(es) creado(s). ${errores.length} con error.` +
    (errores.length ? `\n${errores.slice(0, 10).join('\n')}` : '');
  return { resumen };
}

export async function toggleRiderActivo(id: string, activo: boolean) {
  const supabase = await assertAdmin();
  const { error } = await supabase.from('riders').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/riders');
}

// ============================================================
// IMPORTACIÓN DESDE EXCEL
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
  ok: number;
  errores: string[];
}

/**
 * Procesa un lote (chunk) de filas ya parseadas en el navegador. El
 * cliente llama a esto varias veces en trozos pequeños para no agotar
 * el tiempo máximo de una función serverless con archivos grandes.
 */
export async function importarRidersLote(filas: FilaImportacion[]): Promise<ResultadoImportacionLote> {
  try {
    await assertAdmin();
  } catch (e) {
    return { ok: 0, errores: [(e as Error).message] };
  }

  const admin = createAdminClient();
  let ok = 0;
  const errores: string[] = [];

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

    const centroId = await resolverCentroId(admin, fila.centro);
    const vehiculoId = await resolverVehiculoId(admin, fila.vehiculo);

    const result = await crearUsuarioYFila(
      admin,
      { ...parsed.data, centroId, vehiculoId },
      {
        gestor: fila.gestor,
        activo: fila.activo,
        nacionalidad: fila.nacionalidad,
        genero: fila.genero,
        empresaContratante: fila.empresaContratante,
        provincia: fila.provincia,
        puesto: fila.puesto,
        fechaAlta: fila.fechaAlta,
        fechaBaja: fila.fechaBaja,
        tipoBaja: fila.tipoBaja,
        motivoBaja: fila.motivoBaja,
        fechaNacimiento: fila.fechaNacimiento,
        telefono: fila.telefono,
        direccion: fila.direccion,
        horasTrabajo: fila.horasTrabajo,
        turno: fila.turno,
      }
    );

    if (result.ok) ok++;
    else errores.push(`${fila.nombre} (${fila.dni}): ${result.motivo}`);
  }

  revalidatePath('/dashboard/riders');
  return { ok, errores };
}
