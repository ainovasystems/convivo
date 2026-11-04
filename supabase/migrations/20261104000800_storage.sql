-- =============================================================================
-- 08 · Storage: bucket listing-photos
-- =============================================================================
-- Lectura pública. Escritura solo del dueño, dentro de su carpeta {user_id}/.
-- Ruta esperada: {user_id}/{listing_id}/{nombre}.webp
-- Nota: las fotos de un borrador también son legibles por URL pública si se
-- conoce la ruta (no se listan en ningún sitio); no subas nada sensible.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy listing_photos_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-photos');

create policy listing_photos_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy listing_photos_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy listing_photos_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
