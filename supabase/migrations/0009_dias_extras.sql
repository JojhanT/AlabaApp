-- ============================================================
-- Migración 0009: Permitir días extra en programaciones y repertorios
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Quitar CHECK constraint en programaciones.dia_semana
alter table public.programaciones drop constraint if exists programaciones_dia_semana_check;

-- Quitar CHECK constraint en repertorios.dia_semana
alter table public.repertorios drop constraint if exists repertorios_dia_semana_check;
