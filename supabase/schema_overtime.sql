-- ============================================================
--  CLOSER LOGISTICS — MÓDULO HORAS EXTRA (OVERTIME)
-- ============================================================
--  Integra el antiguo "Panel Overtime" de Google Apps Script dentro
--  del CRM, reutilizando el sistema de roles/zonas que ya existe
--  (un admin/moderador de zona solo ve y audita lo de sus ciudades;
--  el super_admin ve todo).
--
--  Ejecutar DESPUÉS de schema_zonas_3_2.sql.
-- ============================================================

-- ---------- 1. Vincular cada centro con su ID en la API externa ----------
-- La API de horas extra (closerlogistics.com) identifica los centros con
-- SU PROPIO id numérico (291, 316, 218...), distinto del id interno del
-- CRM. Lo guardamos aparte para no confundirlos.
alter table centros add column if not exists api_centro_id int;
create unique index if not exists idx_centros_api_id on centros (api_centro_id) where api_centro_id is not null;

-- Alta del único centro que faltaba en el catálogo.
insert into centros (nombre, activo)
select 'ALICANTE BENIDORM', true
where not exists (select 1 from centros where nombre = 'ALICANTE BENIDORM');

-- Equivalencia nombre de centro (CRM) -> id de la API externa (Market).
-- Si algún nombre no coincide exactamente con uno existente, esa fila del
-- update simplemente no afecta a nada (no rompe si falta un centro).
update centros set api_centro_id = v.api_id from (values
  (291,'ALMERIA CENTRO'), (316,'ALMERIA ROQUETAS'), (275,'GRANADA CENTRO'), (265,'JAEN'),
  (219,'MALAGA CENTRO'), (270,'MALAGA FUENGIROLA'), (274,'MALAGA MARBELLA'), (1037,'MALAGA MIJAS'),
  (271,'MALAGA SAN PEDRO'), (272,'MALAGA TORREMOLINOS'), (253,'BARCELONA BADALONA'),
  (1028,'BARCELONA CASTELLDEFELS'), (218,'BARCELONA CENTRO'), (1025,'BARCELONA CERDANYOLA RIPOLLET'),
  (1024,'BARCELONA GAVA VILADECANS'), (258,'BARCELONA GRANOLLERS'), (252,'BARCELONA LLOBREGAT'),
  (1027,'BARCELONA MARTORELL'), (1026,'BARCELONA MATARO'), (259,'BARCELONA PARETS'),
  (255,'BARCELONA SABADELL'), (256,'BARCELONA SANT CUGAT'), (1029,'BARCELONA SANT VICENC'),
  (254,'BARCELONA TERRASSA'), (563,'GIRONA'), (561,'LLEIDA'), (249,'ALICANTE CENTRO'),
  (251,'ALICANTE ELCHE'), (283,'ALICANTE RASPEIG'), (284,'ALICANTE SANT JOAN'), (286,'ALICANTE BENIDORM'),
  (975,'CASTELLON DE LA PLANA'), (282,'GANDIA'), (811,'IBIZA'), (277,'CASTELLON VILLARREAL'),
  (378,'MURCIA CARTAGENA'), (279,'MURCIA CENTRO'), (1034,'MALLORCA ARENAL'), (559,'MALLORCA CENTRO'),
  (1035,'MALLORCA MAGALUF'), (267,'VALENCIA ALFAFAR PICASSENT'), (236,'VALENCIA CENTRO'),
  (952,'VALENCIA PATERNA'), (349,'VALENCIA SAGUNTO'), (266,'VALENCIA TORRENTE BONAIRE'),
  (377,'ALGECIRAS'), (410,'ALGECIRAS LA LINEA'), (934,'BADAJOZ'), (603,'CACERES'), (562,'CIUDAD REAL'),
  (278,'CORDOBA'), (264,'HUELVA'), (241,'JEREZ CADIZ'), (288,'JEREZ CENTRO'),
  (875,'JEREZ CHICLANA DE LA FRONTERA'), (260,'JEREZ PUERTO DE SANTA MARIA'), (263,'JEREZ ROTA'),
  (261,'JEREZ SAN FERNANDO'), (936,'MELILLA'), (240,'SEVILLA CENTRO'), (268,'SEVILLA DOS HERMANAS'),
  (1036,'SEVILLA MONTEQUINTO'), (953,'SEVILLA OESTE'), (1057,'SEVILLA ESTE'),
  (371,'MADRID ALCALA DE HENARES'), (951,'MADRID ALCOBENDAS'), (949,'MADRID ALCORCÓN'),
  (1042,'MADRID BARAJAS'), (365,'MADRID BOADILLA'), (1043,'MADRID CARABANCHEL'), (217,'MADRID CENTRO'),
  (1041,'MADRID COLLADO VILLALBA'), (1044,'MADRID COSLADA'), (950,'MADRID GETAFE'),
  (1033,'MADRID MAJADAHONDA'), (331,'MADRID PARLA FUENLABRADA'), (1047,'MADRID PINTO VALDEMORO'),
  (321,'MADRID POZUELO'), (345,'MADRID RIVAS'), (1045,'MADRID TORREJON'), (1046,'MADRID VALLECAS'),
  (1054,'MADRID MIRASIERRA'), (1056,'MADRID LAS ROZAS'), (557,'BILBAO'), (1038,'BILBAO NORTE'),
  (558,'LEON'), (445,'LOGRONO'), (881,'PAMPLONA'), (938,'TARRAGONA'), (482,'VALLADOLID'),
  (931,'VITORIA'), (238,'ZARAGOZA'), (880,'ALBACETE'), (874,'SEGOVIA'), (873,'GIJON'),
  (469,'SAN SEBASTIAN'), (937,'SANTANDER'), (567,'AVILES'), (574,'ZAMORA'), (564,'LUGO'),
  (882,'SALAMANCA'), (467,'LA CORUNA CENTRO'), (954,'LA CORUNA FERROL'), (922,'TOLEDO'),
  (935,'BURGOS'), (560,'OURENSE'), (565,'OVIEDO'), (566,'PONTEVEDRA'), (955,'SANTIAGO DE COMPOSTELA'),
  (556,'VIGO')
) as v(api_id, nombre_api)
where centros.nombre = v.nombre_api;

-- ---------- 2. Tabla de registros de horas extra ----------
-- Sustituye la caché de CacheService + la hoja "_auditoria_estados" del
-- Apps Script: ahora todo vive persistente en la base de datos.
create table if not exists overtime_registros (
  id bigserial primary key,
  centro_id int not null references centros(id),
  rider_usuario text not null,        -- "username" de la API (identifica al rider en el sistema externo)
  rider_nombre text,
  rider_apellido text,
  fecha date not null,
  dia_semana text not null,
  zona text not null,                 -- 'Uber' | 'OnDemand' | 'Mixto'
  horario text,
  horas_uber numeric(6,2) not null default 0,
  horas_ondemand numeric(6,2) not null default 0,
  horas_total numeric(6,2) not null default 0,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Confirmado','Rechazado')),
  auditado_por uuid references admins(auth_user_id),
  auditado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  -- Una fila por rider+centro+fecha: si se vuelve a pedir la misma
  -- semana, se actualiza en vez de duplicar.
  unique (centro_id, rider_usuario, fecha)
);

create index if not exists idx_overtime_centro_fecha on overtime_registros (centro_id, fecha);
create index if not exists idx_overtime_estado on overtime_registros (estado);

alter table overtime_registros enable row level security;

-- Ver: mismo patrón de zona que incidencias/ausencias.
drop policy if exists "overtime_ve" on overtime_registros;
create policy "overtime_ve" on overtime_registros for select
  using (is_admin() and centro_id in (select centros_visibles_admin()));

-- Insertar/actualizar (lo hace el propio backend al descargar de la API):
-- mismo patrón de zona, para que un admin de Madrid no pueda escribir
-- registros de un centro de Barcelona.
drop policy if exists "overtime_inserta" on overtime_registros;
create policy "overtime_inserta" on overtime_registros for insert
  with check (is_admin() and centro_id in (select centros_visibles_admin()));

drop policy if exists "overtime_actualiza" on overtime_registros;
create policy "overtime_actualiza" on overtime_registros for update
  using (is_admin() and centro_id in (select centros_visibles_admin()));

-- Realtime, por si luego se quiere notificar en vivo (igual que incidencias).
alter table overtime_registros replica identity full;

-- ============================================================
--  CACHÉ — para no golpear la API externa en cada clic
-- ============================================================

-- ---------- 3. "Calcula horario" por rider (persistente, casi nunca cambia) ----------
-- Sustituye la hoja "CacheDrivers" del Apps Script. Se guarda por UUID
-- del driver en el sistema externo (no por rider_id del CRM, porque este
-- dato es del sistema externo y un mismo username puede repetirse entre
-- centros). Nunca expira sola: se refresca solo si el usuario pulsa
-- "actualizar" en la interfaz.
create table if not exists overtime_drivers_calcula (
  uuid_externo text primary key,
  calcula_horario boolean not null,
  actualizado_en timestamptz not null default now()
);

alter table overtime_drivers_calcula enable row level security;

-- Es un dato del sistema externo sin zona propia (no pertenece a un
-- centro concreto), así que basta con exigir que quien lea/escriba sea
-- un admin activo cualquiera.
drop policy if exists "overtime_drivers_calcula_todo" on overtime_drivers_calcula;
create policy "overtime_drivers_calcula_todo" on overtime_drivers_calcula for all
  using (is_admin())
  with check (is_admin());

-- ---------- 4. Caché de resultados CH vs WH por centro/semana (30 min) ----------
-- CH vs WH no se persiste como historial (es informativo, no hay
-- auditoría), pero si el mismo gestor consulta la misma semana varias
-- veces seguidas no tiene sentido volver a golpear la API cada vez.
create table if not exists ch_vs_wh_cache (
  centro_id int not null references centros(id),
  fecha_lunes date not null,
  datos jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (centro_id, fecha_lunes)
);

alter table ch_vs_wh_cache enable row level security;

drop policy if exists "ch_vs_wh_cache_ve" on ch_vs_wh_cache;
create policy "ch_vs_wh_cache_ve" on ch_vs_wh_cache for select
  using (is_admin() and centro_id in (select centros_visibles_admin()));

drop policy if exists "ch_vs_wh_cache_escribe" on ch_vs_wh_cache;
create policy "ch_vs_wh_cache_escribe" on ch_vs_wh_cache for all
  using (is_admin() and centro_id in (select centros_visibles_admin()))
  with check (is_admin() and centro_id in (select centros_visibles_admin()));
