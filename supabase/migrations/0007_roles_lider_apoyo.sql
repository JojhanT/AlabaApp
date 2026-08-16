-- ============================================================
-- Roles Líder y Apoyo; quitar columna tipo de programaciones.
--
-- El modelo anterior usaba tipo = 'lider' | 'apoyo' como etiqueta
-- sobre el rol Cantante. Ahora Líder y Apoyo son roles propios:
--   - Líder: puede liderar Y cantar de apoyo.
--   - Apoyo: cualquiera que cante o ayude (no todo apoyo puede liderar).
--   - Piano, Guitarra, Bateria, Saxofonista: instrumentistas (1 c/u).
--   - Cantante (id=1) se eliminó; no es un rol en el motor.
--
-- Ejecuta este archivo una sola vez en el SQL Editor.
-- ============================================================

-- ============================================================
-- RLS en tabla roles (lectura para todos los autenticados)
-- ============================================================
alter table public.roles enable row level security;

create policy "roles_select_auth" on public.roles
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- Roles válidos (sin Cantante)
-- ============================================================
insert into public.roles (id, nombre) values
  (2, 'Piano'),
  (3, 'Guitarra'),
  (4, 'Bateria'),
  (5, 'Saxofonista'),
  (6, 'Lider'),
  (7, 'Apoyo')
on conflict (id) do update set nombre = excluded.nombre;

-- ============================================================
-- Quitar columna tipo y su restricción unique
-- ============================================================
alter table public.programaciones drop constraint if exists programaciones_semana_inicio_dia_semana_rol_id_tipo_key;
alter table public.programaciones drop column if exists tipo;

-- ============================================================
-- Quitar política de update (ya no se cambia tipo manualmente)
-- ============================================================
drop policy if exists programaciones_admin_update on public.programaciones;
