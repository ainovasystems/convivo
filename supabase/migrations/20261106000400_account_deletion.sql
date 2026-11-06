-- =============================================================================
-- Borrado de cuenta con anonimización (Fase 6, resuelve la decisión 19).
--
-- Antes, borrar un usuario de auth.users arrastraba en cascada su perfil y,
-- con él, sus reseñas escritas y recibidas: se perdía reputación ajena y se
-- falseaban las medias. Ahora:
--   - El perfil NO se borra: queda como «Usuario eliminado», sin datos
--     personales (deleted_at marca la cuenta como eliminada).
--   - Las reseñas escritas y recibidas se conservan tal cual (siguen siendo
--     inmutables) y las estadísticas no cambian. El autor aparece como
--     «Usuario eliminado».
--   - Se borra el resto: conversaciones (intereses y mensajes), avisos,
--     bloqueos, lecturas, señales anti-abuso y registros de avisos.
--   - Anuncios: los que no tienen estancias se borran. Los que sí (porque hay
--     reseñas que los citan) se cierran, sin dirección, fotos ni descripción.
--   - Las denuncias hechas por la persona se conservan como registro de
--     moderación, sin su texto libre.
-- Las fotos y el avatar de Storage los borra la app antes de llamar a
-- delete_my_account(), porque Storage no permite borrar ficheros por SQL.
-- =============================================================================

alter table public.profiles add column deleted_at timestamptz;
comment on column public.profiles.deleted_at is 'Fecha de borrado de la cuenta. El perfil queda anonimizado como «Usuario eliminado».';

-- El perfil ya no cuelga en cascada de auth.users: se anonimiza en su lugar.
alter table public.profiles drop constraint profiles_id_fkey;

-- El guardián de anuncios permite cerrar uno ya cerrado solo durante la
-- anonimización (variable de sesión local a la transacción).
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
    if old.status = 'closed' and coalesce(current_setting('convivo.anonymizing', true), '') <> 'on' then
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

create function private.anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('convivo.anonymizing', 'on', true);

  -- Conversaciones en las que participa (como interesado o como anunciante).
  delete from public.interests
   where from_user = p_user
      or listing_id in (select id from public.listings where owner_id = p_user);
  delete from public.messages where sender_id = p_user;

  -- Anuncios sin estancias: fuera. Con estancias: cerrados y vaciados.
  delete from public.listings l
   where l.owner_id = p_user
     and not exists (select 1 from public.stays s where s.listing_id = l.id);
  delete from public.listing_addresses
   where listing_id in (select id from public.listings where owner_id = p_user);
  update public.listings
     set status = 'closed',
         description = 'Anuncio cerrado: la cuenta que lo publicó se ha eliminado.',
         photos = '{}'
   where owner_id = p_user;

  delete from public.blocks where blocker_id = p_user or blocked_id = p_user;
  delete from public.conversation_reads where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.review_window_notices where user_id = p_user;
  delete from public.user_signals where user_id = p_user;
  delete from public.stay_participants s
   where s.user_id = p_user and s.confirmed_at is null;
  update public.reports set details = null where reporter_id = p_user;

  update public.profiles
     set display_name = 'Usuario eliminado',
         bio = null,
         avatar_path = null,
         city = null,
         occupation = null,
         age_range = null,
         languages = '{}',
         habits = '{}'::jsonb,
         roles = '{}',
         email_verified = false,
         phone_verified = false,
         deleted_at = now()
   where id = p_user;
end;
$$;

create function private.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.anonymize_user(old.id);
  return old;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function private.handle_user_deleted();

-- El propio usuario borra su cuenta escribiendo BORRAR. Borra la fila de
-- auth.users (y con ella sus sesiones); el trigger anterior anonimiza.
create function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Tienes que iniciar sesión' using errcode = 'insufficient_privilege';
  end if;
  if p_confirm is distinct from 'BORRAR' then
    raise exception 'Para confirmar, escribe BORRAR en mayúsculas' using errcode = 'check_violation';
  end if;
  delete from auth.users where id = v_user;
end;
$$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
