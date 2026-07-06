-- ============================================================
--  CLOSER LOGISTICS — ZONAS, PASO 2 de 2
-- ============================================================
--  Ejecuta esto DESPUÉS de schema_zonas_1.sql.
-- ============================================================

-- ============================================================
-- CIUDADES (agrupación de centros/markets)
-- ============================================================
create table if not exists ciudades (
  id serial primary key,
  nombre text not null unique
);

alter table ciudades enable row level security;
drop policy if exists "ciudades_lectura" on ciudades;
create policy "ciudades_lectura" on ciudades for select using (true);
drop policy if exists "ciudades_escritura" on ciudades;
create policy "ciudades_escritura" on ciudades for all using (is_super_admin());

insert into ciudades (nombre) values
  ('ALMERIA'), ('GRANADA'), ('JAEN'), ('MALAGA'), ('BARCELONA'), ('GIRONA'), ('LLEIDA'),
  ('ALICANTE'), ('CASTELLON'), ('GANDIA'), ('IBIZA'), ('VILLARREAL'), ('MURCIA'), ('MALLORCA'),
  ('VALENCIA'), ('ALGECIRAS'), ('BADAJOZ'), ('CACERES'), ('CIUDAD REAL'), ('CORDOBA'), ('HUELVA'),
  ('JEREZ'), ('MELILLA'), ('SEVILLE'), ('MADRID'), ('BILBAO'), ('LEON'), ('LOGRONO'), ('PAMPLONA'),
  ('TARRAGONA'), ('VALLADOLID'), ('VITORIA'), ('ZARAGOZA'), ('ALBACETE'), ('SEGOVIA'), ('GIJON'),
  ('SAN SEBASTIAN'), ('SANTANDER'), ('AVILES'), ('ZAMORA'), ('LUGO'), ('SALAMANCA'), ('LA CORUNA'),
  ('TOLEDO'), ('BURGOS'), ('OURENSE'), ('OVIEDO'), ('PONTEVEDRA'), ('SANTIAGO DE COMPOSTELA'), ('VIGO')
on conflict (nombre) do nothing;

-- ---------- Centros: columna de ciudad ----------
alter table centros add column if not exists ciudad_id int references ciudades(id);

-- ---------- Asignar cada centro existente a su ciudad ----------
update centros c set ciudad_id = ci.id
from (values
  ('ALMERIA CENTRO','ALMERIA'), ('ALMERIA ROQUETAS','ALMERIA'), ('GRANADA CENTRO','GRANADA'),
  ('JAEN','JAEN'), ('MALAGA CENTRO','MALAGA'), ('MALAGA FUENGIROLA','MALAGA'),
  ('MALAGA MARBELLA','MALAGA'), ('MALAGA MIJAS','MALAGA'), ('MALAGA SAN PEDRO','MALAGA'),
  ('MALAGA TORREMOLINOS','MALAGA'), ('BARCELONA BADALONA','BARCELONA'),
  ('BARCELONA CASTELLDEFELS','BARCELONA'), ('BARCELONA CENTRO','BARCELONA'),
  ('BARCELONA CERDANYOLA RIPOLLET','BARCELONA'), ('BARCELONA GAVA VILADECANS','BARCELONA'),
  ('BARCELONA GRANOLLERS','BARCELONA'), ('BARCELONA LLOBREGAT','BARCELONA'),
  ('BARCELONA MARTORELL','BARCELONA'), ('BARCELONA MATARO','BARCELONA'),
  ('BARCELONA PARETS','BARCELONA'), ('BARCELONA SABADELL','BARCELONA'),
  ('BARCELONA SANT CUGAT','BARCELONA'), ('BARCELONA SANT VICENC','BARCELONA'),
  ('BARCELONA TERRASSA','BARCELONA'), ('GIRONA','GIRONA'), ('LLEIDA','LLEIDA'),
  ('ALICANTE CENTRO','ALICANTE'), ('ALICANTE ELCHE','ALICANTE'), ('ALICANTE RASPEIG','ALICANTE'),
  ('ALICANTE SANT JOAN','ALICANTE'), ('ALICANTE BENIDORM','ALICANTE'),
  ('CASTELLON DE LA PLANA','CASTELLON'), ('GANDIA','GANDIA'), ('IBIZA','IBIZA'),
  ('CASTELLON VILLARREAL','VILLARREAL'), ('MURCIA CARTAGENA','MURCIA'), ('MURCIA CENTRO','MURCIA'),
  ('MALLORCA ARENAL','MALLORCA'), ('MALLORCA CENTRO','MALLORCA'), ('MALLORCA MAGALUF','MALLORCA'),
  ('VALENCIA ALFAFAR PICASSENT','VALENCIA'), ('VALENCIA CENTRO','VALENCIA'),
  ('VALENCIA PATERNA','VALENCIA'), ('VALENCIA SAGUNTO','VALENCIA'),
  ('VALENCIA TORRENTE BONAIRE','VALENCIA'), ('ALGECIRAS','ALGECIRAS'),
  ('ALGECIRAS LA LINEA','ALGECIRAS'), ('BADAJOZ','BADAJOZ'), ('CACERES','CACERES'),
  ('CIUDAD REAL','CIUDAD REAL'), ('CORDOBA','CORDOBA'), ('HUELVA','HUELVA'),
  ('JEREZ CADIZ','JEREZ'), ('JEREZ CENTRO','JEREZ'), ('JEREZ CHICLANA DE LA FRONTERA','JEREZ'),
  ('JEREZ PUERTO DE SANTA MARIA','JEREZ'), ('JEREZ ROTA','JEREZ'), ('JEREZ SAN FERNANDO','JEREZ'),
  ('MELILLA','MELILLA'), ('SEVILLA CENTRO','SEVILLE'), ('SEVILLA DOS HERMANAS','SEVILLE'),
  ('SEVILLA MONTEQUINTO','SEVILLE'), ('SEVILLA OESTE','SEVILLE'), ('SEVILLA ESTE','SEVILLE'),
  ('MADRID ALCALA DE HENARES','MADRID'), ('MADRID ALCOBENDAS','MADRID'),
  ('MADRID ALCORCÓN','MADRID'), ('MADRID BARAJAS','MADRID'), ('MADRID BOADILLA','MADRID'),
  ('MADRID CARABANCHEL','MADRID'), ('MADRID CENTRO','MADRID'),
  ('MADRID COLLADO VILLALBA','MADRID'), ('MADRID COSLADA','MADRID'), ('MADRID GETAFE','MADRID'),
  ('MADRID MAJADAHONDA','MADRID'), ('MADRID PARLA FUENLABRADA','MADRID'),
  ('MADRID PINTO VALDEMORO','MADRID'), ('MADRID POZUELO','MADRID'), ('MADRID RIVAS','MADRID'),
  ('MADRID TORREJON','MADRID'), ('MADRID VALLECAS','MADRID'), ('MADRID MIRASIERRA','MADRID'),
  ('MADRID LAS ROZAS','MADRID'), ('BILBAO','BILBAO'), ('BILBAO NORTE','BILBAO'),
  ('LEON','LEON'), ('LOGRONO','LOGRONO'), ('PAMPLONA','PAMPLONA'), ('TARRAGONA','TARRAGONA'),
  ('VALLADOLID','VALLADOLID'), ('VITORIA','VITORIA'), ('ZARAGOZA','ZARAGOZA'),
  ('ALBACETE','ALBACETE'), ('SEGOVIA','SEGOVIA'), ('GIJON','GIJON'),
  ('SAN SEBASTIAN','SAN SEBASTIAN'), ('SANTANDER','SANTANDER'), ('AVILES','AVILES'),
  ('ZAMORA','ZAMORA'), ('LUGO','LUGO')
) as mapping(market, ciudad)
join ciudades ci on ci.nombre = mapping.ciudad
where c.nombre = mapping.market;

-- ---------- Centros que estaban en tu mapeo pero no en la tabla todavía ----------
insert into centros (nombre, ciudad_id)
select v.nombre, ci.id
from (values
  ('SALAMANCA','SALAMANCA'), ('LA CORUNA CENTRO','LA CORUNA'), ('LA CORUNA FERROL','LA CORUNA'),
  ('TOLEDO','TOLEDO'), ('BURGOS','BURGOS'), ('OURENSE','OURENSE'), ('OVIEDO','OVIEDO'),
  ('PONTEVEDRA','PONTEVEDRA'), ('SANTIAGO DE COMPOSTELA','SANTIAGO DE COMPOSTELA'), ('VIGO','VIGO')
) as v(nombre, ciudad)
join ciudades ci on ci.nombre = v.ciudad
where not exists (select 1 from centros c where c.nombre = v.nombre);

-- ============================================================
-- ADMINS POR ZONA
-- ============================================================
create table if not exists admin_ciudades (
  admin_id uuid references admins(id) on delete cascade,
  ciudad_id int references ciudades(id) on delete cascade,
  primary key (admin_id, ciudad_id)
);

alter table admin_ciudades enable row level security;
drop policy if exists "admin_ciudades_lectura" on admin_ciudades;
create policy "admin_ciudades_lectura" on admin_ciudades for select using (is_admin());
drop policy if exists "admin_ciudades_escritura" on admin_ciudades;
create policy "admin_ciudades_escritura" on admin_ciudades for all using (is_super_admin());

-- Devuelve los IDs de centro que el admin actual puede ver:
-- todos si es super_admin o moderador, o solo los de sus ciudades
-- asignadas si es admin_zona. Vacío si no es admin.
create or replace function centros_visibles_admin()
returns setof int as $$
  select c.id from centros c
  where
    exists (
      select 1 from admins a
      where a.auth_user_id = auth.uid() and a.activo and a.rol in ('super_admin','moderador')
    )
    or c.ciudad_id in (
      select ac.ciudad_id from admin_ciudades ac
      join admins a on a.id = ac.admin_id
      where a.auth_user_id = auth.uid() and a.activo and a.rol = 'admin_zona'
    );
$$ language sql stable security definer;

-- ============================================================
-- RLS: incidencias, ausencias y riders ahora respetan la zona
-- ============================================================

drop policy if exists "incidencias_rider_lee_las_suyas" on incidencias;
create policy "incidencias_ve" on incidencias for select
  using (rider_id = current_rider_id() or (is_admin() and centro_id in (select centros_visibles_admin())));

drop policy if exists "incidencias_rider_crea_las_suyas" on incidencias;
create policy "incidencias_crea" on incidencias for insert
  with check (rider_id = current_rider_id() or (is_admin() and centro_id in (select centros_visibles_admin())));

drop policy if exists "incidencias_admin_actualiza" on incidencias;
create policy "incidencias_actualiza" on incidencias for update
  using (is_admin() and centro_id in (select centros_visibles_admin()));

drop policy if exists "incidencias_admin_borra" on incidencias;
create policy "incidencias_borra" on incidencias for delete
  using (is_admin() and centro_id in (select centros_visibles_admin()));

-- ---------- Ausencias: añadimos centro_id (antes no lo tenía) ----------
alter table ausencias add column if not exists centro_id int references centros(id);
update ausencias a set centro_id = r.centro_id from riders r where a.rider_id = r.id and a.centro_id is null;

drop policy if exists "ausencias_rider_lee_las_suyas" on ausencias;
create policy "ausencias_ve" on ausencias for select
  using (rider_id = current_rider_id() or (is_admin() and centro_id in (select centros_visibles_admin())));

drop policy if exists "ausencias_rider_crea_las_suyas" on ausencias;
create policy "ausencias_crea" on ausencias for insert
  with check (rider_id = current_rider_id() or (is_admin() and centro_id in (select centros_visibles_admin())));

drop policy if exists "ausencias_admin_actualiza" on ausencias;
create policy "ausencias_actualiza" on ausencias for update
  using (is_admin() and centro_id in (select centros_visibles_admin()));

-- ---------- Riders ----------
drop policy if exists "riders_ve_su_fila_o_admin" on riders;
create policy "riders_ve" on riders for select
  using (auth_user_id = auth.uid() or (is_admin() and centro_id in (select centros_visibles_admin())));

drop policy if exists "riders_admin_gestiona" on riders;
create policy "riders_gestiona" on riders for all
  using (is_admin() and centro_id in (select centros_visibles_admin()));

-- ============================================================
-- CONEXIONES FUERA DE ZONA
-- ============================================================
create table if not exists conexiones_fuera_zona (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references riders(id),
  dni text not null,
  nombre_rider text not null,
  centro_id int references centros(id),
  fecha date not null,
  screenshot_url text,
  observaciones text,
  created_by uuid references admins(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_conexiones_centro on conexiones_fuera_zona (centro_id);
create index if not exists idx_conexiones_fecha on conexiones_fuera_zona (fecha desc);

alter table conexiones_fuera_zona enable row level security;

drop policy if exists "conexiones_lee" on conexiones_fuera_zona;
create policy "conexiones_lee" on conexiones_fuera_zona for select
  using (is_admin() and centro_id in (select centros_visibles_admin()));

drop policy if exists "conexiones_crea" on conexiones_fuera_zona;
create policy "conexiones_crea" on conexiones_fuera_zona for insert
  with check (is_admin() and centro_id in (select centros_visibles_admin()));

drop policy if exists "conexiones_actualiza" on conexiones_fuera_zona;
create policy "conexiones_actualiza" on conexiones_fuera_zona for update
  using (is_admin() and centro_id in (select centros_visibles_admin()));

drop policy if exists "conexiones_borra" on conexiones_fuera_zona;
create policy "conexiones_borra" on conexiones_fuera_zona for delete
  using (is_super_admin());

insert into storage.buckets (id, name, public) values ('conexiones', 'conexiones', false)
on conflict (id) do nothing;

drop policy if exists "admins_suben_conexiones" on storage.objects;
create policy "admins_suben_conexiones" on storage.objects for insert
  with check (bucket_id = 'conexiones' and is_admin());
drop policy if exists "admins_leen_conexiones" on storage.objects;
create policy "admins_leen_conexiones" on storage.objects for select
  using (bucket_id = 'conexiones' and is_admin());

-- ============================================================
-- RIDERS: campos adicionales (de la exportación de RRHH)
-- ============================================================
alter table riders add column if not exists nacionalidad text;
alter table riders add column if not exists genero text;
alter table riders add column if not exists empresa_contratante text;
alter table riders add column if not exists provincia text;
alter table riders add column if not exists puesto text;
alter table riders add column if not exists fecha_alta date;
alter table riders add column if not exists fecha_baja date;
alter table riders add column if not exists tipo_baja text;
alter table riders add column if not exists motivo_baja text;
alter table riders add column if not exists fecha_nacimiento date;
alter table riders add column if not exists telefono text;
alter table riders add column if not exists direccion text;
alter table riders add column if not exists horas_trabajo numeric;
alter table riders add column if not exists turno text;

-- ============================================================
-- Tiempo real sobre conexiones_fuera_zona (opcional, consistente con el resto)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conexiones_fuera_zona'
  ) then
    alter publication supabase_realtime add table public.conexiones_fuera_zona;
  end if;
end $$;
