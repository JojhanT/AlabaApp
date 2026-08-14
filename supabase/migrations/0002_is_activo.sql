-- ============================================================
-- Activación de cuentas: los usuarios registrados quedan inactivos
-- hasta que un administrador los active.
-- Ejecuta esto en SQL Editor (Supabase) una sola vez.
-- ============================================================

alter table public.profiles add column if not exists is_activo boolean not null default false;

-- Los usuarios existentes quedan activos (no bloquear a nadie).
update public.profiles set is_activo = true;
