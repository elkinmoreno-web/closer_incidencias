'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getAdminActual } from '@/lib/supabase/server';
import { registrarError } from '@/lib/utils';
import type { StockMaterial, StockTipoMovimiento, StockDisponible, StockMovimiento, StockParametros } from '@/lib/types';

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
 *
 * Devuelve también los campos que alimentan el semáforo de reposición
 * (consumo en la ventana configurada, días sin movimiento) — el
 * cálculo final del semáforo en sí (CRÍTICO/BAJO/OK/...) se hace en
 * el cliente con lib/stockSemaforo.ts, aplicando los parámetros
 * configurables, para no tener que volver a consultar la base cada
 * vez que alguien cambia un parámetro en la pantalla.
 */
export async function obtenerStockDisponible(materialId: number): Promise<StockDisponible[]> {
  const { supabase } = await assertAdmin();

  const { data: movimientos } = await supabase
    .from('stock_movimientos')
    .select('centro_origen_id, centro_destino_id, unidades, talla_m, talla_l, talla_xl, talla_xxl, tipo_clave, created_at, stock_tipos_movimiento(resta_origen, suma_destino, clase)')
    .eq('material_id', materialId);

  const { data: centros } = await supabase.from('centros').select('id, nombre, ciudad_id').order('nombre');
  const nombrePorCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));

  // "El gestor de un centro" es quien tiene esa CIUDAD asignada en
  // admin_ciudades — el mismo dato que ya rige los permisos por zona
  // en el resto del CRM, no un catálogo aparte. Un centro puede tener
  // más de un admin/moderador asignado a su ciudad, así que se listan
  // todos juntos (mismo espíritu que el "Marta / Nati" del CSV original).
  const { data: asignaciones } = await supabase.from('admin_ciudades').select('ciudad_id, admins(usuario)');
  const gestoresPorCiudad = new Map<number, string[]>();
  for (const a of asignaciones ?? []) {
    const usuario = (a.admins as unknown as { usuario: string } | null)?.usuario;
    if (!usuario) continue;
    const lista = gestoresPorCiudad.get(a.ciudad_id) ?? [];
    lista.push(usuario);
    gestoresPorCiudad.set(a.ciudad_id, lista);
  }
  const gestorPorCentro = new Map(
    (centros ?? []).map((c) => [c.id, c.ciudad_id ? (gestoresPorCiudad.get(c.ciudad_id)?.join(' / ') ?? null) : null])
  );

  const { data: parametrosRow } = await supabase.from('stock_parametros').select('*').eq('id', 1).maybeSingle();
  const ventanaConsumoDias = parametrosRow?.ventana_consumo_dias ?? 28;
  const inicioVentana = Date.now() - ventanaConsumoDias * 86400000;

  const mapa = new Map<number, StockDisponible>();
  function celda(centroId: number): StockDisponible {
    let c = mapa.get(centroId);
    if (!c) {
      c = {
        material_id: materialId,
        centro_id: centroId,
        centro_nombre: nombrePorCentro.get(centroId) ?? '—',
        gestor: gestorPorCentro.get(centroId) ?? null,
        disponible: 0,
        transito_entrante: 0,
        transito_saliente: 0,
        en_calle: 0,
        merma: 0,
        perdida: 0,
        talla_m: 0,
        talla_l: 0,
        talla_xl: 0,
        talla_xxl: 0,
        consumo_ventana: 0,
        dias_sin_movimiento: null,
      };
      mapa.set(centroId, c);
    }
    return c;
  }

  // Último movimiento por centro (para "días sin movimiento" del semáforo, igual que diasSinMov del sistema de Sheets).
  const ultimoMovimientoPorCentro = new Map<number, number>();

  for (const m of movimientos ?? []) {
    const regla = m.stock_tipos_movimiento as unknown as { resta_origen: boolean | null; suma_destino: boolean; clase: string } | null;
    if (!regla) continue;

    const marcaTiempo = new Date(m.created_at).getTime();
    if (m.centro_origen_id) ultimoMovimientoPorCentro.set(m.centro_origen_id, Math.max(ultimoMovimientoPorCentro.get(m.centro_origen_id) ?? 0, marcaTiempo));
    if (m.centro_destino_id) ultimoMovimientoPorCentro.set(m.centro_destino_id, Math.max(ultimoMovimientoPorCentro.get(m.centro_destino_id) ?? 0, marcaTiempo));

    // resta_origen puede ser null en el catálogo para DEVOLUCION_ROTA/NO_RECUPERADA
    // — el sistema de Sheets lo hacía configurable (rotaDescuentaAlmacen/
    // perdidaDescuentaAlmacen); aquí se mantiene el mismo default seguro
    // (false: la merma/pérdida no vuelve a descontarse del almacén,
    // porque ya salió del almacén cuando se entregó al rider).
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

    // Tránsito: movimientos de traslado que salen de un centro suman a
    // "saliente" de ese centro y a "entrante" del destino, mientras el
    // movimiento en sí ya se contabilizó arriba como resta/suma de
    // disponible (en esta fase no se modela un estado "en camino" aparte
    // — todo movimiento se considera recibido al instante, simplificación
    // consciente frente al sistema viejo que sí distinguía tránsito real).
    if (regla.clase === 'traslado') {
      if (m.centro_origen_id) celda(m.centro_origen_id).transito_saliente += m.unidades;
      if (m.centro_destino_id) celda(m.centro_destino_id).transito_entrante += m.unidades;
    }

    if (m.tipo_clave === 'ENTREGA_RIDER' && m.centro_origen_id) {
      celda(m.centro_origen_id).en_calle += m.unidades;
      if (marcaTiempo >= inicioVentana) celda(m.centro_origen_id).consumo_ventana += m.unidades;
    }
    if (m.tipo_clave === 'DEVOLUCION_OK' && m.centro_destino_id) celda(m.centro_destino_id).en_calle -= m.unidades;
    if (m.tipo_clave === 'DEVOLUCION_ROTA' && m.centro_origen_id) {
      celda(m.centro_origen_id).en_calle -= m.unidades;
      celda(m.centro_origen_id).merma += m.unidades;
    }
    if (m.tipo_clave === 'NO_RECUPERADA' && m.centro_origen_id) {
      celda(m.centro_origen_id).en_calle -= m.unidades;
      celda(m.centro_origen_id).perdida += m.unidades;
    }
  }

  const ahora = Date.now();
  for (const c of mapa.values()) {
    const ultimo = ultimoMovimientoPorCentro.get(c.centro_id);
    c.dias_sin_movimiento = ultimo ? Math.floor((ahora - ultimo) / 86400000) : null;
  }

  return Array.from(mapa.values())
    .filter((c) => c.disponible !== 0 || c.talla_m || c.talla_l || c.talla_xl || c.talla_xxl || c.en_calle !== 0 || c.consumo_ventana > 0)
    .sort((a, b) => a.centro_nombre.localeCompare(b.centro_nombre));
}

/** Parámetros del semáforo de reposición (una sola fila global). */
export async function obtenerParametrosStock(): Promise<StockParametros> {
  const { supabase } = await assertAdmin();
  const { data } = await supabase.from('stock_parametros').select('*').eq('id', 1).maybeSingle();
  return {
    lead_time_dias: data?.lead_time_dias ?? 5,
    cobertura_objetivo_dias: data?.cobertura_objetivo_dias ?? 21,
    stock_seguridad_dias: data?.stock_seguridad_dias ?? 7,
    ventana_consumo_dias: data?.ventana_consumo_dias ?? 28,
    dias_stock_muerto: data?.dias_stock_muerto ?? 45,
    minimo_absoluto: data?.minimo_absoluto ?? 4,
  };
}

export type ActualizarParametrosStockState = { error: string } | { success: true } | undefined;

/** Solo super_admin: ajustar los parámetros del semáforo (RLS ya lo exige también, esto solo da un mensaje claro). */
export async function actualizarParametrosStock(parametros: StockParametros): Promise<ActualizarParametrosStockState> {
  const { supabase, yo } = await assertAdmin();
  if (yo!.rol !== 'super_admin') return { error: 'Solo un Super Admin puede cambiar estos parámetros.' };

  const { error } = await supabase.from('stock_parametros').update(parametros).eq('id', 1);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/stock');
  return { success: true };
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
