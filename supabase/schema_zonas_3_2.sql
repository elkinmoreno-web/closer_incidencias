-- ============================================================
--  CLOSER LOGISTICS — REESTRUCTURACIÓN DE ROLES, PASO 2 de 2
-- ============================================================
--  Ejecuta esto DESPUÉS de schema_zonas_3_1.sql.
--
--  Resumen de lo que cambia:
--   1. Roles nuevos: super_admin / administrador / moderador.
--      - super_admin: todo, sin restricción.
--      - administrador: ve todos los datos (sin restricción de zona),
--        en Configuración solo ve el Anuncio Global, y solo puede
--        crear cuentas de rol "moderador" (asignándoles ciudades).
--      - moderador: SIEMPRE restringido a las ciudades que se le
--        asignen. No ve Configuración.
--      (El rol anterior "admin_zona" desaparece: se migra a "moderador".
--       El "moderador" anterior, que no tenía restricción, se migra a
--       "administrador" para no perder acceso de golpe.)
--   2. Arregla un bug real: un rider/incidencia/ausencia sin centro_id
--      asignado se volvía invisible para TODOS los admins (incluido
--      Super Admin) por cómo estaba escrita la política de zona.
--   3. Añade el catálogo de Gestores (agrupa ciudades bajo un gestor,
--      para poder filtrar por gestor en las tablas).
-- ============================================================

-- ---------- 1. Migrar los roles existentes ----------
-- Orden importante: primero "moderador" (el antiguo, sin restricción)
-- pasa a "administrador"; después "admin_zona" pasa a ocupar el nombre
-- "moderador" con su restricción de zona ya asignada en admin_ciudades.
update admins set rol = 'administrador' where rol = 'moderador';
update admins set rol = 'moderador' where rol = 'admin_zona';

-- ---------- 2. Funciones auxiliares de rol ----------
create or replace function is_administrador()
returns boolean as $$
  select exists (
    select 1 from admins a where a.auth_user_id = auth.uid() and a.activo and a.rol = 'administrador'
  );
$$ language sql stable security definer;

-- Devuelve true si el admin actual ve TODO sin restricción de zona
-- (super_admin o administrador).
create or replace function admin_sin_restriccion_zona()
returns boolean as $$
  select exists (
    select 1 from admins a
    where a.auth_user_id = auth.uid() and a.activo and a.rol in ('super_admin', 'administrador')
  );
$$ language sql stable security definer;

-- Centros visibles: todos si no hay restricción de zona, o solo los de
-- las ciudades asignadas si el admin es "moderador".
create or replace function centros_visibles_admin()
returns setof int as $$
  select c.id from centros c
  where
    admin_sin_restriccion_zona()
    or c.ciudad_id in (
      select ac.ciudad_id from admin_ciudades ac
      join admins a on a.id = ac.admin_id
      where a.auth_user_id = auth.uid() and a.activo and a.rol = 'moderador'
    );
$$ language sql stable security definer;

-- ---------- 3. Arreglo del bug de centro_id nulo ----------
-- Antes: "centro_id in (select centros_visibles_admin())" con centro_id
-- NULL da NULL (ni verdadero ni falso), así que esas filas no las veía
-- NADIE, ni el Super Admin. Ahora, si no hay restricción de zona, las
-- filas sin centro también se ven.

drop policy if exists "incidencias_ve" on incidencias;
create policy "incidencias_ve" on incidencias for select
  using (
    rider_id = current_rider_id()
    or (is_admin() and (
      (centro_id is null and admin_sin_restriccion_zona())
      or centro_id in (select centros_visibles_admin())
    ))
  );

drop policy if exists "incidencias_crea" on incidencias;
create policy "incidencias_crea" on incidencias for insert
  with check (
    rider_id = current_rider_id()
    or (is_admin() and (
      (centro_id is null and admin_sin_restriccion_zona())
      or centro_id in (select centros_visibles_admin())
    ))
  );

drop policy if exists "incidencias_actualiza" on incidencias;
create policy "incidencias_actualiza" on incidencias for update
  using (is_admin() and (
    (centro_id is null and admin_sin_restriccion_zona())
    or centro_id in (select centros_visibles_admin())
  ));

drop policy if exists "incidencias_borra" on incidencias;
create policy "incidencias_borra" on incidencias for delete
  using (is_admin() and (
    (centro_id is null and admin_sin_restriccion_zona())
    or centro_id in (select centros_visibles_admin())
  ));

drop policy if exists "ausencias_ve" on ausencias;
create policy "ausencias_ve" on ausencias for select
  using (
    rider_id = current_rider_id()
    or (is_admin() and (
      (centro_id is null and admin_sin_restriccion_zona())
      or centro_id in (select centros_visibles_admin())
    ))
  );

drop policy if exists "ausencias_crea" on ausencias;
create policy "ausencias_crea" on ausencias for insert
  with check (
    rider_id = current_rider_id()
    or (is_admin() and (
      (centro_id is null and admin_sin_restriccion_zona())
      or centro_id in (select centros_visibles_admin())
    ))
  );

drop policy if exists "ausencias_actualiza" on ausencias;
create policy "ausencias_actualiza" on ausencias for update
  using (is_admin() and (
    (centro_id is null and admin_sin_restriccion_zona())
    or centro_id in (select centros_visibles_admin())
  ));

drop policy if exists "riders_ve" on riders;
create policy "riders_ve" on riders for select
  using (
    auth_user_id = auth.uid()
    or (is_admin() and (
      (centro_id is null and admin_sin_restriccion_zona())
      or centro_id in (select centros_visibles_admin())
    ))
  );

drop policy if exists "riders_gestiona" on riders;
create policy "riders_gestiona" on riders for all
  using (is_admin() and (
    (centro_id is null and admin_sin_restriccion_zona())
    or centro_id in (select centros_visibles_admin())
  ));

drop policy if exists "conexiones_lee" on conexiones_fuera_zona;
create policy "conexiones_lee" on conexiones_fuera_zona for select
  using (is_admin() and (
    (centro_id is null and admin_sin_restriccion_zona())
    or centro_id in (select centros_visibles_admin())
  ));

drop policy if exists "conexiones_crea" on conexiones_fuera_zona;
create policy "conexiones_crea" on conexiones_fuera_zona for insert
  with check (is_admin() and (
    (centro_id is null and admin_sin_restriccion_zona())
    or centro_id in (select centros_visibles_admin())
  ));

drop policy if exists "conexiones_actualiza" on conexiones_fuera_zona;
create policy "conexiones_actualiza" on conexiones_fuera_zona for update
  using (is_admin() and (
    (centro_id is null and admin_sin_restriccion_zona())
    or centro_id in (select centros_visibles_admin())
  ));

-- ---------- 4. Tabla admins: quién puede crear/editar a quién ----------
drop policy if exists "admins_ve_su_fila_o_super" on admins;
drop policy if exists "admins_super_gestiona" on admins;
drop policy if exists "admins_select" on admins;
drop policy if exists "admins_insert" on admins;
drop policy if exists "admins_update" on admins;
drop policy if exists "admins_delete" on admins;

-- Cualquier admin activo puede ver el listado completo (lo necesita la
-- pantalla de Configuración y los selects de "gestionado por").
create policy "admins_select" on admins for select using (is_admin());

-- Super Admin puede crear cualquier rol. Administrador solo puede crear
-- moderadores.
create policy "admins_insert" on admins for insert
  with check (is_super_admin() or (is_administrador() and rol = 'moderador'));

-- Super Admin puede editar cualquier fila. Administrador solo puede
-- tocar filas que ya son moderador y que sigan siéndolo tras el cambio.
create policy "admins_update" on admins for update
  using (is_super_admin() or (is_administrador() and rol = 'moderador'))
  with check (is_super_admin() or (is_administrador() and rol = 'moderador'));

-- Solo Super Admin borra administradores.
create policy "admins_delete" on admins for delete using (is_super_admin());

-- ---------- 5. admin_ciudades: quién asigna zonas ----------
drop policy if exists "admin_ciudades_escritura" on admin_ciudades;
create policy "admin_ciudades_escritura" on admin_ciudades for all
  using (is_super_admin() or is_administrador());

-- ---------- 6. Anuncios: Administrador también puede publicar ----------
drop policy if exists "anuncios_escritura" on anuncios;
create policy "anuncios_escritura" on anuncios for all
  using (is_super_admin() or is_administrador());

-- ============================================================
-- GESTORES (agrupa ciudades bajo un gestor, para filtrar por gestor)
-- ============================================================
create table if not exists gestores (
  id serial primary key,
  nombre text not null unique
);

alter table gestores enable row level security;
drop policy if exists "gestores_lectura" on gestores;
create policy "gestores_lectura" on gestores for select using (true);
drop policy if exists "gestores_escritura" on gestores;
create policy "gestores_escritura" on gestores for all using (is_super_admin());

create table if not exists gestor_ciudades (
  gestor_id int references gestores(id) on delete cascade,
  ciudad_id int references ciudades(id) on delete cascade,
  primary key (gestor_id, ciudad_id)
);

alter table gestor_ciudades enable row level security;
drop policy if exists "gestor_ciudades_lectura" on gestor_ciudades;
create policy "gestor_ciudades_lectura" on gestor_ciudades for select using (true);
drop policy if exists "gestor_ciudades_escritura" on gestor_ciudades;
create policy "gestor_ciudades_escritura" on gestor_ciudades for all using (is_super_admin());

insert into gestores (nombre) values
  ('Carlos'), ('Ender, Walter'), ('Hector, Ali Daniel'), ('Marta, Nati'),
  ('Paty, Didier'), ('Tamara, Javier'), ('Vanessa')
on conflict (nombre) do nothing;

insert into gestor_ciudades (gestor_id, ciudad_id)
select g.id, ci.id from (values
  ('Carlos', 'ALMERIA'), ('Carlos', 'GRANADA'), ('Carlos', 'JAEN'), ('Carlos', 'MALAGA'),
  ('Ender, Walter', 'BARCELONA'), ('Ender, Walter', 'GIRONA'), ('Ender, Walter', 'LLEIDA'),
  ('Hector, Ali Daniel', 'ALICANTE'), ('Hector, Ali Daniel', 'CASTELLON'), ('Hector, Ali Daniel', 'GANDIA'),
  ('Hector, Ali Daniel', 'IBIZA'), ('Hector, Ali Daniel', 'VILLARREAL'), ('Hector, Ali Daniel', 'MURCIA'),
  ('Hector, Ali Daniel', 'MALLORCA'), ('Hector, Ali Daniel', 'VALENCIA'),
  ('Marta, Nati', 'ALGECIRAS'), ('Marta, Nati', 'BADAJOZ'), ('Marta, Nati', 'CACERES'),
  ('Marta, Nati', 'CIUDAD REAL'), ('Marta, Nati', 'CORDOBA'), ('Marta, Nati', 'HUELVA'),
  ('Marta, Nati', 'JEREZ'), ('Marta, Nati', 'MELILLA'), ('Marta, Nati', 'SEVILLE'),
  ('Paty, Didier', 'MADRID'),
  ('Tamara, Javier', 'BILBAO'), ('Tamara, Javier', 'LEON'), ('Tamara, Javier', 'LOGRONO'),
  ('Tamara, Javier', 'PAMPLONA'), ('Tamara, Javier', 'TARRAGONA'), ('Tamara, Javier', 'VALLADOLID'),
  ('Tamara, Javier', 'VITORIA'), ('Tamara, Javier', 'ZARAGOZA'),
  ('Vanessa', 'ALBACETE'), ('Vanessa', 'SEGOVIA'), ('Vanessa', 'GIJON'), ('Vanessa', 'SAN SEBASTIAN'),
  ('Vanessa', 'SANTANDER'), ('Vanessa', 'AVILES'), ('Vanessa', 'ZAMORA'), ('Vanessa', 'LUGO'),
  ('Vanessa', 'SALAMANCA'), ('Vanessa', 'LA CORUNA'), ('Vanessa', 'TOLEDO'), ('Vanessa', 'BURGOS'),
  ('Vanessa', 'OURENSE'), ('Vanessa', 'OVIEDO'), ('Vanessa', 'PONTEVEDRA'),
  ('Vanessa', 'SANTIAGO DE COMPOSTELA'), ('Vanessa', 'VIGO')
) as v(gestor, ciudad)
join gestores g on g.nombre = v.gestor
join ciudades ci on ci.nombre = v.ciudad
on conflict do nothing;

-- ============================================================
-- Necesario para las notificaciones del rider: cuando se actualiza una
-- incidencia/ausencia, Supabase Realtime solo manda el valor anterior
-- completo si la tabla tiene REPLICA IDENTITY FULL (si no, "old" solo
-- trae la clave primaria y no podemos saber si el estado cambió).
-- ============================================================
alter table incidencias replica identity full;
alter table ausencias replica identity full;
