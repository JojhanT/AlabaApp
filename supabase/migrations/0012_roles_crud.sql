-- ============================================================
-- Migración 0012: CRUD de roles para admin
-- Permite a admins crear/editar/eliminar roles
-- ============================================================

-- Asegurar RLS habilitado (ya lo está desde 0007, pero por si acaso)
alter table public.roles enable row level security;

drop policy if exists "roles_admin_insert" on public.roles;
create policy "roles_admin_insert" on public.roles
  for insert with check (public.is_admin());

drop policy if exists "roles_admin_update" on public.roles;
create policy "roles_admin_update" on public.roles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "roles_admin_delete" on public.roles;
create policy "roles_admin_delete" on public.roles
  for delete using (public.is_admin());
