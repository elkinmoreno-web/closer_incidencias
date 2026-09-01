'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getAdminActual } from '@/lib/supabase/server';
import { registrarError } from '@/lib/utils';
import type { StockMaterial, StockTipoMovimiento, StockDisponible, StockMovimiento } from '@/lib/types';

async function assertAdmin() {
  const supabase = createClient();
  const yo = await getAdminActual();
  if (!yo || !yo.activo) throw new Error('Sin acceso');
  return { supabase, yo };
}

/** Catálogo de materiales activos, para poblar selects y las cabeceras del panel. */
export async function listarMaterialesStock(): Promise<StockMaterial[]> {
  const { supabase } = await assertAdmin();
  const { data } = await supabase.from('stock_materiales').select('*').eq('activo', true).order('orden');
  return (data ?? []) as StockMaterial[];
}

/** Catálogo de tipos de movimiento, para poblar el selector "Tipo de movimiento". */
export async function listarTiposMovimiento(): Promise<StockTipoMovimiento[]> {
  const { supabase } = await assertAdmin();
  const { data } = await supabase.from('stock_tipos_movimiento').select('*').order('orden');
  return (data ?? []) as StockTipoMovimiento[];
}

/**
 * Stock disponible por centro para UN material, calculado sumando todo
 * el ledger (RLS ya acota a las ciudades del admin actual — no hace
 * falta filtrar de nuevo aquí). Mismo principio que _stkCalculo del
 * sistema de Sheets: no se guarda "el stock actual", se calcula.
 * Se lleva por CENTRO, no por ciudad — dos centros de la misma ciudad
 * pueden tener stock muy distinto (confirmado con los datos reales).
 */
export async function obtenerStockDisponible(materialId: number): Promise<StockDisponible[]> {
  const { supabase } = await assertAdmin();

  const { data: movimientos } = await supabase
    .from('stock_movimientos')
    .select('centro_origen_id, centro_destino_id, unidades, talla_m, talla_l, talla_xl, talla_xxl, tipo_clave, stock_tipos_movimiento(resta_origen, suma_destino)')
    .eq('material_id', materialId);

  const { data: centros } = await supabase.from('centros').select('id, nombre').order('nombre');
  const nombrePorCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));

  const mapa = new Map<number, StockDisponible>();
  function celda(centroId: number): StockDisponible {
    let c = mapa.get(centroId);
    if (!c) {
      c = { material_id: materialId, centro_id: centroId, centro_nombre: nombrePorCentro.get(centroId) ?? '—', disponible: 0, talla_m: 0, talla_l: 0, talla_xl: 0, talla_xxl: 0 };
      mapa.set(centroId, c);
    }
    return c;
  }

  for (const m of movimientos ?? []) {
    const regla = m.stock_tipos_movimiento as unknown as { resta_origen: boolean | null; suma_destino: boolean } | null;
    if (!regla) continue;

    // resta_origen puede ser null en el catálogo (depende de un parámetro
    // de fases siguientes); en esta fase mínima, null se trata como "no resta"
    // — solo importa para DEVOLUCION_ROTA/NO_RECUPERADA, que en la Fase 1
    // todavía no se ofrecen desde la UI (ver listarTiposMovimiento).
    const restaOrigen = regla.resta_origen === true;

    if (restaOrigen && m.centro_origen_id) {
      const c = celda(m.centro_origen_id);
      c.disponible -= m.unidades;
      c.talla_m -= m.talla_m;
      c.talla_l -= m.talla_l;
      c.talla_xl -= m.talla_xl;
      c.talla_xxl -= m.talla_xxl;
    }
    if (regla.suma_destino && m.centro_destino_id) {
      const c = celda(m.centro_destino_id);
      c.disponible += m.unidades;
      c.talla_m += m.talla_m;
      c.talla_l += m.talla_l;
      c.talla_xl += m.talla_xl;
      c.talla_xxl += m.talla_xxl;
    }
  }

  return Array.from(mapa.values())
    .filter((c) => c.disponible !== 0 || c.talla_m || c.talla_l || c.talla_xl || c.talla_xxl)
    .sort((a, b) => a.centro_nombre.localeCompare(b.centro_nombre));
}

export interface RegistrarMovimientoInput {
  materialId: number;
  tipoClave: string;
  centroOrigenId?: number | null;
  centroDestinoId?: number | null;
  cantidad?: number; // materiales sin tallas
  tallaM?: number;
  tallaL?: number;
  tallaXl?: number;
  tallaXxl?: number;
  riderId?: string | null;
  riderNombreLibre?: string | null;
  notas?: string;
}

export type RegistrarMovimientoState = { error: string } | { success: true } | undefined;

/**
 * Registra un movimiento nuevo en el ledger. Reglas mínimas portadas
 * del sistema de Sheets: cantidades no negativas, no puede ser 0, y si
 * no eres super_admin, tanto el origen como el destino (los que
 * apliquen a ese tipo) deben estar entre tus ciudades — RLS ya lo
 * exige a nivel de base, pero se valida aquí primero para dar un
 * mensaje claro en vez de un error genérico de permisos.
 */
export async function registrarMovimientoStock(input: RegistrarMovimientoInput): Promise<RegistrarMovimientoState> {
  try {
    const { supabase, yo } = await assertAdmin();

    const { data: tipo } = await supabase.from('stock_tipos_movimiento').select('*').eq('clave', input.tipoClave).maybeSingle();
    if (!tipo) return { error: 'Tipo de movimiento no reconocido.' };

    if (tipo.requiere_origen && !input.centroOrigenId) return { error: 'Elige el centro de origen.' };
    if (tipo.requiere_destino && !input.centroDestinoId) return { error: 'Elige el centro de destino.' };
    if (input.centroOrigenId && input.centroDestinoId && input.centroOrigenId === input.centroDestinoId) {
      return { error: 'El origen y el destino no pueden ser el mismo centro.' };
    }

    const { data: material } = await supabase.from('stock_materiales').select('*').eq('id', input.materialId).maybeSingle();
    if (!material) return { error: 'Material no reconocido.' };

    let unidades = 0;
    let tallaM = 0;
    let tallaL = 0;
    let tallaXl = 0;
    let tallaXxl = 0;

    if (material.tiene_tallas) {
      tallaM = Math.max(0, input.tallaM ?? 0);
      tallaL = Math.max(0, input.tallaL ?? 0);
      tallaXl = Math.max(0, input.tallaXl ?? 0);
      tallaXxl = Math.max(0, input.tallaXxl ?? 0);
      unidades = tallaM + tallaL + tallaXl + tallaXxl;
    } else {
      unidades = Math.max(0, input.cantidad ?? 0);
    }

    if (unidades === 0) return { error: 'La cantidad no puede ser 0.' };

    const { error } = await supabase.from('stock_movimientos').insert({
      material_id: input.materialId,
      tipo_clave: input.tipoClave,
      centro_origen_id: input.centroOrigenId ?? null,
      centro_destino_id: input.centroDestinoId ?? null,
      unidades,
      talla_m: tallaM,
      talla_l: tallaL,
      talla_xl: tallaXl,
      talla_xxl: tallaXxl,
      rider_id: input.riderId ?? null,
      rider_nombre_libre: input.riderNombreLibre?.trim() || null,
      notas: input.notas?.trim() || null,
      admin_id: yo!.id,
    });

    if (error) return { error: error.message };

    revalidatePath('/dashboard/stock');
    return { success: true };
  } catch (e) {
    return { error: registrarError('registrarMovimientoStock', e, 'No se pudo registrar el movimiento. Inténtalo de nuevo.') };
  }
}

/** Últimos movimientos de un material, para el historial del panel. */
export async function listarMovimientosRecientes(materialId: number, limite = 30): Promise<
  (StockMovimiento & { centro_origen_nombre: string | null; centro_destino_nombre: string | null; admin_usuario: string | null; tipo_etiqueta: string })[]
> {
  const { supabase } = await assertAdmin();
  const { data } = await supabase
    .from('stock_movimientos')
    .select(
      '*, origen:centro_origen_id(nombre), destino:centro_destino_id(nombre), admins(usuario), stock_tipos_movimiento(etiqueta, etiqueta_en)'
    )
    .eq('material_id', materialId)
    .order('created_at', { ascending: false })
    .limit(limite);

  return (data ?? []).map((m: any) => ({
    ...m,
    centro_origen_nombre: m.origen?.nombre ?? null,
    centro_destino_nombre: m.destino?.nombre ?? null,
    admin_usuario: m.admins?.usuario ?? null,
    tipo_etiqueta: m.stock_tipos_movimiento?.etiqueta ?? m.tipo_clave,
  }));
}

export interface FilaImportacionStock {
  centroNombre: string; // tal cual viene en la columna "Ciudad"/"Centro" del CSV
  cantidad: number; // solo materiales sin tallas
  tallaM?: number;
  tallaL?: number;
  tallaXl?: number;
  tallaXxl?: number;
}

export interface ResultadoImportacionStock {
  insertados: number;
  centrosNoEncontrados: string[]; // nombres del CSV que no coinciden con ningún centro real — no se crean solos, se listan para revisión manual
  filasIgnoradas: number; // cantidad 0 en todas las columnas — no aportan nada al ledger
}

/**
 * Importa el stock inicial de un material desde un CSV ya parseado en
 * el navegador (una fila por centro). Cada fila se registra como UN
 * movimiento "Inventario inicial" — no crea centros nuevos: si el
 * nombre del CSV no coincide exacto con un centro ya existente, esa
 * fila se deja fuera y se lista en centrosNoEncontrados (mismo
 * principio defensivo que ImportRidersModal con centros no
 * reconocidos: nunca se inventa nada en silencio).
 *
 * Los valores negativos del CSV se cargan tal cual — son descuadres
 * reales de la operación, no un error del importador (decisión
 * explícita: se corrigen después desde el panel con "Ajuste manual").
 */
export async function importarStockInicial(materialId: number, filas: FilaImportacionStock[]): Promise<ResultadoImportacionStock> {
  const { supabase, yo } = await assertAdmin();

  const { data: centros } = await supabase.from('centros').select('id, nombre');
  const idPorNombreCentro = new Map((centros ?? []).map((c) => [c.nombre.trim().toLowerCase(), c.id]));

  const centrosNoEncontrados: string[] = [];
  const registros: Record<string, unknown>[] = [];
  let filasIgnoradas = 0;

  for (const fila of filas) {
    const centroId = idPorNombreCentro.get(fila.centroNombre.trim().toLowerCase());
    if (!centroId) {
      centrosNoEncontrados.push(fila.centroNombre);
      continue;
    }

    const tallaM = fila.tallaM ?? 0;
    const tallaL = fila.tallaL ?? 0;
    const tallaXl = fila.tallaXl ?? 0;
    const tallaXxl = fila.tallaXxl ?? 0;
    const unidades = tallaM || tallaL || tallaXl || tallaXxl ? tallaM + tallaL + tallaXl + tallaXxl : fila.cantidad;

    if (unidades === 0) {
      filasIgnoradas++;
      continue;
    }

    registros.push({
      material_id: materialId,
      tipo_clave: 'INV_INICIAL',
      centro_destino_id: centroId,
      unidades,
      talla_m: tallaM,
      talla_l: tallaL,
      talla_xl: tallaXl,
      talla_xxl: tallaXxl,
      notas: 'Migración de stock inicial desde el sistema anterior (Google Sheets)',
      admin_id: yo!.id,
    });
  }

  if (registros.length > 0) {
    const { error } = await supabase.from('stock_movimientos').insert(registros);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/dashboard/stock');
  return { insertados: registros.length, centrosNoEncontrados, filasIgnoradas };
}
