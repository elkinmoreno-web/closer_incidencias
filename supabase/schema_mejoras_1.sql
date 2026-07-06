-- ============================================================
--  CLOSER LOGISTICS — MEJORAS, PASO 1 de 2
-- ============================================================
--  Ejecuta este bloque primero, SOLO, y dale a "Run".
--  (Postgres no deja usar un valor nuevo de un enum en la misma
--  transacción en la que se crea, por eso va aparte del paso 2).
-- ============================================================

alter type estado_ausencia add value if not exists 'aprobada';
alter type estado_ausencia add value if not exists 'rechazada';
