-- =============================================================================
-- Auditoría de seguridad (Fase 6) · dos fugas encontradas en los anuncios
--
-- 1. La máquina de estados de un anuncio solo vivía en la app. Llamando a la
--    API directamente, el dueño podía:
--      - devolver un anuncio publicado a 'draft' y después borrarlo, lo que
--        arrastra en cascada los intereses y mensajes de otras personas;
--      - reactivar un anuncio 'closed', que debe ser definitivo.
--    Transiciones válidas: draft → draft|active|paused, active ↔ paused,
--    active|paused → closed. Un anuncio cerrado ya no se modifica.
--
-- 2. La columna photos admitía cualquier texto: rutas de fotos de otro usuario
--    o URLs externas (por ejemplo, un píxel de seguimiento). Ahora cada foto
--    tiene que estar en la carpeta {owner_id}/{listing_id}/ del bucket.
-- =============================================================================

create or replace function private.listings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id then
      raise exception 'No se puede cambiar el propietario de un anuncio' using errcode = 'check_violation';
    end if;
    if new.kind <> old.kind and old.status <> 'draft' then
      raise exception 'Solo se puede cambiar el tipo de un anuncio en borrador' using errcode = 'check_violation';
    end if;
    if old.status = 'closed' then
      raise exception 'Un anuncio cerrado es definitivo: duplícalo para volver a publicarlo' using errcode = 'check_violation';
    end if;
    if new.status = 'draft' and old.status <> 'draft' then
      raise exception 'Un anuncio publicado no puede volver a borrador' using errcode = 'check_violation';
    end if;
    new.created_at := old.created_at;
    new.published_at := old.published_at;
  end if;

  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create function private.valid_listing_photos(p_owner uuid, p_listing uuid, p_photos text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p ~ ('^' || p_owner::text || '/' || p_listing::text || '/[A-Za-z0-9._-]{1,100}$')), true)
    from unnest(p_photos) as p;
$$;
grant execute on function private.valid_listing_photos(uuid, uuid, text[]) to authenticated, service_role;

alter table public.listings
  add constraint listings_photos_own_folder check (private.valid_listing_photos(owner_id, id, photos));
