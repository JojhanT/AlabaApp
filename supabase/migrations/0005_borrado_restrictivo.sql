-- ============================================================
-- Borrado restrictivo: borrar un usuario ya NO elimina sus votos
-- ni (lo importante) la programación generada.
--
-- Antes usaban ON DELETE CASCADE: al borrar el perfil se borraban
-- sus filas en votos y programaciones.
-- Ahora, si el perfil tiene votos o aparece en la programación,
-- el borrado falla con un error de clave foránea. Primero hay que
-- regenerar/limpiar la programación.
--
-- (profile_roles sigue en cascade: los roles pertenecen al usuario.)
--
-- Ejecuta este archivo una sola vez en el SQL Editor.
-- ============================================================

alter table public.programaciones
  drop constraint programaciones_profile_id_fkey,
  add constraint programaciones_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete restrict;

alter table public.votos
  drop constraint votos_profile_id_fkey,
  add constraint votos_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete restrict;
