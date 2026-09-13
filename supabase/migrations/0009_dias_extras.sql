-- ============================================================
-- Migración 0009: Permitir días extra en programaciones y repertorios
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Quitar CHECK constraint en programaciones.dia_semana
alter table public.programaciones drop constraint if exists programaciones_dia_semana_check;

-- Quitar CHECK constraint en repertorio_dia.dia_semana (antes mal nombrada como repertorios)
alter table public.repertorio_dia drop constraint if exists repertorio_dia_dia_semana_check;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='repertorios') THEN
    ALTER TABLE public.repertorios DROP CONSTRAINT IF EXISTS repertorios_dia_semana_check;
  END IF;
END $$;
