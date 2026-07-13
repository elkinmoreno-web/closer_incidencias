-- ============================================================
--  CLOSER LOGISTICS — AUDITORÍA POR ZONA + ANUNCIOS MÚLTIPLES
-- ============================================================

-- ---------- 1. Auditoría: guardar a qué centro pertenece cada evento ----------
-- Hasta ahora "auditoria" no sabía a qué centro pertenecía cada acción,
-- así que CUALQUIER admin (incluso un moderador de una sola ciudad) veía
-- TODO el historial de todo el país. Con esta columna, un admin/moderador
-- de zona solo ve la auditoría de sus ciudades; el super_admin sigue
-- viendo todo.
alter table auditoria add column if not exists centro_id int references centros(id);
create index if not exists idx_auditoria_centro on auditoria (centro_id);

drop policy if exists "auditoria_lectura" on auditoria;
create policy "auditoria_lectura" on auditoria for select
  using (
    is_admin() and (
      (centro_id is null and admin_sin_restriccion_zona())
      or centro_id in (select centros_visibles_admin())
    )
  );
-- La política de inserción no cambia: cualquier admin autenticado puede
-- registrar sus propias acciones (auditoria_insercion ya existía).

-- ---------- 2. Anuncios: varios a la vez, global o por ciudad, y para quién ----------
-- Antes solo existía UN anuncio activo a la vez, siempre global y visto
-- por todos. Ahora puede haber varios anuncios activos simultáneos, cada
-- uno con dos dimensiones independientes:
--   - ciudad_id: null = global (todas las ciudades), o una ciudad concreta.
--   - audiencia: a quién se le muestra — 'todos', solo 'admins' (para
--     avisos de gestión interna, ej. "revisar horas extra") o solo
--     'riders' (para avisos operativos que no interesa que vea el staff).
alter table anuncios add column if not exists ciudad_id int references ciudades(id);
alter table anuncios add column if not exists audiencia text not null default 'todos'
  check (audiencia in ('todos', 'admins', 'riders'));
create index if not exists idx_anuncios_ciudad on anuncios (ciudad_id) where activo = true;

-- ============================================================
--  Limpieza de auditoría antigua — SE CONSERVAN 6 MESES
-- ------------------------------------------------------------
--  La auditoría son filas de texto muy pequeñas; a diferencia de los
--  archivos adjuntos, guardarla no cuesta espacio real. Aun así, se
--  confirmó una retención de 6 meses: pasado ese tiempo se borra sola,
--  cada noche, sin necesidad de hacer nada manualmente.
-- ============================================================
create or replace function purgar_auditoria_antigua(meses_a_conservar int default 6)
returns int as $$
declare
  borrados int;
begin
  delete from auditoria
  where created_at < now() - (meses_a_conservar || ' months')::interval;
  get diagnostics borrados = row_count;
  return borrados;
end;
$$ language plpgsql security definer;

-- Requiere la extensión pg_cron activada en el proyecto (Supabase
-- Dashboard → Database → Extensions → pg_cron). Si ya la activaste para
-- el borrado de archivos, esto reutiliza la misma extensión.
create extension if not exists pg_cron;

-- Se ejecuta cada noche a las 03:00 (hora del servidor); si ya existía
-- una programación con este nombre, se reemplaza (para poder re-correr
-- este script sin duplicar el cron).
select cron.unschedule('purgar-auditoria-antigua')
where exists (select 1 from cron.job where jobname = 'purgar-auditoria-antigua');

select cron.schedule(
  'purgar-auditoria-antigua',
  '0 3 * * *',
  $$select purgar_auditoria_antigua(6);$$
);

-- Para ver cuántas filas se borrarían hoy sin borrar nada de verdad:
--   select count(*) from auditoria where created_at < now() - interval '6 months';
-- Para forzarlo manualmente ahora mismo (en vez de esperar a la noche):
--   select purgar_auditoria_antigua();

