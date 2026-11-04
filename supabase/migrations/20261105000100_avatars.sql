-- =============================================================================
-- 09 · Avatares
-- =============================================================================
-- Guardamos la RUTA dentro del bucket (no una URL arbitraria): así nadie puede
-- poner como avatar una imagen externa (p. ej. un píxel de seguimiento) y la
-- ruta queda atada a la carpeta del propio usuario.

alter table public.profiles rename column avatar_url to avatar_path;
alter table public.profiles drop constraint profiles_avatar_url_len;
alter table public.profiles add constraint profiles_avatar_path_own_folder check (
  avatar_path is null
  or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,100}$')
);

revoke update on public.profiles from authenticated;
grant update (display_name, bio, avatar_path, city, occupation, age_range, languages, habits, roles)
  on public.profiles to authenticated;

-- Bucket público con límite de 2 MB y solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update_own_folder on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
