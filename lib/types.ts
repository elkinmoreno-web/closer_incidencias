// Tipos alineados con schema_supabase.sql + schema_mejoras_2.sql + schema_zonas_2.sql.
// Si generas tipos automáticamente con `supabase gen types typescript`,
// puedes sustituir este archivo por el generado sin tocar el resto del código.

export type RolAdmin = 'super_admin' | 'administrador' | 'moderador' | 'admin_zona'; // 'admin_zona' en desuso, se migró a 'moderador'
export type EstadoIncidencia = 'pendiente' | 'aprobada' | 'rechazada' | 'papelera';
export type EstadoAusencia = 'pendiente' | 'aprobada' | 'rechazada' | 'revisada'; // 'revisada' en desuso

export interface Ciudad {
  id: number;
  nombre: string;
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
  ciudades?: Pick<Ciudad, 'id' | 'nombre'> | null;
}

export interface Vehiculo {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Motivo {
  id: number;
  nombre: string;
  requiere_captura: boolean;
  requiere_observaciones: boolean;
  requiere_direcciones: boolean;
  activo: boolean;
}

export interface MotivoAusencia {
  id: number;
  nombre: string;
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
  screenshot_url: string | null;
  evidencia_url: string | null;
  estado: EstadoIncidencia;
  gestor_id: string | null;
  fecha_gestion: string | null;
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
  storage_prefix: string | null;
  num_archivos: number;
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
  screenshot_url: string | null;
  observaciones: string | null;
  created_by: string | null;
  created_at: string;
  centros?: Pick<Centro, 'id' | 'nombre'> | null;
  admins?: Pick<Admin, 'usuario'> | null;
}

// Tipo mínimo requerido por @supabase/ssr; se puede reemplazar por el
// tipo `Database` generado automáticamente por la CLI de Supabase.
export type Database = any;
