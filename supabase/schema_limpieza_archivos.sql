-- ============================================================
--  CLOSER LOGISTICS — BORRADO AUTOMÁTICO DE ARCHIVOS ANTIGUOS
-- ============================================================
--  Ejecuta esto DESPUÉS de schema_almacenamiento_final.sql.
--
--  QUÉ HACE: cada noche borra del almacenamiento las FOTOS (lo pesado)
--  de incidencias, ausencias y conexiones con 2 meses o más. El REGISTRO
--  en la base de datos NO se borra: se conserva quién, cuándo, motivo,
--  estado, etc. Solo desaparece el archivo, y la fila se marca para que
--  el panel muestre "Archivo eliminado por antigüedad".
--
--  IMPORTANTE — léelo antes de ejecutar:
--   1. Esto borra evidencias de forma permanente. Confirma con RRHH/
--      legal que 2 meses es un plazo aceptable ANTES de activarlo. Para
--      otro plazo, cambia el '2 months' de abajo.
--   2. Borrar de la tabla storage.objects con SQL NO libera el espacio
--      real (deja el archivo huérfano). Hay que llamar a la Storage API.
--      Por eso esta función usa la extensión http + una clave de servicio
--      guardada en Vault. Sigue los pasos de configuración de abajo.
-- ============================================================

-- ------------------------------------------------------------
-- PASO A: extensiones necesarias
-- ------------------------------------------------------------
create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- PASO B: guardar en Vault la URL del proyecto y la service_role key
-- ------------------------------------------------------------
--  Ejecuta estos dos INSERT UNA VEZ, sustituyendo los valores por los de
--  tu proyecto (Settings → API). La service_role key es secreta: Vault la
--  guarda cifrada, no en texto plano en el código.
--
--    select vault.create_secret('https://TU-PROYECTO.supabase.co', 'proyecto_url');
--    select vault.create_secret('TU-SERVICE-ROLE-KEY', 'service_role_key');
--
--  (Si ya existieran, usa vault.update_secret en lugar de create_secret.)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- PASO C: columnas de marca (para no reintentar y para el aviso en panel)
-- ------------------------------------------------------------
alter table incidencias add column if not exists archivos_purgados boolean not null default false;
alter table ausencias add column if not exists archivos_purgados boolean not null default false;
alter table conexiones_fuera_zona add column if not exists archivos_purgados boolean not null default false;

-- ------------------------------------------------------------
-- PASO D: función que borra vía Storage API (libera espacio de verdad)
-- ------------------------------------------------------------
create or replace function purgar_archivos_antiguos()
returns void as $$
declare
  limite timestamptz := now() - interval '2 months';
  v_url text;
  v_key text;
  fila record;
  rutas text[];
  archivo record;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'proyecto_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise notice 'Faltan los secretos proyecto_url / service_role_key en Vault; no se purga nada.';
    return;
  end if;

  -- Borra una lista de rutas de un bucket con una sola llamada a la API.
  -- La Storage API acepta DELETE /object/{bucket} con body {"prefixes":[...]}.
  -- ---- Incidencias ----
  for fila in
    select id, screenshot_url, evidencia_url from incidencias
    where created_at < limite and archivos_purgados = false
      and (screenshot_url is not null or evidencia_url is not null)
  loop
    rutas := array_remove(array[fila.screenshot_url, fila.evidencia_url], null);
    if array_length(rutas, 1) > 0 then
      perform extensions.http((
        'DELETE',
        v_url || '/storage/v1/object/incidencias',
        array[extensions.http_header('Authorization', 'Bearer ' || v_key),
              extensions.http_header('apikey', v_key)],
        'application/json',
        json_build_object('prefixes', rutas)::text
      )::extensions.http_request);
    end if;
    update incidencias set archivos_purgados = true where id = fila.id;
  end loop;

  -- ---- Ausencias (varios archivos bajo un prefijo/carpeta) ----
  for fila in
    select id, storage_prefix from ausencias
    where created_at < limite and archivos_purgados = false and storage_prefix is not null
  loop
    -- Recogemos las rutas reales de los archivos de esa carpeta.
    select array_agg(name) into rutas from storage.objects
    where bucket_id = 'ausencias' and name like fila.storage_prefix || '/%';

    if rutas is not null and array_length(rutas, 1) > 0 then
      perform extensions.http((
        'DELETE',
        v_url || '/storage/v1/object/ausencias',
        array[extensions.http_header('Authorization', 'Bearer ' || v_key),
              extensions.http_header('apikey', v_key)],
        'application/json',
        json_build_object('prefixes', rutas)::text
      )::extensions.http_request);
    end if;
    update ausencias set archivos_purgados = true where id = fila.id;
  end loop;

  -- ---- Conexiones fuera de zona ----
  for fila in
    select id, screenshot_url from conexiones_fuera_zona
    where created_at < limite and archivos_purgados = false and screenshot_url is not null
  loop
    perform extensions.http((
      'DELETE',
      v_url || '/storage/v1/object/conexiones',
      array[extensions.http_header('Authorization', 'Bearer ' || v_key),
            extensions.http_header('apikey', v_key)],
      'application/json',
      json_build_object('prefixes', array[fila.screenshot_url])::text
    )::extensions.http_request);
    update conexiones_fuera_zona set archivos_purgados = true where id = fila.id;
  end loop;
end;
$$ language plpgsql security definer;

-- ------------------------------------------------------------
-- PASO E: programar la limpieza cada noche a las 03:00
-- ------------------------------------------------------------
select cron.unschedule('purgar-archivos-antiguos')
where exists (select 1 from cron.job where jobname = 'purgar-archivos-antiguos');

select cron.schedule(
  'purgar-archivos-antiguos',
  '0 3 * * *',
  $$select purgar_archivos_antiguos();$$
);

-- Para probar sin esperar a la noche:  select purgar_archivos_antiguos();
