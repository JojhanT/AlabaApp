-- ============================================================
-- Repertorio por día: el líder o admin puede escribir el
-- repertorio de cada día de la programación.
-- ============================================================
create table if not exists public.repertorio_dia (
  semana_inicio date not null,
  dia_semana text not null check (dia_semana in ('Martes', 'Jueves', 'Sabado', 'Domingo')),
  repertorio text not null default '',
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (semana_inicio, dia_semana)
);

alter table public.repertorio_dia enable row level security;

-- Todos los autenticados pueden leer y escribir el repertorio
create policy "repertorio_auth_all" on public.repertorio_dia
  for all using (auth.role() = 'authenticated');

-- ============================================================
-- Trigger para actualizar updated_at automáticamente
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger repertorio_dia_updated_at
  before update on public.repertorio_dia
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS para programaciones: permitir UPDATE solo a admin
-- (para cambiar tipo líder/apoyo manualmente)
-- ============================================================
create policy "programaciones_admin_update" on public.programaciones
  for update using (public.is_admin());
