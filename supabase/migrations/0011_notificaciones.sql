-- ============================================================
-- Migración 0011: Notificaciones personalizadas
-- Permite a admins enviar notificaciones push/locales a
-- todos, por rol, por día programado o a personas específicas
-- ============================================================

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cuerpo text not null,
  creado_por uuid not null references public.profiles(id) on delete cascade,
  destinatarios uuid[] , -- null = todos, array de profile_id
  filtros jsonb default '{}'::jsonb, -- {roles:[1,2], dia:"Martes"} para auditoría
  created_at timestamptz not null default now()
);

alter table public.notificaciones enable row level security;

drop policy if exists "notificaciones_select_own" on public.notificaciones;
create policy "notificaciones_select_own" on public.notificaciones
  for select using (
    auth.role() = 'authenticated' AND (
      destinatarios IS NULL OR auth.uid() = ANY(destinatarios)
    )
  );

drop policy if exists "notificaciones_admin_insert" on public.notificaciones;
create policy "notificaciones_admin_insert" on public.notificaciones
  for insert with check (public.is_admin());

drop policy if exists "notificaciones_admin_all" on public.notificaciones;
create policy "notificaciones_admin_all" on public.notificaciones
  for all using (public.is_admin());

create index if not exists idx_notificaciones_created_at on public.notificaciones (created_at desc);
create index if not exists idx_notificaciones_destinatarios on public.notificaciones using gin (destinatarios);

-- Habilitar Realtime para notificaciones (no falla si ya está)
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN NULL;
  END;
END $$;
