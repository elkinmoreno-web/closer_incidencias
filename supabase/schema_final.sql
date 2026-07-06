-- ============================================================
--  CLOSER LOGISTICS — SCRIPT FINAL (Supabase Storage)
-- ============================================================
--  Seguro de ejecutar sin importar qué otros scripts hayas corrido
--  antes (schema_storage.sql, schema_drive.sql, o ninguno). Deja la
--  base de datos en el estado correcto para la versión actual de la
--  app, que guarda los archivos en Supabase Storage.
--
--  Requisito previo: haber ejecutado schema_supabase.sql al menos una
--  vez (crea las tablas base, catálogos y RLS).
-- ============================================================

-- ---------- Incidencias: columnas de archivo correctas ----------
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'incidencias' and column_name = 'screenshot_drive_id') then
    alter table incidencias rename column screenshot_drive_id to screenshot_url;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'incidencias' and column_name = 'screenshot_url') then
    alter table incidencias add column screenshot_url text;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'incidencias' and column_name = 'evidencia_drive_id') then
    alter table incidencias rename column evidencia_drive_id to evidencia_url;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'incidencias' and column_name = 'evidencia_url') then
    alter table incidencias add column evidencia_url text;
  end if;
end $$;

-- ---------- Ausencias: columnas de archivo correctas ----------
alter table ausencias drop column if exists archivos;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'ausencias' and column_name = 'storage_prefix') then
    alter table ausencias add column storage_prefix text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'ausencias' and column_name = 'num_archivos') then
    alter table ausencias add column num_archivos int not null default 0;
  end if;
end $$;

-- ---------- Buckets privados ----------
insert into storage.buckets (id, name, public)
values ('incidencias', 'incidencias', false), ('ausencias', 'ausencias', false)
on conflict (id) do nothing;

-- ---------- Políticas de acceso a los archivos ----------
drop policy if exists "riders_sube_sus_incidencias" on storage.objects;
create policy "riders_sube_sus_incidencias"
on storage.objects for insert
with check (bucket_id = 'incidencias' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "riders_lee_sus_incidencias" on storage.objects;
create policy "riders_lee_sus_incidencias"
on storage.objects for select
using (bucket_id = 'incidencias' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "admins_leen_incidencias" on storage.objects;
create policy "admins_leen_incidencias"
on storage.objects for select
using (bucket_id = 'incidencias' and is_admin());

drop policy if exists "riders_sube_sus_ausencias" on storage.objects;
create policy "riders_sube_sus_ausencias"
on storage.objects for insert
with check (bucket_id = 'ausencias' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "riders_lee_sus_ausencias" on storage.objects;
create policy "riders_lee_sus_ausencias"
on storage.objects for select
using (bucket_id = 'ausencias' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "admins_leen_ausencias" on storage.objects;
create policy "admins_leen_ausencias"
on storage.objects for select
using (bucket_id = 'ausencias' and is_admin());

-- ---------- Tiempo real sobre incidencias ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incidencias'
  ) then
    alter publication supabase_realtime add table public.incidencias;
  end if;
end $$;
