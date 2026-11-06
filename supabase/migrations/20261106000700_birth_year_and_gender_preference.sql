-- =============================================================================
-- Edad exacta y preferencia de convivencia (decisiones de producto).
--
-- 1. Edad: el perfil pasa del rango de edad al AÑO de nacimiento, y se muestra
--    la edad («29 años»). No se pide la fecha completa: el perfil es público y
--    el año basta para la edad. Hay que tener 18 años o más (trigger, porque un
--    CHECK no puede usar la fecha actual). Los rangos antiguos no se pueden
--    convertir en un año, así que se pierden y cada persona lo rellena de nuevo.
-- 2. Preferencia de convivencia: «solo chicas» / «solo chicos» como campo
--    cerrado (y filtrable) en habitaciones y en «busco». En piso entero no
--    aplica: no se convive con quien alquila.
-- =============================================================================

alter table public.profiles
  add column birth_year smallint constraint profiles_birth_year_range check (birth_year between 1900 and 2100);
comment on column public.profiles.birth_year is 'Año de nacimiento. Se muestra la edad, no el año. Mayor de 18 (trigger).';

create function private.profiles_check_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_year is not null and extract(year from now())::int - new.birth_year < 18 then
    raise exception 'Para usar Convivo tienes que tener 18 años o más' using errcode = 'check_violation';
  end if;
  if new.birth_year is not null and extract(year from now())::int - new.birth_year > 110 then
    raise exception 'Revisa el año de nacimiento' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger profiles_check_age
  before insert or update of birth_year on public.profiles
  for each row execute function private.profiles_check_age();

-- Columnas editables por su dueño: birth_year en lugar de age_range.
revoke update on public.profiles from authenticated;
grant update (display_name, bio, avatar_path, city, occupation, birth_year, languages, habits, roles)
  on public.profiles to authenticated;

-- La anonimización al borrar la cuenta deja de tocar age_range.
create or replace function private.anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('convivo.anonymizing', 'on', true);

  delete from public.interests
   where from_user = p_user
      or listing_id in (select id from public.listings where owner_id = p_user);
  delete from public.messages where sender_id = p_user;

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
         birth_year = null,
         languages = '{}',
         habits = '{}'::jsonb,
         roles = '{}',
         email_verified = false,
         phone_verified = false,
         deleted_at = now()
   where id = p_user;
end;
$$;

alter table public.profiles drop column age_range;
drop type public.age_range;

-- -----------------------------------------------------------------------------
-- Preferencia de convivencia
-- -----------------------------------------------------------------------------
create type public.cohabitation_preference as enum ('any', 'women', 'men');

alter table public.listings
  add column cohabitation public.cohabitation_preference not null default 'any',
  add constraint listings_cohabitation_shared check (kind <> 'flat' or cohabitation = 'any');
comment on column public.listings.cohabitation is
  'Con quién se quiere convivir: cualquiera, solo chicas o solo chicos. Solo habitaciones y «busco».';
