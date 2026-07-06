-- ============================================================
--  CLOSER LOGISTICS — MEJORAS, PASO 2 de 2
-- ============================================================
--  Ejecuta esto DESPUÉS de haber corrido schema_mejoras_1.sql
--  (en una consulta aparte, no pegada al mismo Run).
-- ============================================================

-- ---------- Incidencias: motivo de rechazo en columna propia ----------
-- Antes se guardaba en "observaciones", pisando lo que había escrito el
-- rider. Ahora vive aparte y el rider puede verlo sin perder su texto.
alter table incidencias add column if not exists motivo_rechazo text;

-- ---------- Catálogo de motivos de AUSENCIA (distinto al de incidencias) ----------
create table if not exists motivos_ausencia (
  id serial primary key,
  nombre text not null unique,
  activo boolean not null default true
);

insert into motivos_ausencia (nombre) values
  ('Enfermedad'), ('Cita médica'), ('Asunto personal'),
  ('Cuidado de familiar'), ('Otro')
on conflict (nombre) do nothing;

alter table motivos_ausencia enable row level security;
drop policy if exists "motivos_ausencia_lectura" on motivos_ausencia;
create policy "motivos_ausencia_lectura" on motivos_ausencia for select using (true);
drop policy if exists "motivos_ausencia_escritura" on motivos_ausencia;
create policy "motivos_ausencia_escritura" on motivos_ausencia for all using (is_super_admin());

-- ---------- Ausencias: motivo obligatorio + motivo de rechazo ----------
alter table ausencias add column if not exists motivo_id int references motivos_ausencia(id);
alter table ausencias add column if not exists motivo_rechazo text;

-- Si ya hay filas sin motivo (de antes de este cambio), las dejamos en "Otro"
-- para poder exigir NOT NULL sin romper datos existentes.
update ausencias set motivo_id = (select id from motivos_ausencia where nombre = 'Otro')
where motivo_id is null;

alter table ausencias alter column motivo_id set not null;

-- ---------- Ausencias: migrar "revisada" a "aprobada" ----------
-- (requiere que ya hayas ejecutado schema_mejoras_1.sql antes)
update ausencias set estado = 'aprobada' where estado = 'revisada';

-- ---------- Tiempo real también sobre ausencias ----------
-- Las notificaciones del panel ahora avisan de ausencias nuevas, no solo
-- de incidencias.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ausencias'
  ) then
    alter publication supabase_realtime add table public.ausencias;
  end if;
end $$;
