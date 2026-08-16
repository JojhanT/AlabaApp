-- ============================================================
-- Login por código con cuentas registradas con email propio.
-- Si el usuario se registró escribiendo su email, su cuenta usa
-- ESE email y no codigo@iglesia.local. Como el login se hace con
-- el código (sin estar autenticado), una función SECURITY DEFINER
-- devuelve el email guardado en el perfil para ese código.
-- ============================================================
--
-- Ejecuta este archivo una sola vez en el SQL Editor.

create or replace function public.correo_de_perfil(p_codigo text)
returns text
language sql
security definer
set search_path = public
as $$
  select correo
  from public.profiles
  where codigo = trim(p_codigo)
  limit 1;
$$;

revoke all on function public.correo_de_perfil(text) from public;

grant execute on function public.correo_de_perfil(text) to anon, authenticated;
