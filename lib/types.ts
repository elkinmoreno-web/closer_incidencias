// Tipos alineados con schema_supabase.sql + schema_mejoras_2.sql + schema_zonas_2.sql.
// Si generas tipos automáticamente con `supabase gen types typescript`,
// puedes sustituir este archivo por el generado sin tocar el resto del código.

export type RolAdmin = 'super_admin' | 'administrador' | 'moderador' | 'admin_zona'; // 'admin_zona' en desuso, se migró a 'moderador'
export type EstadoIncidencia = 'pendiente' | 'aprobada' | 'rechazada' | 'papelera';
export type EstadoAusencia = 'pendiente' | 'aprobada' | 'rechazada' | 'revisada'; // 'revisada' en desuso

export interface Ciudad {
  id: number;
  nombre: string;
  pais: 'ES' | 'DE';
}

export interface Gestor {
  id: number;
  nombre: string;
}

export interface Centro {
  id: number;
  nombre: string;
  activo: boolean;
  ciudad_id: number | null;
  imagen_zona_conexion_url: string | null;
  zona_conexion_id: number | null;
  gestor_carpeta: string | null; // texto libre del CSV original, solo para organizar la subcarpeta de Drive de las fichas — NO es admin_ciudades
  ciudades?: Pick<Ciudad, 'id' | 'nombre'> | null;
}

export interface ZonaConexion {
  id: number;
  nombre: string;
  poligonos: [number, number][][]; // uno o más polígonos [lat, lng][] — una zona puede cubrir varias áreas separadas en el mapa
  actualizado_en: string;
}

export interface Vehiculo {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Motivo {
  id: number;
  nombre: string;
  nombre_en: string | null;
  requiere_captura: boolean;
  requiere_observaciones: boolean;
  requiere_direcciones: boolean;
  instrucciones_aprobacion?: string | null;
  instrucciones_aprobacion_en?: string | null;
  activo: boolean;
}

export interface MotivoAusencia {
  id: number;
  nombre: string;
  nombre_en: string | null;
  activo: boolean;
}

export interface Rider {
  id: string;
  auth_user_id: string | null;
  nombre: string;
  dni: string;
  email: string;
  centro_id: number | null;
  vehiculo_id: number | null;
  gestor: string | null;
  activo: boolean;
  created_at: string;
  // Campos de RRHH (opcionales, vienen de la importación de Excel)
  nacionalidad: string | null;
  genero: string | null;
  empresa_contratante: string | null;
  provincia: string | null;
  puesto: string | null;
  fecha_alta: string | null;
  fecha_baja: string | null;
  tipo_baja: string | null;
  motivo_baja: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  direccion: string | null;
  horas_trabajo: number | null;
  turno: string | null;
}

export interface Admin {
  id: string;
  auth_user_id: string | null;
  usuario: string;
  rol: RolAdmin;
  acceso_panel: boolean;
  activo: boolean;
  created_at: string;
}

export interface Incidencia {
  id: string;
  rider_id: string | null;
  dni: string;
  nombre_rider: string;
  centro_id: number | null;
  motivo_id: number | null;
  codigo_pedido: string | null;
  observaciones: string | null;
  motivo_rechazo: string | null;
  direccion_recogida: string | null;
  direccion_entrega: string | null;
  screenshot_url: string | null; // ID del archivo en Google Drive
  evidencia_ids: string[]; // IDs de los archivos de evidencia adicional en Google Drive (hasta 3)
  estado: EstadoIncidencia;
  gestor_id: string | null;
  fecha_gestion: string | null;
  comentario_aprobacion: string | null;
  eliminado_por_id: string | null;
  fecha_eliminacion: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones expandidas (cuando se piden con select con join)
  centros?: Pick<Centro, 'id' | 'nombre'> | null;
  motivos?: Pick<Motivo, 'id' | 'nombre'> | null;
  admins?: Pick<Admin, 'usuario'> | null;
}

export interface Ausencia {
  id: string;
  rider_id: string | null;
  dni: string;
  nombre_rider: string;
  centro_id: number | null;
  motivo_id: number | null;
  motivo_rechazo: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  comentario: string | null;
  archivo_ids: string[]; // IDs de los archivos en Google Drive
  estado: EstadoAusencia;
  revisado_por_id: string | null;
  created_at: string;
  motivos_ausencia?: Pick<MotivoAusencia, 'id' | 'nombre'> | null;
  admins?: Pick<Admin, 'usuario'> | null;
}

export interface ConexionFueraZona {
  id: string;
  rider_id: string | null;
  dni: string;
  nombre_rider: string;
  centro_id: number | null;
  fecha: string;
  screenshot_url: string | null; // ID del archivo en Google Drive
  observaciones: string | null;
  created_by: string | null;
  created_at: string;
  centros?: Pick<Centro, 'id' | 'nombre'> | null;
  admins?: Pick<Admin, 'usuario'> | null;
}

// ============================================================
// Gestión de Stock (Fase 1 — núcleo mínimo)
// ============================================================

export interface StockMaterial {
  id: number;
  clave: string; // 'MOCHILAS' | 'SOPORTES' | 'CHUBASQUEROS' — identificador estable
  titulo: string;
  titulo_en: string | null;
  icono: string;
  unidad: string;
  uds_por_caja: number;
  tiene_tallas: boolean;
  activo: boolean;
  orden: number;
}

export interface StockTalla {
  id: number;
  material_id: number;
  talla: string; // 'M' | 'L' | 'XL' | 'XXL'
  orden: number;
}

export type StockClaseMovimiento = 'entrada' | 'traslado' | 'salida' | 'merma' | 'perdida' | 'ajuste' | 'neutro';

export interface StockTipoMovimiento {
  clave: string;
  etiqueta: string;
  etiqueta_en: string | null;
  clase: StockClaseMovimiento;
  resta_origen: boolean | null; // null = depende de un parámetro que se resuelve en fases siguientes
  suma_destino: boolean;
  requiere_origen: boolean;
  requiere_destino: boolean;
  orden: number;
}

export type StockEstadoTransito = 'en_transito' | 'recibido' | 'anulado';

export interface StockMovimiento {
  id: number;
  material_id: number;
  tipo_clave: string;
  centro_origen_id: number | null;
  centro_destino_id: number | null;
  cajas: number;
  unidades: number;
  talla_m: number;
  talla_l: number;
  talla_xl: number;
  talla_xxl: number;
  rider_id: string | null;
  rider_nombre_libre: string | null;
  notas: string | null;
  admin_id: string;
  created_at: string;
  estado_transito: StockEstadoTransito | null;
  unidades_recibidas: number | null;
  recibido_por: string | null;
  recibido_en: string | null;
}

/** Fila de stock disponible por centro y material, ya calculada (suma del ledger). */
export type StockSemaforo = 'NEGATIVO' | 'ROTURA' | 'CRITICO' | 'BAJO' | 'MUERTO' | 'SOBRE' | 'OK';

/** Fila de stock por centro y material, con todas las métricas ya calculadas (equivalente a una fila de STOCK MOCHILAS/SOPORTES/CHUBASQ + su semáforo). */
export interface StockDisponible {
  material_id: number;
  centro_id: number;
  centro_nombre: string;
  gestores: string[]; // usuarios de admins/moderadores con la ciudad de este centro asignada en admin_ciudades — puede ser más de uno
  disponible: number;
  transito_entrante: number;
  transito_saliente: number;
  en_calle: number; // unidades en manos de riders
  merma: number;
  perdida: number;
  talla_m: number;
  talla_l: number;
  talla_xl: number;
  talla_xxl: number;
  consumo_ventana: number; // unidades salidas a rider dentro de la ventana de consumo (paramétrica)
  dias_sin_movimiento: number | null; // null = nunca ha tenido movimiento
  // Campos derivados del semáforo (se calculan en el cliente con lib/stockSemaforo.ts, no vienen de la BD)
  consumo_dia?: number;
  consumo_semana?: number;
  cobertura_dias?: number | null; // null = cobertura indefinida (sin consumo)
  punto_reposicion?: number;
  objetivo?: number;
  sugerido?: number;
  semaforo?: StockSemaforo;
}

export interface StockParametros {
  lead_time_dias: number;
  cobertura_objetivo_dias: number;
  stock_seguridad_dias: number;
  ventana_consumo_dias: number;
  dias_stock_muerto: number;
  minimo_absoluto: number;
}

export type StockEstadoFicha = 'Asignación' | 'Devolución buen estado' | 'Devolución mal estado';

/**
 * Los 8 ítems del justificante legal (JUSTIFICANTE_DE_ENTREGA_DE_EQUIPOS),
 * tal cual la plantilla oficial de Closer Logistics — fijos, no
 * editables desde el panel. Solo 3 de estos 8 corresponden a materiales
 * que también se controlan como inventario (mochilaId/soporteId/
 * chubasqueroId en stock_materiales); los otros 5 quedan documentados
 * en el PDF pero no mueven cantidades de stock.
 */
export const ITEMS_FICHA_FIJOS = [
  { clave: 'MOCHILA_TERMICA', etiqueta: 'Mochila térmica', materialClaveStock: 'MOCHILAS' as string | null },
  { clave: 'FUNDA_LLUVIA_MOCHILA', etiqueta: 'Funda de lluvia mochila', materialClaveStock: null },
  { clave: 'TRAJE_CHUBASQUERO', etiqueta: 'Traje chubasquero', materialClaveStock: 'CHUBASQUEROS' as string | null },
  { clave: 'SOPORTE_MOVIL', etiqueta: 'Soporte Móvil', materialClaveStock: null },
  { clave: 'MOVIL', etiqueta: 'Móvil', materialClaveStock: null },
  { clave: 'CHALECO_REFLECTANTE', etiqueta: 'Chaleco Reflectante', materialClaveStock: null },
  { clave: 'SOPORTE_BICI', etiqueta: 'Soporte de Bici', materialClaveStock: 'SOPORTES' as string | null },
  { clave: 'TARJETA_REPOSTAJE', etiqueta: 'Tarjeta Repostaje', materialClaveStock: null },
] as const;

export type ItemFichaClave = (typeof ITEMS_FICHA_FIJOS)[number]['clave'];

/** Una fila del justificante: qué ítem, y cuál de las 3 casillas se marcó (o ninguna). */
export interface StockItemFicha {
  itemClave: ItemFichaClave;
  marca: 'asignacion' | 'devolucion_ok' | 'devolucion_mal' | null;
  observaciones?: string;
}

export interface StockFicha {
  id: number;
  centro_id: number;
  rider_id: string | null;
  rider_nombre: string;
  rider_dni: string;
  fecha: string;
  hora: string;
  items: StockItemFicha[]; // las 8 filas del justificante, cada una con su propia marca
  firma_url: string | null;
  pdf_url: string | null;
  admin_id: string;
  created_at: string;
}

// Tipo mínimo requerido por @supabase/ssr; se puede reemplazar por el
// tipo `Database` generado automáticamente por la CLI de Supabase.
export type Database = any;
