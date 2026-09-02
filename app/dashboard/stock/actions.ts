'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getAdminActual } from '@/lib/supabase/server';
import { registrarError, normalizarNombreCentro } from '@/lib/utils';
import type { StockMaterial, StockTipoMovimiento, StockDisponible, StockMovimiento, StockParametros, StockFicha, StockItemFicha } from '@/lib/types';
import { ITEMS_FICHA_FIJOS } from '@/lib/types';
import { generarFichaDesdeGoogleDocs } from '@/lib/googleDocs';
import { carpetaFichaPorGestor } from '@/lib/googleDrive';

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
    .select('centro_origen_id, centro_destino_id, unidades, talla_m, talla_l, talla_xl, talla_xxl, tipo_clave, created_at, estado_transito, unidades_recibidas, stock_tipos_movimiento(resta_origen, suma_destino, clase)')
    .eq('material_id', materialId);

  const { data: centros } = await supabase.from('centros').select('id, nombre, ciudad_id, gestor_carpeta').order('nombre');
  const nombrePorCentro = new Map((centros ?? []).map((c) => [c.id, c.nombre]));

  // El "gestor" que se muestra/filtra en Stock es el texto tal cual
  // vino del CSV de inventario original (ej. "Paty/Didier"), guardado
  // en centros.gestor_carpeta — decisión explícita del usuario:
  // mantenerlo así, distinto del admin real asignado por
  // admin_ciudades (que sigue rigiendo los permisos de zona en el
  // resto del CRM, pero no es lo que se ve aquí).
  const gestorPorCentro = new Map((centros ?? []).map((c) => [c.id, c.gestor_carpeta]));

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
    const esTraslado = regla.clase === 'traslado';
    // Un traslado "en_transito" ya restó del origen (salió físicamente)
    // pero TODAVÍA no debe sumar al destino — eso solo pasa al
    // confirmar la recepción (confirmarRecepcionTraslado), y con la
    // cantidad realmente contada, no con la enviada, por si hubo
    // merma en el trayecto. Un traslado "anulado" no debe afectar ni
    // origen ni destino en el disponible (se revierte al anular).
    const pendienteDeSumar = esTraslado && regla.suma_destino && m.estado_transito === 'en_transito';
    const anulado = esTraslado && m.estado_transito === 'anulado';
    const unidadesParaDestino = m.estado_transito === 'recibido' ? m.unidades_recibidas ?? m.unidades : m.unidades;

    if (restaOrigen && m.centro_origen_id && !anulado) {
      const c = celda(m.centro_origen_id);
      c.disponible -= m.unidades;
      c.talla_m -= m.talla_m;
      c.talla_l -= m.talla_l;
      c.talla_xl -= m.talla_xl;
      c.talla_xxl -= m.talla_xxl;
    }
    if (regla.suma_destino && m.centro_destino_id && !pendienteDeSumar && !anulado) {
      const c = celda(m.centro_destino_id);
      c.disponible += unidadesParaDestino;
      // Las tallas no se recuentan por separado al recepcionar (el
      // sistema de Sheets tampoco lo hacía) — se migran tal cual si
      // el traslado no está pendiente de confirmación.
      if (m.estado_transito !== 'en_transito') {
        c.talla_m += m.talla_m;
        c.talla_l += m.talla_l;
        c.talla_xl += m.talla_xl;
        c.talla_xxl += m.talla_xxl;
      }
    }

    // Columnas de tránsito visible en la tabla: mientras esté
    // "en_transito", cuenta como saliente del origen y entrante del
    // destino. Una vez recibido o anulado, deja de contar como tránsito.
    if (esTraslado && m.estado_transito === 'en_transito') {
      if (m.centro_origen_id) celda(m.centro_origen_id).transito_saliente += m.unidades;
      if (m.centro_destino_id) celda(m.centro_destino_id).transito_entrante += m.unidades;
    }
    // Caso especial de la importación de CSV: tránsito heredado sin
    // traslado real asociado (ver comentario en importarStockInicial).
    if (m.tipo_clave === 'TRANSITO_MIGRADO' && m.centro_destino_id) {
      celda(m.centro_destino_id).transito_entrante += m.unidades;
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
  cantidad?: number; // materiales sin tallas, cuando el tipo NO usa cajas (modo simple)
  cajas?: number; // solo para tipos con esCajas (Entrada de proveedor, Envío a centro) — se multiplica por uds_por_caja del material
  sueltas?: number; // unidades sueltas adicionales, junto a las cajas, mismo tipo
  tallaM?: number;
  tallaL?: number;
  tallaXl?: number;
  tallaXxl?: number;
  // Con tallas + modo cajas: cajas y sueltas van desglosados por talla (mismo criterio que _stkRegistrar del sistema anterior).
  cajaTallaM?: number;
  cajaTallaL?: number;
  cajaTallaXl?: number;
  cajaTallaXxl?: number;
  sueltaTallaM?: number;
  sueltaTallaL?: number;
  sueltaTallaXl?: number;
  sueltaTallaXxl?: number;
  riderId?: string | null;
  riderNombreLibre?: string | null;
  notas?: string;
}

export type RegistrarMovimientoState = { error: string } | { success: true } | undefined;

// Solo estos dos tipos manejan "cajas + unidades sueltas" — portado
// literal de esCajas en _stkRegistrar() del sistema de Sheets. El
// resto de movimientos (entrega a rider, devoluciones, traspasos...)
// sigue usando cantidad simple en unidades.
const TIPOS_CON_CAJAS = new Set(['ENTRADA_PROVEEDOR', 'ENVIO_SUCURSAL']);

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

    const esModoCajas = TIPOS_CON_CAJAS.has(input.tipoClave);

    let unidades = 0;
    let cajasTotales = 0;
    let tallaM = 0;
    let tallaL = 0;
    let tallaXl = 0;
    let tallaXxl = 0;

    if (material.tiene_tallas) {
      if (esModoCajas) {
        // Cada talla puede llegar en cajas completas + sueltas, igual que _stkRegistrar: uds = cajas * udsPorCaja + sueltas, por cada talla.
        const cajaM = Math.max(0, input.cajaTallaM ?? 0);
        const cajaL = Math.max(0, input.cajaTallaL ?? 0);
        const cajaXl = Math.max(0, input.cajaTallaXl ?? 0);
        const cajaXxl = Math.max(0, input.cajaTallaXxl ?? 0);
        const sueltaM = Math.max(0, input.sueltaTallaM ?? 0);
        const sueltaL = Math.max(0, input.sueltaTallaL ?? 0);
        const sueltaXl = Math.max(0, input.sueltaTallaXl ?? 0);
        const sueltaXxl = Math.max(0, input.sueltaTallaXxl ?? 0);
        cajasTotales = cajaM + cajaL + cajaXl + cajaXxl;
        tallaM = cajaM * material.uds_por_caja + sueltaM;
        tallaL = cajaL * material.uds_por_caja + sueltaL;
        tallaXl = cajaXl * material.uds_por_caja + sueltaXl;
        tallaXxl = cajaXxl * material.uds_por_caja + sueltaXxl;
      } else {
        tallaM = Math.max(0, input.tallaM ?? 0);
        tallaL = Math.max(0, input.tallaL ?? 0);
        tallaXl = Math.max(0, input.tallaXl ?? 0);
        tallaXxl = Math.max(0, input.tallaXxl ?? 0);
      }
      unidades = tallaM + tallaL + tallaXl + tallaXxl;
    } else if (esModoCajas) {
      cajasTotales = Math.max(0, input.cajas ?? 0);
      const sueltas = Math.max(0, input.sueltas ?? 0);
      unidades = cajasTotales * material.uds_por_caja + sueltas;
    } else {
      // AJUSTE_MANUAL permite valores NEGATIVOS a propósito — es el
      // único tipo pensado para corregir un descuadre "quitando"
      // stock, no solo añadiendo (portado literal de
      // _stkRegistrar: unidades = _stkNum(p.cantidad), sin forzar
      // mínimo 0). El resto de tipos simples sí exige cantidad positiva.
      unidades = tipo.clase === 'ajuste' ? Number(input.cantidad ?? 0) : Math.max(0, input.cantidad ?? 0);
    }

    // Los tipos "neutro" (ej. RIDER_YA_TIENE_SOPORTE) son puramente
    // informativos — no mueven stock, así que no tiene sentido
    // exigirles una cantidad distinta de 0. Portado literal de
    // _stkRegistrar: "if (regla.clase !== 'neutro' && ... && unidades === 0)".
    if (tipo.clase !== 'neutro' && unidades === 0) return { error: 'La cantidad no puede ser 0.' };

    // Los traslados entre centros no se dan por recibidos al instante
    // — quedan "en tránsito" (restan del origen, no suman al destino
    // todavía) hasta que alguien en destino confirma cuánto llegó
    // realmente, con confirmarRecepcionTraslado(). El resto de tipos
    // (entrada de proveedor, entrega a rider, devolución...) sigue
    // siendo instantáneo, igual que antes.
    const esTraslado = tipo.clase === 'traslado';

    const { error } = await supabase.from('stock_movimientos').insert({
      material_id: input.materialId,
      tipo_clave: input.tipoClave,
      centro_origen_id: input.centroOrigenId ?? null,
      centro_destino_id: input.centroDestinoId ?? null,
      cajas: cajasTotales,
      unidades,
      talla_m: tallaM,
      talla_l: tallaL,
      talla_xl: tallaXl,
      talla_xxl: tallaXxl,
      rider_id: input.riderId ?? null,
      rider_nombre_libre: input.riderNombreLibre?.trim() || null,
      notas: input.notas?.trim() || null,
      admin_id: yo!.id,
      estado_transito: esTraslado ? 'en_transito' : null,
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

/**
 * Normaliza un nombre de centro/ciudad para comparar sin que
 * diferencias de tildes, mayúsculas o espacios repetidos hagan fallar
 * el emparejamiento (ej. "La  Coruña " y "la coruna" deben matchear).
 * No toca abreviaturas o alias (ej. "MCD X") — eso sigue exigiendo
 * coincidencia real de nombre, para no inventar relaciones.
 * (función compartida: ver normalizarNombreCentro en lib/utils.ts)
 */

export interface FilaImportacionStock {
  centroNombre: string; // tal cual viene en la columna "Ciudad"/"Centro" del CSV
  cantidad: number; // disponible / stock actual — solo materiales sin tallas
  tallaM?: number;
  tallaL?: number;
  tallaXl?: number;
  tallaXxl?: number;
  enTransito?: number; // "Cajas Tránsito" / "En Tránsito (Unid.)" del CSV
  entregadas?: number; // "Entregadas" / "En Poder de Riders" del CSV
  rotas?: number; // "Rotas" / "Rotos / Basura" del CSV
  noRecuperadas?: number; // "No Recuperadas" / "Robados / Perdidos" del CSV
}

export interface ResultadoImportacionStock {
  insertados: number;
  centrosNoEncontrados: string[]; // nombres del CSV que no coinciden con ningún centro real (ni siquiera normalizando) — no se crean solos, se listan para revisión manual
  filasIgnoradas: number; // cantidad 0 en todas las columnas — no aportan nada al ledger
}

/**
 * Importa el stock inicial de un material desde un CSV ya parseado en
 * el navegador (una fila por centro). El nombre de centro se compara
 * NORMALIZADO (sin tildes, mayúsculas ni espacios repetidos) para que
 * variaciones de formato no generen falsos "centro no encontrado" —
 * pero nunca se crea un centro nuevo en silencio: si ni así hay
 * coincidencia, la fila se lista en centrosNoEncontrados para que se
 * revise a mano (crear el centro en Configuración, o corregir el CSV).
 *
 * Cada fila puede generar VARIOS movimientos, no solo uno: el
 * disponible entra como "Inventario inicial", y si el CSV trae
 * también tránsito/entregadas/rotas/no-recuperadas, cada una se migra
 * como su propio movimiento (traspaso entrante, entrega a rider,
 * devolución rota, no recuperada) usando el mismo centro como origen
 * y destino — así el histórico migrado alimenta los mismos contadores
 * que el panel muestra (en camino, con riders, rotas, perdidas), en
 * vez de perder esa información como pasaba antes.
 *
 * Los valores negativos del CSV se cargan tal cual — son descuadres
 * reales de la operación, no un error del importador (decisión
 * explícita: se corrigen después desde el panel con "Ajuste manual").
 */
export async function importarStockInicial(materialId: number, filas: FilaImportacionStock[]): Promise<ResultadoImportacionStock> {
  try {
    const { supabase, yo } = await assertAdmin();
    if (!yo) throw new Error('No se pudo identificar tu sesión de administrador. Vuelve a iniciar sesión e inténtalo de nuevo.');

    const { data: centros } = await supabase.from('centros').select('id, nombre');
    const idPorNombreCentro = new Map((centros ?? []).map((c) => [normalizarNombreCentro(c.nombre), c.id]));

    const centrosNoEncontrados: string[] = [];
    const registros: Record<string, unknown>[] = [];
    let filasIgnoradas = 0;
    const NOTA = 'Migración de stock inicial desde el sistema anterior (Google Sheets)';

    for (const fila of filas) {
      const centroId = idPorNombreCentro.get(normalizarNombreCentro(fila.centroNombre));
      if (!centroId) {
        centrosNoEncontrados.push(fila.centroNombre);
        continue;
      }

      const tallaM = fila.tallaM ?? 0;
      const tallaL = fila.tallaL ?? 0;
      const tallaXl = fila.tallaXl ?? 0;
      const tallaXxl = fila.tallaXxl ?? 0;
      const disponible = tallaM || tallaL || tallaXl || tallaXxl ? tallaM + tallaL + tallaXl + tallaXxl : fila.cantidad;
      // Los 4 contadores del CSV se fuerzan a no-negativos: un valor
      // negativo aquí (ej. "noRecuperadas: -1", visto en datos reales
      // migrados) es un error de captura del sistema anterior, no un
      // caso de negocio válido — a diferencia de un Ajuste manual
      // hecho a propósito desde el panel, que sí puede ser negativo.
      const enTransito = Math.max(0, fila.enTransito ?? 0);
      const entregadas = Math.max(0, fila.entregadas ?? 0);
      const rotas = Math.max(0, fila.rotas ?? 0);
      const noRecuperadas = Math.max(0, fila.noRecuperadas ?? 0);

      if (!disponible && !enTransito && !entregadas && !rotas && !noRecuperadas) {
        filasIgnoradas++;
        continue;
      }

      if (disponible) {
        registros.push({
          material_id: materialId,
          tipo_clave: 'INV_INICIAL',
          centro_destino_id: centroId,
          unidades: disponible,
          talla_m: tallaM,
          talla_l: tallaL,
          talla_xl: tallaXl,
          talla_xxl: tallaXxl,
          notas: NOTA,
          admin_id: yo.id,
        });
      }
      if (enTransito) {
        // TRANSITO_MIGRADO: tipo neutro que no resta/suma disponible ni
        // es un traslado real — solo deja constancia del volumen en
        // tránsito heredado del sistema anterior, sin inventar un
        // origen/destino que no se conoce.
        registros.push({
          material_id: materialId,
          tipo_clave: 'TRANSITO_MIGRADO',
          centro_destino_id: centroId,
          unidades: enTransito,
          talla_m: 0,
          talla_l: 0,
          talla_xl: 0,
          talla_xxl: 0,
          notas: NOTA + ' (en tránsito)',
          admin_id: yo.id,
        });
      }
      if (entregadas) {
        registros.push({
          material_id: materialId,
          tipo_clave: 'ENTREGA_RIDER',
          centro_origen_id: centroId,
          unidades: entregadas,
          talla_m: 0,
          talla_l: 0,
          talla_xl: 0,
          talla_xxl: 0,
          notas: NOTA + ' (entregado a riders)',
          admin_id: yo.id,
        });
      }
      if (rotas) {
        registros.push({
          material_id: materialId,
          tipo_clave: 'DEVOLUCION_ROTA',
          centro_origen_id: centroId,
          unidades: rotas,
          talla_m: 0,
          talla_l: 0,
          talla_xl: 0,
          talla_xxl: 0,
          notas: NOTA + ' (roto)',
          admin_id: yo.id,
        });
      }
      if (noRecuperadas) {
        registros.push({
          material_id: materialId,
          tipo_clave: 'NO_RECUPERADA',
          centro_origen_id: centroId,
          unidades: noRecuperadas,
          talla_m: 0,
          talla_l: 0,
          talla_xl: 0,
          talla_xxl: 0,
          notas: NOTA + ' (no recuperado)',
          admin_id: yo.id,
        });
      }
    }

    if (registros.length > 0) {
      const { error } = await supabase.from('stock_movimientos').insert(registros);
      // Mensaje explícito si falla por un tipo de movimiento que aún
      // no existe en stock_tipos_movimiento (ej. TRANSITO_MIGRADO/
      // INV_INICIAL sin dar de alta con el SQL correspondiente) — sin
      // esto, el error de clave foránea de Postgres es críptico para
      // quien lo lee en el navegador.
      if (error) {
        if (error.message.includes('tipo_clave') || error.message.includes('foreign key')) {
          throw new Error(`No se pudo guardar la importación: falta dar de alta un tipo de movimiento en la base de datos (${error.message}). Revisa que se hayan ejecutado todos los SQL del módulo de Stock.`);
        }
        throw new Error(error.message);
      }
    }

    revalidatePath('/dashboard/stock');
    return { insertados: registros.length, centrosNoEncontrados, filasIgnoradas };
  } catch (e) {
    // Se relanza (no se traga el error) para que el modal SÍ vea el
    // mensaje real en vez de quedarse "colgado" en Importando... —
    // registrarError deja además una traza completa en los logs del
    // servidor, no solo el mensaje resumido que llega al navegador.
    throw new Error(registrarError('importarStockInicial', e, e instanceof Error ? e.message : 'No se pudo completar la importación.'));
  }
}

export interface CrearFichaInput {
  centroId: number;
  riderId: string | null;
  riderNombre: string;
  riderDni: string;
  items: StockItemFicha[]; // las 8 filas del justificante, cada una con su marca (o sin marcar)
  firmaBase64: string | null; // dataURL "data:image/png;base64,...." capturada del lienzo, o null si no se firmó
}

export type CrearFichaState = { error: string } | { success: true; pdfUrl: string | null } | undefined;

// Cada marca corresponde a un tipo de movimiento de stock — mismo
// mapeo que _pltEstadoElegido()/STK_PLT.MOVER_STOCK del sistema
// anterior, aplicado ahora por ÍTEM en vez de a la ficha entera.
const TIPO_MOVIMIENTO_POR_MARCA: Record<NonNullable<StockItemFicha['marca']>, string> = {
  asignacion: 'ENTREGA_RIDER',
  devolucion_ok: 'DEVOLUCION_OK',
  devolucion_mal: 'DEVOLUCION_ROTA',
};

/**
 * Genera el justificante de entrega/devolución completo: crea el PDF
 * con pdf-lib (réplica de la plantilla legal oficial, con los 8 ítems
 * fijos y la firma), lo sube a Drive, guarda el registro en
 * stock_fichas, y registra un movimiento de stock por cada ítem
 * marcado que SÍ corresponda a un material controlado como inventario
 * (mochila, chubasquero, soporte de bici) — los otros 5 ítems (funda
 * de lluvia, soporte móvil, móvil, chaleco, tarjeta) quedan
 * documentados en el PDF pero no mueven cantidades de stock, porque
 * no forman parte del catálogo de materiales controlados.
 */

/**
 * Nombre de archivo — portado literal de _pltNombreArchivo() del
 * sistema de Sheets, para que los PDFs generados aquí sean
 * reconocibles con el mismo patrón que los archivos ya existentes en
 * Drive de antes: "Plantilla_{Nombre}-{DNI}-{Estado}-{Fecha}.pdf".
 */
function nombreArchivoFicha(riderNombre: string, riderDni: string, estado: string, fechaISO: string): string {
  const limpia = (s: string) => s.replace(/[\\/:*?"<>|[\]#%]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nombre = limpia(riderNombre).replace(/ /g, '_');
  const dni = limpia(riderDni).replace(/ /g, '').toUpperCase();
  const est = limpia(estado);
  return `Plantilla_${nombre}-${dni}-${est}-${fechaISO}`;
}

export async function crearFichaEntrega(input: CrearFichaInput): Promise<CrearFichaState> {
  try {
    const { supabase, yo } = await assertAdmin();

    const itemsMarcados = input.items.filter((it) => it.marca !== null);
    if (itemsMarcados.length === 0) return { error: 'Marca al menos un ítem en el justificante.' };

    const { data: centro } = await supabase.from('centros').select('nombre, gestor_carpeta').eq('id', input.centroId).maybeSingle();
    if (!centro) return { error: 'Centro no reconocido.' };

    const ahora = new Date();
    const fechaISO = ahora.toISOString().split('T')[0];
    const fecha = ahora.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
    const hora = ahora.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

    // El "estado" del nombre de archivo refleja el conjunto de marcas
    // usadas en la ficha (puede haber varias distintas en la misma
    // ficha, a diferencia del sistema viejo que tenía un único estado
    // por documento) — se usa la más frecuente para no generar un
    // nombre kilométrico.
    const conteoMarca: Record<string, number> = {};
    for (const it of itemsMarcados) conteoMarca[it.marca!] = (conteoMarca[it.marca!] ?? 0) + 1;
    const marcaPrincipal = Object.entries(conteoMarca).sort((a, b) => b[1] - a[1])[0][0];
    const ETIQUETA_ESTADO_ARCHIVO: Record<string, string> = { asignacion: 'Asignación', devolucion_ok: 'Devolución buen estado', devolucion_mal: 'Devolución mal estado' };

    // La firma se inserta como imagen DENTRO del PDF (marcador
    // {{FIRMA DEL TRABAJADOR}} de la plantilla real, ver
    // lib/googleDocs.ts) — no se sube por separado como PNG suelto,
    // porque eso duplicaba el archivo sin necesidad: solo interesa el
    // justificante completo, un único archivo por ficha.
    let firmaPngBytes: Uint8Array | null = null;
    if (input.firmaBase64 && input.firmaBase64.includes('base64,')) {
      const base64 = input.firmaBase64.split('base64,')[1];
      firmaPngBytes = new Uint8Array(Buffer.from(base64, 'base64'));
    }

    const nombreArchivo = nombreArchivoFicha(input.riderNombre, input.riderDni, ETIQUETA_ESTADO_ARCHIVO[marcaPrincipal], fechaISO);
    const carpetaDestinoId = await carpetaFichaPorGestor(centro.gestor_carpeta);
    const pdfFileId = await generarFichaDesdeGoogleDocs(
      { riderNombre: input.riderNombre, riderDni: input.riderDni, fecha, hora, items: input.items, firmaPngBytes },
      carpetaDestinoId,
      nombreArchivo
    );

    const { error: errorFicha } = await supabase.from('stock_fichas').insert({
      centro_id: input.centroId,
      rider_id: input.riderId,
      rider_nombre: input.riderNombre,
      rider_dni: input.riderDni,
      fecha: ahora.toISOString().split('T')[0],
      hora: ahora.toTimeString().split(' ')[0],
      items: input.items,
      firma_url: null,
      pdf_url: pdfFileId,
      admin_id: yo!.id,
    });
    if (errorFicha) return { error: errorFicha.message };

    // Solo los ítems marcados que coinciden con un material del
    // catálogo de stock generan movimiento — el resto queda solo en
    // el PDF, tal como se decidió mantener el control de inventario
    // acotado a Mochilas/Soportes/Chubasqueros.
    const { data: materialesStock } = await supabase.from('stock_materiales').select('id, clave');
    const idPorClaveMaterial = new Map((materialesStock ?? []).map((m) => [m.clave, m.id]));

    const registrosMovimiento = itemsMarcados
      .map((it) => {
        const def = ITEMS_FICHA_FIJOS.find((d) => d.clave === it.itemClave);
        const materialId = def?.materialClaveStock ? idPorClaveMaterial.get(def.materialClaveStock) : undefined;
        if (!materialId || !it.marca) return null;
        return {
          material_id: materialId,
          tipo_clave: TIPO_MOVIMIENTO_POR_MARCA[it.marca],
          centro_origen_id: it.marca === 'asignacion' ? input.centroId : null,
          centro_destino_id: it.marca !== 'asignacion' ? input.centroId : null,
          unidades: 1, // el justificante es un checkbox por ítem (una unidad), no captura cantidad
          rider_id: input.riderId,
          rider_nombre_libre: input.riderNombre,
          notas: `Justificante de entrega firmado por el rider (${def!.etiqueta})`,
          admin_id: yo!.id,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (registrosMovimiento.length > 0) {
      const { error: errorMovimientos } = await supabase.from('stock_movimientos').insert(registrosMovimiento);
      if (errorMovimientos) return { error: `La ficha se guardó, pero no se pudo actualizar el stock: ${errorMovimientos.message}` };
    }

    revalidatePath('/dashboard/stock');
    return { success: true, pdfUrl: pdfFileId };
  } catch (e) {
    return { error: registrarError('crearFichaEntrega', e, 'No se pudo generar la ficha. Inténtalo de nuevo.') };
  }
}

/** Últimas fichas de entrega/devolución generadas, para poder abrir el PDF desde el panel. */
export async function listarFichasRecientes(limite = 30): Promise<(StockFicha & { centro_nombre: string; admin_usuario: string | null })[]> {
  const { supabase } = await assertAdmin();
  const { data } = await supabase
    .from('stock_fichas')
    .select('*, centros(nombre), admins(usuario)')
    .order('created_at', { ascending: false })
    .limit(limite);

  return (data ?? []).map((f: any) => ({
    ...f,
    centro_nombre: f.centros?.nombre ?? '—',
    admin_usuario: f.admins?.usuario ?? null,
  }));
}

/**
 * Traslados que siguen "en tránsito" — equivalente a la pestaña
 * Solicitudes del sistema de Sheets. RLS ya acota a las ciudades del
 * admin actual (por origen o destino), así que no hace falta volver a
 * filtrar aquí.
 */
export async function listarTrasladosPendientes(): Promise<
  (StockMovimiento & { material_titulo: string; material_titulo_en: string | null; centro_origen_nombre: string | null; centro_destino_nombre: string | null })[]
> {
  const { supabase } = await assertAdmin();
  const { data } = await supabase
    .from('stock_movimientos')
    .select('*, stock_materiales(titulo, titulo_en), origen:centro_origen_id(nombre), destino:centro_destino_id(nombre)')
    .eq('estado_transito', 'en_transito')
    .order('created_at', { ascending: false });

  return (data ?? []).map((m: any) => ({
    ...m,
    material_titulo: m.stock_materiales?.titulo ?? '—',
    material_titulo_en: m.stock_materiales?.titulo_en ?? null,
    centro_origen_nombre: m.origen?.nombre ?? null,
    centro_destino_nombre: m.destino?.nombre ?? null,
  }));
}

export type ConfirmarRecepcionState = { error: string } | { success: true; diferencia: number } | undefined;

/**
 * Confirma la llegada de un traslado — equivalente a
 * api_stk_recepcionar() del sistema anterior. Si lo recibido es
 * distinto de lo enviado, la diferencia queda registrada (en la
 * propia fila, con unidades_recibidas) y se refleja tal cual en el
 * disponible del destino — no hace falta un movimiento de ajuste
 * aparte porque el cálculo ya usa unidades_recibidas cuando el estado
 * es "recibido".
 */
export async function confirmarRecepcionTraslado(movimientoId: number, unidadesRecibidas: number): Promise<ConfirmarRecepcionState> {
  try {
    const { supabase, yo } = await assertAdmin();

    const { data: mov } = await supabase.from('stock_movimientos').select('unidades, estado_transito').eq('id', movimientoId).maybeSingle();
    if (!mov) return { error: 'Movimiento no encontrado.' };
    if (mov.estado_transito !== 'en_transito') return { error: 'Ese envío ya no está en tránsito.' };
    if (unidadesRecibidas < 0) return { error: 'La cantidad recibida no puede ser negativa.' };

    const { error } = await supabase
      .from('stock_movimientos')
      .update({ estado_transito: 'recibido', unidades_recibidas: unidadesRecibidas, recibido_por: yo!.id, recibido_en: new Date().toISOString() })
      .eq('id', movimientoId);
    if (error) return { error: error.message };

    revalidatePath('/dashboard/stock');
    return { success: true, diferencia: unidadesRecibidas - mov.unidades };
  } catch (e) {
    return { error: registrarError('confirmarRecepcionTraslado', e, 'No se pudo confirmar la recepción. Inténtalo de nuevo.') };
  }
}

/** Anula un traslado antes de que llegue — no afecta al destino; el origen ya quedó descontado (el material salió físicamente y hay que gestionarlo aparte, igual que el sistema anterior no revertía el origen al anular). */
export async function anularTraslado(movimientoId: number): Promise<ConfirmarRecepcionState> {
  try {
    const { supabase } = await assertAdmin();
    const { data: mov } = await supabase.from('stock_movimientos').select('estado_transito').eq('id', movimientoId).maybeSingle();
    if (!mov) return { error: 'Movimiento no encontrado.' };
    if (mov.estado_transito !== 'en_transito') return { error: 'Ese envío ya no está en tránsito.' };

    const { error } = await supabase.from('stock_movimientos').update({ estado_transito: 'anulado' }).eq('id', movimientoId);
    if (error) return { error: error.message };

    revalidatePath('/dashboard/stock');
    return { success: true, diferencia: 0 };
  } catch (e) {
    return { error: registrarError('anularTraslado', e, 'No se pudo anular el envío. Inténtalo de nuevo.') };
  }
}
