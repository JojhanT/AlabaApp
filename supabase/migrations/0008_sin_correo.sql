-- ============================================================
-- Eliminar correo definitivamente.
--
-- El email ya no se usa en la app: la cuenta de cada usuario es
-- SIEMPRE CODIGO@iglesia.local (login por código). Se eliminan:
--   - La columna correo de public.profiles
--   - La función correo_de_perfil (migración 0004) y su fallback en el login
--   - La referencia a correo en el trigger de registro (0003)
--
-- Ejecuta este archivo una sola vez en el SQL Editor.
-- ============================================================

-- Drop de la función (antes de quitar la columna que usa)
drop function if exists public.correo_de_perfil(text);

-- Quitar la columna
alter table public.profiles drop column if exists correo;

-- ============================================================
-- Actualizar el trigger de registro: ya no inserta correo
-- ============================================================
create or replace function public.on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := new.raw_user_meta_data;
  v_codigo text;
begin
  v_codigo := trim(coalesce(meta->>'codigo', ''));

  -- Usuarios creados por el admin desde el dashboard no traen metadata: no crear perfil.
  if v_codigo = '' then
    return new;
  end if;

  -- El código (cédula) es único: evita registros duplicados (aborta el signUp).
  if exists (select 1 from public.profiles where codigo = v_codigo) then
    raise exception 'Ya existe un usuario con ese código';
  end if;

  insert into public.profiles (id, codigo, nombre, celular, is_activo, is_admin)
  values (
    new.id,
    v_codigo,
    trim(coalesce(meta->>'nombre', '')),
    nullif(trim(coalesce(meta->>'celular', '')), ''),
    false,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
