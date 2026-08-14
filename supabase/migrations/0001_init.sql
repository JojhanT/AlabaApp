-- ============================================================
-- Roles (Cantante, Piano, Guitarra, Bateria, Saxofonista)
-- ============================================================
create table if not exists public.roles (
  id smallint primary key,
  nombre text not null unique
);

insert into public.roles (id, nombre) values
  (1, 'Cantante'),
  (2, 'Piano'),
  (3, 'Guitarra'),
  (4, 'Bateria'),
  (5, 'Saxofonista')
on conflict (id) do nothing;

-- ============================================================
-- Perfiles (usuarios). El id referencia a auth.users
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  codigo text not null unique,
  nombre text not null,
  celular text,
  correo text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Roles asignados a cada usuario
-- ============================================================
create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rol_id smallint not null references public.roles (id) on delete cascade,
  primary key (profile_id, rol_id)
);

-- ============================================================
-- Votación de disponibilidad semanal
-- (semana_inicio = lunes de la semana de votación)
-- ============================================================
create table if not exists public.votos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  semana_inicio date not null,
  dia_semana text not null check (dia_semana in ('Martes', 'Jueves', 'Sabado', 'Domingo')),
  created_at timestamptz not null default now(),
  unique (profile_id, semana_inicio, dia_semana)
);

-- ============================================================
-- Programaciones generadas
-- ============================================================
create table if not exists public.programaciones (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null,
  fecha date not null,
  dia_semana text not null check (dia_semana in ('Martes', 'Jueves', 'Sabado', 'Domingo')),
  rol_id smallint not null references public.roles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tipo text check (tipo in ('lider', 'apoyo')),
  created_at timestamptz not null default now(),
  unique (semana_inicio, dia_semana, rol_id, profile_id),
  unique (semana_inicio, dia_semana, rol_id, tipo)
);

create index if not exists idx_programaciones_semana on public.programaciones (semana_inicio, dia_semana);
create index if not exists idx_votos_semana on public.votos (semana_inicio);
create index if not exists idx_votos_perfil on public.votos (profile_id);

-- ============================================================
-- Función auxiliar is_admin (security definer evita recursión RLS)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin)
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.votos enable row level security;
alter table public.programaciones enable row level security;

-- profiles: todos pueden leer, cada quien edita su fila, admin gestiona
create policy "profiles_select_auth" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- profile_roles: todos pueden leer, solo admin escribe
create policy "profile_roles_select_auth" on public.profile_roles
  for select using (auth.role() = 'authenticated');

create policy "profile_roles_admin_all" on public.profile_roles
  for all using (public.is_admin());

-- votos: todos pueden leer, cada quien vota/edita/borra los suyos
create policy "votos_select_auth" on public.votos
  for select using (auth.role() = 'authenticated');

create policy "votos_insert_own" on public.votos
  for insert with check (profile_id = auth.uid());

create policy "votos_update_own" on public.votos
  for update using (profile_id = auth.uid());

create policy "votos_delete_own" on public.votos
  for delete using (profile_id = auth.uid());

-- programaciones: todos pueden leer, solo admin genera/borra
create policy "programaciones_select_auth" on public.programaciones
  for select using (auth.role() = 'authenticated');

create policy "programaciones_admin_insert" on public.programaciones
  for insert with check (public.is_admin());

create policy "programaciones_admin_delete" on public.programaciones
  for delete using (public.is_admin());
