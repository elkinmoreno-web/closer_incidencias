-- ============================================================
--  CLOSER LOGISTICS — ALMACENAMIENTO EN SUPABASE STORAGE
-- ============================================================
--  Ejecuta esto DESPUÉS de todos los schema_zonas.
--  Deja el sistema usando Supabase Storage (buckets privados) para las
--  fotos y justificantes. Es idempotente: seguro de ejecutar aunque ya
--  existieran los buckets.
-- ============================================================

-- ---------- Buckets privados ----------
insert into storage.buckets (id, name, public) values ('incidencias', 'incidencias', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('ausencias', 'ausencias', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('conexiones', 'conexiones', false)
on conflict (id) do nothing;

-- ---------- Políticas de subida/lectura ----------
-- Primero quitamos las políticas antiguas (de schema_final.sql y
-- schema_zonas_2.sql), que restringían la subida a la carpeta del propio
-- usuario. Eso impedía que un admin subiera una captura al crear una
-- incidencia/ausencia manual. Las reemplazamos por un modelo único.
drop policy if exists "riders_sube_sus_incidencias" on storage.objects;
drop policy if exists "riders_lee_sus_incidencias" on storage.objects;
drop policy if exists "admins_leen_incidencias" on storage.objects;
drop policy if exists "riders_sube_sus_ausencias" on storage.objects;
drop policy if exists "riders_lee_sus_ausencias" on storage.objects;
drop policy if exists "admins_leen_ausencias" on storage.objects;
drop policy if exists "admins_suben_conexiones" on storage.objects;
drop policy if exists "admins_leen_conexiones" on storage.objects;

-- Modelo único: cualquier usuario autenticado (rider o admin) puede
-- subir y leer; solo los admins pueden borrar. El control fino de quién
-- ve qué se hace en la capa de la app (URLs firmadas solo para admins
-- con sesión), no aquí. Nunca hay acceso público al bucket.
do $$
declare b text;
begin
  foreach b in array array['incidencias','ausencias','conexiones'] loop
    execute format('drop policy if exists "sube_%1$s" on storage.objects', b);
    execute format($f$create policy "sube_%1$s" on storage.objects for insert
      with check (bucket_id = '%1$s' and auth.role() = 'authenticated')$f$, b);

    execute format('drop policy if exists "lee_%1$s" on storage.objects', b);
    execute format($f$create policy "lee_%1$s" on storage.objects for select
      using (bucket_id = '%1$s' and auth.role() = 'authenticated')$f$, b);

    execute format('drop policy if exists "borra_%1$s" on storage.objects', b);
    execute format($f$create policy "borra_%1$s" on storage.objects for delete
      using (bucket_id = '%1$s' and is_admin())$f$, b);
  end loop;
end $$;

-- ---------- Columnas de archivo en las tablas ----------
-- Incidencias: rutas dentro del bucket "incidencias".
alter table incidencias add column if not exists screenshot_url text;
alter table incidencias add column if not exists evidencia_url text;

-- Ausencias: prefijo (carpeta) dentro del bucket "ausencias" + nº de archivos.
alter table ausencias add column if not exists storage_prefix text;
alter table ausencias add column if not exists num_archivos int not null default 0;

-- Conexiones fuera de zona: ruta dentro del bucket "conexiones".
alter table conexiones_fuera_zona add column if not exists screenshot_url text;

-- ---------- Marca de tiempo de subida (para el borrado automático) ----------
-- Ya existe created_at en las tres tablas; el borrado de archivos viejos
-- (2+ meses) se apoya en esa fecha. Ver README, sección de retención.
