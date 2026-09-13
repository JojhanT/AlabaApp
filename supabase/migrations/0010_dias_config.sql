-- ============================================================
-- Migración 0010: Días configurables por semana
-- Permite eliminar días por defecto, agregar días especiales,
-- varias programaciones el mismo día (via nombre distinto) y
-- que la encuesta sea dinámica según los días habilitados.
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── Tabla para guardar qué días están habilitados cada semana ──
create table if not exists public.dias_config (
  semana_inicio date not null,
  dia_semana text not null,
  fecha date not null,
  created_at timestamptz not null default now(),
  primary key (semana_inicio, dia_semana)
);

alter table public.dias_config enable row level security;

drop policy if exists "dias_config_select_auth" on public.dias_config;
create policy "dias_config_select_auth" on public.dias_config
  for select using (auth.role() = 'authenticated');

drop policy if exists "dias_config_admin_all" on public.dias_config;
create policy "dias_config_admin_all" on public.dias_config
  for all using (public.is_admin());

create index if not exists idx_dias_config_semana on public.dias_config (semana_inicio);

-- ── Quitar CHECK constraints que limitan a 4 días fijos ──
-- votos (sigue limitado, lo liberamos)
alter table public.votos drop constraint if exists votos_dia_semana_check;

-- repertorio_dia: el nombre de la restricción puede variar
alter table public.repertorio_dia drop constraint if exists repertorio_dia_dia_semana_check;
alter table public.repertorio_dia drop constraint if exists repertorio_dia_dia_semana_check1;
-- por si la migración 0009 apuntó a tabla equivocada (repertorios nunca existió, evitar 42P01)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='repertorios') THEN
    ALTER TABLE public.repertorios DROP CONSTRAINT IF EXISTS repertorios_dia_semana_check;
  END IF;
END $$;

-- programaciones ya fue liberada en 0009
alter table public.programaciones drop constraint if exists programaciones_dia_semana_check;

-- ── Repertorio: permitir cualquier dia_semana (ya sin check) ──
-- no hace falta más
