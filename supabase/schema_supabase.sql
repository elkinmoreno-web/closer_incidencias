-- ============================================================
--  CLOSER LOGISTICS — MIGRACIÓN A SUPABASE (ETAPA 1: BASE DE DATOS)
-- ============================================================
--  Reemplaza el sistema actual en Google Sheets:
--    - Hojas "Semana N"          -> tabla incidencias (con created_at)
--    - Hoja "IncidenciasPendientes" -> incidencias.estado = 'pendiente'
--    - Hoja "Papelera"           -> incidencias.estado = 'papelera'
--    - Hoja "Administradores"    -> tabla admins + Supabase Auth
--    - Hoja "listado"            -> tabla riders
--    - Hoja "Config"             -> tablas centros / vehiculos / motivos
--    - CacheService (tokens)     -> Supabase Auth (sesiones reales)
--
--  Cómo usarlo:
--    1. Crea un proyecto en supabase.com (plan gratuito para empezar)
--    2. Ve a SQL Editor -> New query
--    3. Pega este archivo completo y dale a "Run"
--
--  Diseño clave:
--    - Sin sharding por semana: todo vive en `incidencias` con
--      `created_at`; filtras por rango de fecha con una query normal.
--    - Sin mover filas entre hojas para "papelera": el estado vive
--      en la misma fila, así conservas el historial completo.
--    - RLS (Row Level Security) sustituye la verificación manual de
--      token: cada rol ve/edita solo lo suyo, garantizado por
--      PostgreSQL, no por tu código JavaScript.
-- ============================================================


-- ---------- EXTENSIONES ----------
create extension if not exists "pgcrypto"; -- necesaria para gen_random_uuid()


-- ---------- TIPOS ----------
create type rol_admin as enum ('super_admin', 'moderador');
create type estado_incidencia as enum ('pendiente', 'aprobada', 'rechazada', 'papelera');
create type estado_ausencia as enum ('pendiente', 'revisada');


-- ============================================================
-- CATÁLOGOS (antes: hardcodeado en el HTML o en la hoja Config)
-- ============================================================

create table centros (
  id serial primary key,
  nombre text not null unique,
  activo boolean not null default true
);

create table vehiculos (
  id serial primary key,
  nombre text not null unique,
  activo boolean not null default true
);

-- Sustituye los Sets hardcodeados MOTIVOS_SIN_CAPTURA / MOTIVOS_OBS_OBLIGATORIA.
-- Revisa las banderas de cada fila: en tu código original ambos Sets
-- contenían los mismos 3 motivos, así que lo repliqué igual, pero
-- probablemente quieras diferenciarlos ahora que es fácil de editar.
create table motivos (
  id serial primary key,
  nombre text not null unique,
  requiere_captura boolean not null default true,
  requiere_observaciones boolean not null default false,
  requiere_direcciones boolean not null default false, -- ej. "Fuera de area"
  activo boolean not null default true
);

insert into motivos (nombre, requiere_captura, requiere_observaciones, requiere_direcciones) values
  ('Restaurante cerrado', true, false, false),
  ('Pedido entregado a otra persona', true, false, false),
  ('Fuera de area', true, false, true),
  ('Cancelado por Uber/Cliente (Automático)', true, false, false),
  ('Pedido cancelado automático (Sin captura)', false, true, false),
  ('Vehículo averiado', true, false, false),
  ('Restaurante no le funciona la tablet', true, false, false),
  ('Restaurante no puede preparar el pedido', true, false, false),
  ('Restaurante no trabaja con Uber', true, false, false),
  ('Problema aceptacion', false, true, false),
  ('Error de la app', false, true, false),
  ('Autorizado por HUB (Otros)', true, false, false),
  ('Otros', true, false, false);

insert into vehiculos (nombre) values
  ('Bici eléctrica'), ('Patinete'), ('Moto propia');

-- Ajusta esto a tus centros reales antes de seguir:
-- insert into centros (nombre) values ('Madrid'), ('Barcelona'), ('Valencia');


-- ============================================================
-- RIDERS (antes: hoja "listado")
-- ============================================================

create table riders (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nombre text not null,
  dni text not null unique,
  email text not null unique,
  centro_id int references centros(id),
  vehiculo_id int references vehiculos(id),
  gestor text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_riders_dni on riders (dni);
create index idx_riders_email on riders (email);


-- ============================================================
-- ADMINS (antes: columnas D-G de la hoja "Administradores")
-- ============================================================

create table admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  usuario text not null unique,
  rol rol_admin not null default 'moderador',
  acceso_panel boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);


-- ============================================================
-- INCIDENCIAS  (antes: "Semana N" + "IncidenciasPendientes" + "Papelera")
-- ============================================================

create table incidencias (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references riders(id),
  dni text not null,               -- copia desnormalizada por si el rider se borra
  nombre_rider text not null,
  centro_id int references centros(id),
  motivo_id int references motivos(id),
  codigo_pedido text,
  observaciones text,
  direccion_recogida text,
  direccion_entrega text,
  screenshot_url text,
  evidencia_url text,
  estado estado_incidencia not null default 'pendiente',
  gestor_id uuid references admins(id),      -- quién la autorizó/rechazó
  fecha_gestion timestamptz,
  eliminado_por_id uuid references admins(id),
  fecha_eliminacion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_incidencias_estado on incidencias (estado);
create index idx_incidencias_created on incidencias (created_at desc);
create index idx_incidencias_dni on incidencias (dni);
create index idx_incidencias_centro on incidencias (centro_id);
create index idx_incidencias_gestor on incidencias (gestor_id);

-- Búsqueda de texto libre (nombre, código, observaciones) resuelta por
-- Postgres en vez de escanear todas las filas en JavaScript.
create index idx_incidencias_busqueda on incidencias
  using gin (to_tsvector('spanish',
    coalesce(nombre_rider,'') || ' ' || coalesce(codigo_pedido,'') || ' ' || coalesce(observaciones,'')));


-- ============================================================
-- AUSENCIAS (el formulario que ya construimos, ahora en la misma BD)
-- ============================================================

create table ausencias (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references riders(id),
  dni text not null,
  nombre_rider text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  comentario text,
  carpeta_drive_url text,   -- seguimos guardando los justificantes en Drive
  num_archivos int not null default 0,
  estado estado_ausencia not null default 'pendiente',
  revisado_por_id uuid references admins(id),
  created_at timestamptz not null default now()
);

create index idx_ausencias_dni on ausencias (dni);
create index idx_ausencias_fechas on ausencias (fecha_inicio, fecha_fin);


-- ============================================================
-- ACTIVIDAD DE ADMINS (antes: hoja "SesionesAdmins" + CacheService)
-- ============================================================
-- Con Supabase Auth ya no gestionas tokens a mano; esta tabla solo
-- guarda la "última vez visto" para el indicador de "Conectados: X"
-- en tiempo real (vía Supabase Realtime), sin necesidad de polling.

create table admin_actividad (
  admin_id uuid primary key references admins(id) on delete cascade,
  last_active timestamptz not null default now(),
  idle_time_ms int not null default 0
);


-- ============================================================
-- AUDITORÍA (antes: llamadas a un webhook externo de Firebase)
-- ============================================================

create table auditoria (
  id bigserial primary key,
  admin_id uuid references admins(id),
  accion text not null,
  detalles text,
  created_at timestamptz not null default now()
);

create index idx_auditoria_admin on auditoria (admin_id, created_at desc);


-- ============================================================
-- ANUNCIOS GLOBALES
-- ============================================================

create table anuncios (
  id serial primary key,
  mensaje text not null,
  activo boolean not null default true,
  created_by uuid references admins(id),
  created_at timestamptz not null default now()
);


-- ============================================================
-- TRIGGER: updated_at automático en incidencias
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_incidencias_updated_at
before update on incidencias
for each row execute function set_updated_at();


-- ============================================================
-- FUNCIONES AUXILIARES PARA RLS
-- ============================================================

-- ¿El usuario autenticado actual es admin (con acceso activo)?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from admins
    where auth_user_id = auth.uid() and activo = true
  );
$$ language sql stable security definer;

-- ¿Es super admin? (gestiona otros admins, catálogos, roles)
create or replace function is_super_admin()
returns boolean as $$
  select exists (
    select 1 from admins
    where auth_user_id = auth.uid() and activo = true and rol = 'super_admin'
  );
$$ language sql stable security definer;

-- ID del rider vinculado al usuario autenticado actual (o null)
create or replace function current_rider_id()
returns uuid as $$
  select id from riders where auth_user_id = auth.uid();
$$ language sql stable security definer;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table centros enable row level security;
alter table vehiculos enable row level security;
alter table motivos enable row level security;
alter table riders enable row level security;
alter table admins enable row level security;
alter table incidencias enable row level security;
alter table ausencias enable row level security;
alter table admin_actividad enable row level security;
alter table auditoria enable row level security;
alter table anuncios enable row level security;

-- Catálogos: cualquier usuario autenticado lee; solo super_admin escribe
create policy "catalogos_lectura_centros" on centros for select using (true);
create policy "catalogos_escritura_centros" on centros for all using (is_super_admin());

create policy "catalogos_lectura_vehiculos" on vehiculos for select using (true);
create policy "catalogos_escritura_vehiculos" on vehiculos for all using (is_super_admin());

create policy "catalogos_lectura_motivos" on motivos for select using (true);
create policy "catalogos_escritura_motivos" on motivos for all using (is_super_admin());

-- Riders: un rider ve solo su propia fila; los admins ven y gestionan todas
create policy "riders_ve_su_fila_o_admin" on riders for select
  using (auth_user_id = auth.uid() or is_admin());
create policy "riders_admin_gestiona" on riders for all
  using (is_admin());

-- Admins: solo super_admin gestiona la tabla; un admin ve su propia fila
create policy "admins_ve_su_fila_o_super" on admins for select
  using (auth_user_id = auth.uid() or is_super_admin());
create policy "admins_super_gestiona" on admins for all
  using (is_super_admin());

-- Incidencias: el rider solo ve/crea las suyas; los admins ven y gestionan todas
create policy "incidencias_rider_lee_las_suyas" on incidencias for select
  using (rider_id = current_rider_id() or is_admin());
create policy "incidencias_rider_crea_las_suyas" on incidencias for insert
  with check (rider_id = current_rider_id() or is_admin());
create policy "incidencias_admin_actualiza" on incidencias for update
  using (is_admin());
create policy "incidencias_admin_borra" on incidencias for delete
  using (is_admin());

-- Ausencias: mismo patrón que incidencias
create policy "ausencias_rider_lee_las_suyas" on ausencias for select
  using (rider_id = current_rider_id() or is_admin());
create policy "ausencias_rider_crea_las_suyas" on ausencias for insert
  with check (rider_id = current_rider_id() or is_admin());
create policy "ausencias_admin_actualiza" on ausencias for update
  using (is_admin());

-- Actividad de admins: solo admins ven/actualizan (indicador "Conectados")
create policy "actividad_solo_admins" on admin_actividad for all
  using (is_admin());

-- Auditoría: solo lectura para admins; nadie edita ni borra (integridad del log)
create policy "auditoria_lectura" on auditoria for select
  using (is_admin());
create policy "auditoria_insercion" on auditoria for insert
  with check (is_admin());

-- Anuncios: cualquier autenticado los lee; solo admins los crean/editan
create policy "anuncios_lectura" on anuncios for select using (true);
create policy "anuncios_escritura" on anuncios for all using (is_admin());


-- ============================================================
-- SIGUIENTE PASO MANUAL (no automatizable desde SQL):
-- ============================================================
-- 1. Ve a Authentication > Users en Supabase y crea tu primer usuario
--    admin (con email + contraseña).
-- 2. Copia su UUID y ejecuta:
--
--    insert into admins (auth_user_id, usuario, rol, acceso_panel)
--    values ('<uuid-del-usuario-creado>', 'tu_usuario', 'super_admin', true);
--
-- 3. Ajusta la lista de centros reales (ver el insert comentado arriba).
