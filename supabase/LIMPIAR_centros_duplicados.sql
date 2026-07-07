-- ============================================================
--  CLOSER LOGISTICS — LIMPIAR CENTROS CREADOS POR ERROR
-- ============================================================
--  La versión anterior de la importación creaba un centro nuevo cuando
--  no encontraba coincidencia (ej. "FD Jerez", "MCD Oliva"), en vez de
--  usar el centro real. Esto los elimina.
--
--  Cómo saber cuáles son los "malos": se crearon SIN ciudad asignada
--  (ciudad_id null). Tus centros de siempre sí tienen ciudad. Además,
--  la base de datos NO deja borrar un centro que todavía tenga riders,
--  incidencias o ausencias apuntándolo, así que primero conviene haber
--  ejecutado el RESET de riders.
--
--  HAZLO EN 2 PASOS:
--    PASO 1 (abajo): ejecuta solo el SELECT para VER qué se borraría.
--    PASO 2: si la lista es correcta, ejecuta el DELETE.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- PASO 1 — VER qué centros se borrarían (NO borra nada).
-- Ejecuta esto primero y revisa la lista.
-- ─────────────────────────────────────────────────────────────
select id, nombre, ciudad_id
from centros
where ciudad_id is null
order by nombre;


-- ─────────────────────────────────────────────────────────────
-- PASO 2 — BORRAR esos centros.
-- Ejecútalo SOLO si la lista del paso 1 es la correcta.
-- (Si algún centro todavía tiene riders/incidencias/ausencias, la base
--  de datos lo protegerá y dará error; en ese caso, ejecuta antes el
--  script RESET_riders_pruebas.sql.)
-- ─────────────────────────────────────────────────────────────

-- delete from centros where ciudad_id is null;


-- ─────────────────────────────────────────────────────────────
-- Comprobación tras borrar: cuántos centros quedan sin ciudad (idealmente 0).
-- ─────────────────────────────────────────────────────────────
-- select count(*) as centros_sin_ciudad from centros where ciudad_id is null;
