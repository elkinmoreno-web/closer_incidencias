-- ============================================================
--  CLOSER LOGISTICS — RESET DE DATOS DE PRUEBA (SOLO RIDERS)
-- ============================================================
--  Vacía TODO lo relacionado con riders para empezar de cero:
--    - incidencias
--    - ausencias
--    - conexiones fuera de zona
--    - riders
--    - los usuarios de Auth de esos riders (para no dejar accesos huérfanos)
--
--  NO toca: administradores, catálogos (centros, ciudades, vehículos,
--  motivos, gestores) ni anuncios.
--
--  ⚠️  ESTO BORRA DATOS DE FORMA PERMANENTE. Úsalo solo mientras estás
--      en pruebas. Si ya hubiera datos reales que conservar, NO lo
--      ejecutes.
--
--  Cómo usarlo: pégalo entero en el SQL Editor de Supabase y dale a Run.
-- ============================================================

do $$
declare
  ids_auth uuid[];
begin
  -- 1. Guardamos los usuarios de Auth de los riders ANTES de borrar las
  --    filas (después ya no sabríamos cuáles eran).
  select array_agg(auth_user_id) into ids_auth
  from riders
  where auth_user_id is not null;

  -- 2. Borrar el historial que depende de los riders. Va primero porque
  --    incidencias/ausencias/conexiones referencian a riders(id) y la
  --    base de datos no deja borrar un rider mientras algo lo apunte.
  delete from incidencias;
  delete from ausencias;
  delete from conexiones_fuera_zona;

  -- 3. Borrar los riders.
  delete from riders;

  -- 4. Borrar los usuarios de Auth de esos riders (sus accesos), para no
  --    dejar cuentas huérfanas. Solo se borran los que estaban ligados a
  --    un rider; los administradores NO están en esta lista, así que
  --    quedan intactos.
  if ids_auth is not null then
    delete from auth.users where id = any(ids_auth);
  end if;

  raise notice 'Reset completado. Riders y su historial borrados; administradores y catálogos intactos.';
end $$;

-- Comprobación rápida (deben salir todos en 0):
select
  (select count(*) from riders)                 as riders,
  (select count(*) from incidencias)            as incidencias,
  (select count(*) from ausencias)              as ausencias,
  (select count(*) from conexiones_fuera_zona)  as conexiones;
