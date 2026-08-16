-- ============================================================
-- Registro público desde el frontend (Supabase Auth directo).
-- Al crear un usuario por signUp, se inserta su perfil en public.profiles
-- con la cuenta INACTIVA (is_activo = false) hasta que un admin la active.
-- ============================================================
--
-- Requisitos en Supabase (Authentication → Sign In / Up):
--   1. "Allow new users to sign up" = ON
--   2. Proveedor Email: "Confirm email" = OFF (necesario para los usuarios que NO
--      escriben email: su cuenta queda como codigo@iglesia.local y no puede recibir correos).
--
-- Ejecuta este archivo una sola vez en el SQL Editor.

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

  insert into public.profiles (id, codigo, nombre, celular, correo, is_activo, is_admin)
  values (
    new.id,
    v_codigo,
    trim(coalesce(meta->>'nombre', '')),
    nullif(trim(coalesce(meta->>'celular', '')), ''),
    nullif(trim(coalesce(meta->>'correo', '')), ''),
    false,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.on_auth_user_created();
