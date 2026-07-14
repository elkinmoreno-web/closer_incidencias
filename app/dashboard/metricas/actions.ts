'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { FilaMetricaParseada } from '@/lib/metricasParse';

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: admin } = await supabase.from('admins').select('id, rol, activo').eq('auth_user_id', user.id).single();
  if (!admin || !admin.activo) throw new Error('Sin acceso');
  return { supabase, admin };
}

export interface CentroConId {
  id: number;
  nombre: string;
}

/** Ciudades visibles del admin actual (mismo patrón de zona que el resto del CRM). */
export async function ciudadesConsultablesMetricas(): Promise<string[]> {
  const { supabase, admin } = await assertAdmin();
  if (admin.rol === 'super_admin') {
    const { data } = await supabase.from('ciudades').select('nombre').order('nombre');
    return (data ?? []).map((c) => c.nombre);
  }
  const { data } = await supabase.from('admin_ciudades').select('ciudades(nombre)').eq('admin_id', admin.id);
  return (data ?? []).map((c) => (c.ciudades as unknown as { nombre: string } | null)?.nombre).filter((n): n is string => !!n);
}

/**
 * Sube en bloque las filas ya parseadas en el navegador (parquet/xlsx),
 * usando el cliente de servicio para poder hacer upsert masivo. Se
 * registra en sync_audit_log con source='admin_manual'.
 */
export async function subirLoteMetricas(
  filas: FilaMetricaParseada[],
  meta: { fileName: string; parquetRows: number }
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const t0 = Date.now();
  let admin;
  try {
    ({ admin } = await assertAdmin());
  } catch (e) {
    return { ok: false, inserted: 0, error: (e as Error).message };
  }

  const admClient = createAdminClient();
  const CHUNK = 500;
  let inserted = 0;

  for (let i = 0; i < filas.length; i += CHUNK) {
    const chunk = filas.slice(i, i + CHUNK);
    const { data, error } = await admClient.from('driver_daily_stats').upsert(chunk, { onConflict: 'email,day' }).select('id');
    if (error) {
      await admClient.from('sync_audit_log').insert({
        source: 'admin_manual',
        client_info: admin.id,
        file_name: meta.fileName,
        ok: false,
        error_message: error.message,
        parquet_rows: meta.parquetRows,
        inserted_rows: inserted,
        elapsed_ms: Date.now() - t0,
      });
      return { ok: false, inserted, error: error.message };
    }
    inserted += data?.length ?? chunk.length;
  }

  const maxDay = filas.reduce((acc, r) => (r.day > acc ? r.day : acc), '');
  await admClient.from('sync_audit_log').insert({
    source: 'admin_manual',
    client_info: admin.id,
    file_name: meta.fileName,
    ok: true,
    parquet_rows: meta.parquetRows,
    inserted_rows: inserted,
    max_day: maxDay || null,
    elapsed_ms: Date.now() - t0,
  });

  revalidatePath('/dashboard/metricas');
  return { ok: true, inserted };
}

export interface FilaMetricaAdmin {
  day: string;
  city: string | null;
  name: string | null;
  email: string;
  sh: number | null;
  active_hours: number | null;
  tph: number | null;
  pct_accept: number | null;
  pct_cancel: number | null;
  completed_trips: number | null;
}

/** Métricas de la semana para el admin, ya filtradas por su zona (ciudad como texto libre, emparejada por nombre). */
export async function obtenerMetricasAdmin(fechaLunes: string, fechaDomingo: string, ciudadesFiltro: string[]): Promise<FilaMetricaAdmin[]> {
  const { supabase } = await assertAdmin();

  let query = supabase
    .from('driver_daily_stats')
    .select('day, city, name, email, sh, active_hours, tph, pct_accept, pct_cancel, completed_trips')
    .gte('day', fechaLunes)
    .lte('day', fechaDomingo)
    .order('day', { ascending: false });

  if (ciudadesFiltro.length > 0) {
    query = query.in(
      'city',
      ciudadesFiltro.flatMap((c) => [c, c.toLowerCase(), c.toUpperCase()])
    );
  }

  const { data } = await query;
  return data ?? [];
}

export interface EstadoSincronizacion {
  ok: boolean;
  createdAt: string;
  source: string;
  fileName: string | null;
  insertedRows: number | null;
  errorMessage: string | null;
}

/** Últimas sincronizaciones (automáticas y manuales), para saber si algo falló. */
export async function obtenerEstadoSincronizaciones(): Promise<EstadoSincronizacion[]> {
  const { supabase } = await assertAdmin();
  const { data } = await supabase
    .from('sync_audit_log')
    .select('ok, created_at, source, file_name, inserted_rows, error_message')
    .order('created_at', { ascending: false })
    .limit(10);

  return (data ?? []).map((d) => ({
    ok: d.ok,
    createdAt: d.created_at,
    source: d.source,
    fileName: d.file_name,
    insertedRows: d.inserted_rows,
    errorMessage: d.error_message,
  }));
}
