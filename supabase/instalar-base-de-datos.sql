-- =============================================================================
-- CONVIVO · Instalación completa de la base de datos (proyecto NUEVO de Supabase)
-- Generado con `npm run db:bundle` a partir de supabase/migrations/. No lo edites a mano.
-- Pégalo entero en Supabase → SQL Editor → New query → Run. Solo una vez.
-- =============================================================================

-- >>> 20261104000100_base.sql
-- =============================================================================
-- 01 · Base: esquema privado, enums, utilidades y administradores
-- =============================================================================
-- Convención:
--   * public  -> tablas y funciones RPC expuestas por la API de Supabase.
--   * private -> funciones auxiliares (triggers, comprobaciones de RLS). Este
--                esquema NO se expone por la API REST, así que nadie puede
--                llamarlas directamente aunque tengan permiso de EXECUTE (que
--                necesitan cuando se usan dentro de una política RLS).
--   * Toda función SECURITY DEFINER fija `search_path = ''` y cualifica
--     todos los nombres (public.x, auth.uid()) para evitar secuestros de
--     search_path.

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- Postgres concede EXECUTE a PUBLIC por defecto en funciones nuevas: lo
-- quitamos en ambos esquemas y concedemos explícitamente lo que haga falta.
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.listing_kind as enum ('room', 'flat', 'seeking');
create type public.listing_status as enum ('draft', 'active', 'paused', 'closed');
create type public.interest_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type public.stay_status as enum ('proposed', 'active', 'ended', 'cancelled');
create type public.user_role as enum ('tenant', 'landlord', 'flatmate');
create type public.age_range as enum ('18-24', '25-34', '35-44', '45-54', '55-64', '65+');
create type public.review_subject_type as enum ('listing', 'user');
create type public.review_relationship as enum (
  'tenant_to_listing',    -- inquilino -> inmueble
  'tenant_to_landlord',   -- inquilino -> propietario
  'landlord_to_tenant',   -- propietario -> inquilino
  'flatmate_to_flatmate'  -- compañero <-> compañero
);
create type public.report_reason as enum (
  'spam', 'fraud', 'offensive', 'discrimination', 'personal_data', 'false_information', 'other'
);
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Administradores
-- -----------------------------------------------------------------------------
-- Se da de alta a mano desde el editor SQL:
--   insert into public.admin_users (user_id) values ('<uuid>');
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- Sin políticas y sin privilegios: solo se consulta mediante private.is_admin().
revoke all on public.admin_users from anon, authenticated;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
grant execute on function private.is_admin() to anon, authenticated, service_role;

-- RPC para que la app sepa si mostrar el panel de administración.
create function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;
revoke execute on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;


-- >>> 20261104000200_profiles.sql
-- =============================================================================
-- 02 · Perfiles y bloqueos
-- =============================================================================

-- Hábitos de convivencia: lista CERRADA de claves. No se admite ninguna clave
-- libre, para que nadie pueda guardar ni filtrar por origen, religión, etc.
--   smoker      boolean
--   pets        boolean
--   schedule    'early' | 'standard' | 'night' | 'shifts'
--   cleanliness 1..5
--   noise       1..5   (1 = muy tranquilo, 5 = muy animado)
--   guests      'rarely' | 'sometimes' | 'often'
create function private.valid_habits(h jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if h is null or jsonb_typeof(h) <> 'object' then
    return false;
  end if;
  if (h - array['smoker', 'pets', 'schedule', 'cleanliness', 'noise', 'guests']) <> '{}'::jsonb then
    return false;
  end if;
  if h ? 'smoker' and jsonb_typeof(h -> 'smoker') <> 'boolean' then return false; end if;
  if h ? 'pets' and jsonb_typeof(h -> 'pets') <> 'boolean' then return false; end if;
  if h ? 'schedule' and coalesce(h ->> 'schedule', '') not in ('early', 'standard', 'night', 'shifts') then
    return false;
  end if;
  if h ? 'guests' and coalesce(h ->> 'guests', '') not in ('rarely', 'sometimes', 'often') then
    return false;
  end if;
  if h ? 'cleanliness' and not private.is_score(h -> 'cleanliness') then return false; end if;
  if h ? 'noise' and not private.is_score(h -> 'noise') then return false; end if;
  return true;
end;
$$;

-- Entero JSON entre 1 y 5.
create function private.is_score(v jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if v is null or jsonb_typeof(v) <> 'number' then
    return false;
  end if;
  return (v::text)::numeric in (1, 2, 3, 4, 5);
end;
$$;

grant execute on function private.valid_habits(jsonb), private.is_score(jsonb)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_len check (char_length(btrim(display_name)) between 2 and 60),
  bio text constraint profiles_bio_len check (char_length(bio) <= 1000),
  avatar_url text constraint profiles_avatar_url_len check (char_length(avatar_url) <= 500),
  city text constraint profiles_city_len check (char_length(city) <= 80),
  occupation text constraint profiles_occupation_len check (char_length(occupation) <= 80),
  age_range public.age_range,
  languages text[] not null default '{}'
    constraint profiles_languages_max check (cardinality(languages) <= 10),
  habits jsonb not null default '{}'::jsonb
    constraint profiles_habits_valid check (private.valid_habits(habits)),
  roles public.user_role[] not null default '{}',
  email_verified boolean not null default false,
  -- TODO(Prompt 2+): verificación de teléfono. El número irá en una tabla
  -- privada aparte, nunca en profiles (que es de lectura pública).
  phone_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil público de cada usuario. Todo lo que hay aquí lo puede leer cualquiera: no guardes datos privados.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

-- Privilegios mínimos: lectura para todos, actualización solo de columnas
-- editables. Insert y delete solo los hace el sistema (trigger / cascada).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_url, city, occupation, age_range, languages, habits, roles)
  on public.profiles to authenticated;

create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Creación automática del perfil al registrarse
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
begin
  if char_length(v_name) < 2 then
    v_name := 'Nuevo usuario';
  end if;

  insert into public.profiles (id, display_name, email_verified)
  values (new.id, v_name, new.email_confirmed_at is not null);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- email_verified se sincroniza desde Supabase Auth; el usuario no puede tocarlo.
create function private.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email_verified = new.email_confirmed_at is not null
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_email_confirmed();

-- -----------------------------------------------------------------------------
-- blocks: A bloquea a B
-- -----------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- Solo ves a quién has bloqueado tú (no quién te ha bloqueado).
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ¿Hay bloqueo en cualquier dirección? SECURITY DEFINER porque el usuario no
-- puede ver los bloqueos que otros le han hecho a él.
create function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated, service_role;


-- >>> 20261104000300_listings.sql
-- =============================================================================
-- 03 · Anuncios y dirección exacta
-- =============================================================================

-- Reglas de la vivienda: lista cerrada de claves booleanas.
create function private.valid_listing_rules(r jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  if r is null or jsonb_typeof(r) <> 'object' then
    return false;
  end if;
  if (r - array['pets', 'smoking', 'visitors', 'couples']) <> '{}'::jsonb then
    return false;
  end if;
  for k in select jsonb_object_keys(r) loop
    if jsonb_typeof(r -> k) <> 'boolean' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
grant execute on function private.valid_listing_rules(jsonb) to anon, authenticated, service_role;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind public.listing_kind not null,
  status public.listing_status not null default 'draft',

  title text not null default '' constraint listings_title_len check (char_length(title) <= 120),
  description text not null default '' constraint listings_description_len check (char_length(description) <= 5000),
  city text constraint listings_city_len check (char_length(city) <= 80),
  province text constraint listings_province_len check (char_length(province) <= 80),
  neighborhood text constraint listings_neighborhood_len check (char_length(neighborhood) <= 120),

  -- room / flat (precios en euros enteros)
  monthly_rent integer constraint listings_rent_range check (monthly_rent between 50 and 20000),
  deposit integer constraint listings_deposit_range check (deposit between 0 and 100000),
  available_from date,
  min_stay_months smallint constraint listings_min_stay_range check (min_stay_months between 1 and 60),
  bills_included boolean,
  furnished boolean,
  rules jsonb not null default '{}'::jsonb
    constraint listings_rules_valid check (private.valid_listing_rules(rules)),
  size_m2 integer constraint listings_size_range check (size_m2 between 5 and 2000),
  bedrooms smallint constraint listings_bedrooms_range check (bedrooms between 0 and 50),
  bathrooms smallint constraint listings_bathrooms_range check (bathrooms between 0 and 20),
  current_flatmates smallint constraint listings_flatmates_range check (current_flatmates between 0 and 20),

  -- seeking
  max_budget integer constraint listings_budget_range check (max_budget between 50 and 20000),
  zones text[] not null default '{}' constraint listings_zones_max check (cardinality(zones) <= 10),
  move_in_date date,

  -- Rutas dentro del bucket listing-photos ({owner_id}/...). Máximo 8.
  photos text[] not null default '{}' constraint listings_photos_max check (cardinality(photos) <= 8),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  -- Campos que NO pueden existir según el tipo (siempre, también en borrador).
  constraint listings_kind_exclusive_fields check (
    case kind
      when 'seeking' then
        monthly_rent is null and deposit is null and available_from is null
        and size_m2 is null and bedrooms is null and bathrooms is null
        and current_flatmates is null
      when 'flat' then
        max_budget is null and cardinality(zones) = 0 and move_in_date is null
        and current_flatmates is null
      else -- room
        max_budget is null and cardinality(zones) = 0 and move_in_date is null
    end
  ),

  -- Campos obligatorios para publicar. Los borradores pueden estar a medias
  -- (autoguardado del asistente de publicación).
  constraint listings_required_when_published check (
    status = 'draft'
    or (
      char_length(btrim(title)) >= 10
      and char_length(btrim(description)) >= 30
      and city is not null and province is not null
      and case kind
        when 'seeking' then
          max_budget is not null and cardinality(zones) >= 1 and move_in_date is not null
        else
          monthly_rent is not null and available_from is not null
      end
    )
  )
);

comment on column public.listings.photos is 'Rutas en el bucket listing-photos, en orden de presentación.';

-- Índices para la búsqueda pública (solo anuncios activos).
create index listings_active_search_idx on public.listings (kind, city, monthly_rent) where status = 'active';
create index listings_active_province_idx on public.listings (province) where status = 'active';
create index listings_active_available_idx on public.listings (available_from) where status = 'active';
create index listings_active_created_idx on public.listings (created_at desc) where status = 'active';
create index listings_active_budget_idx on public.listings (kind, city, max_budget) where status = 'active' and kind = 'seeking';
create index listings_owner_idx on public.listings (owner_id);

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function private.set_updated_at();

-- Invariantes: el dueño no cambia; el tipo solo cambia en borrador; fecha de
-- primera publicación.
create function private.listings_guard()
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
    new.created_at := old.created_at;
    new.published_at := old.published_at;
  end if;

  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_guard
  before insert or update on public.listings
  for each row execute function private.listings_guard();

alter table public.listings enable row level security;
revoke all on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert, update, delete on public.listings to authenticated;

create policy listings_select_active on public.listings
  for select to anon, authenticated
  using (status = 'active');

create policy listings_select_own on public.listings
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy listings_select_admin on public.listings
  for select to authenticated
  using ((select private.is_admin()));

create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy listings_update_own on public.listings
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Solo se borran borradores. Lo publicado se cierra (status = 'closed') para
-- no romper estancias ni reseñas.
create policy listings_delete_own_draft on public.listings
  for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- -----------------------------------------------------------------------------
-- Dirección exacta (tabla aparte: RLS filtra filas, no columnas)
-- -----------------------------------------------------------------------------
create table public.listing_addresses (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  address_line text not null constraint listing_addresses_line_len check (char_length(btrim(address_line)) between 3 and 200),
  floor_door text constraint listing_addresses_floor_len check (char_length(floor_door) <= 40),
  postal_code text constraint listing_addresses_postal_code check (postal_code ~ '^[0-9]{5}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger listing_addresses_set_updated_at
  before update on public.listing_addresses
  for each row execute function private.set_updated_at();

alter table public.listing_addresses enable row level security;
revoke all on public.listing_addresses from anon, authenticated;
grant select, insert, update, delete on public.listing_addresses to authenticated;

create function private.owns_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listings
     where id = p_listing_id and owner_id = (select auth.uid())
  );
$$;
grant execute on function private.owns_listing(uuid) to authenticated, service_role;

-- La política de lectura para interesados aceptados se crea en la migración
-- de interests (necesita esa tabla).
create policy listing_addresses_select_owner on public.listing_addresses
  for select to authenticated
  using ((select private.owns_listing(listing_id)));

create policy listing_addresses_insert_owner on public.listing_addresses
  for insert to authenticated
  with check ((select private.owns_listing(listing_id)));

create policy listing_addresses_update_owner on public.listing_addresses
  for update to authenticated
  using ((select private.owns_listing(listing_id)))
  with check ((select private.owns_listing(listing_id)));

create policy listing_addresses_delete_owner on public.listing_addresses
  for delete to authenticated
  using ((select private.owns_listing(listing_id)));


-- >>> 20261104000400_interests_messages.sql
-- =============================================================================
-- 04 · Intereses ("me interesa") y mensajes
-- =============================================================================

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  message text not null
    constraint interests_message_len check (char_length(btrim(message)) between 20 and 500),
  status public.interest_status not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interests_unique_per_user unique (listing_id, from_user)
);
create index interests_from_user_idx on public.interests (from_user);

create trigger interests_set_updated_at
  before update on public.interests
  for each row execute function private.set_updated_at();

-- Altas: no en tu propio anuncio, solo en anuncios activos, sin bloqueos.
create function private.interests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_status public.listing_status;
begin
  select owner_id, status into v_owner, v_status
    from public.listings where id = new.listing_id;

  if v_owner is null then
    raise exception 'El anuncio no existe' using errcode = 'foreign_key_violation';
  end if;
  if v_owner = new.from_user then
    raise exception 'No puedes mostrar interés en tu propio anuncio' using errcode = 'check_violation';
  end if;
  if v_status <> 'active' then
    raise exception 'El anuncio no está activo' using errcode = 'check_violation';
  end if;
  if private.is_blocked_between(v_owner, new.from_user) then
    raise exception 'No es posible contactar con este usuario' using errcode = 'insufficient_privilege';
  end if;

  new.status := 'pending';
  new.decided_at := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger interests_before_insert
  before insert on public.interests
  for each row execute function private.interests_before_insert();

-- Máquina de estados (también para service_role):
--   pending  -> accepted | declined   (solo el dueño del anuncio)
--   pending  -> withdrawn             (solo quien mostró interés)
--   accepted -> withdrawn             (solo quien mostró interés)
-- Cualquier otra transición se rechaza. El resto de columnas son inmutables.
create function private.interests_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_owner uuid;
begin
  if new.listing_id <> old.listing_id or new.from_user <> old.from_user
     or new.message <> old.message or new.created_at <> old.created_at then
    raise exception 'Solo se puede cambiar el estado de un interés' using errcode = 'check_violation';
  end if;

  if new.status = old.status then
    new.decided_at := old.decided_at;
    return new;
  end if;

  select owner_id into v_owner from public.listings where id = old.listing_id;

  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    if v_actor is not null and v_actor <> v_owner then
      raise exception 'Solo el anunciante puede aceptar o rechazar' using errcode = 'insufficient_privilege';
    end if;
  elsif old.status in ('pending', 'accepted') and new.status = 'withdrawn' then
    if v_actor is not null and v_actor <> old.from_user then
      raise exception 'Solo quien mostró interés puede retirarlo' using errcode = 'insufficient_privilege';
    end if;
  else
    raise exception 'Transición de estado no permitida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.decided_at := now();
  return new;
end;
$$;

create trigger interests_before_update
  before update on public.interests
  for each row execute function private.interests_before_update();

create function private.is_interest_participant(p_interest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.interests i
      join public.listings l on l.id = i.listing_id
     where i.id = p_interest_id
       and (select auth.uid()) in (i.from_user, l.owner_id)
  );
$$;
grant execute on function private.is_interest_participant(uuid) to authenticated, service_role;

alter table public.interests enable row level security;
revoke all on public.interests from anon, authenticated;
grant select on public.interests to authenticated;
grant insert (listing_id, from_user, message) on public.interests to authenticated;
grant update (status) on public.interests to authenticated;

create policy interests_select_participant on public.interests
  for select to authenticated
  using (
    from_user = (select auth.uid())
    or (select private.owns_listing(listing_id))
    or (select private.is_admin())
  );

create policy interests_insert_own on public.interests
  for insert to authenticated
  with check (from_user = (select auth.uid()));

create policy interests_update_participant on public.interests
  for update to authenticated
  using (from_user = (select auth.uid()) or (select private.owns_listing(listing_id)))
  with check (from_user = (select auth.uid()) or (select private.owns_listing(listing_id)));

-- Sin política de DELETE: un interés se retira, no se borra.

-- Dirección exacta: también la ven los interesados aceptados.
create function private.has_accepted_interest(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.interests
     where listing_id = p_listing_id
       and from_user = (select auth.uid())
       and status = 'accepted'
  );
$$;
grant execute on function private.has_accepted_interest(uuid) to authenticated, service_role;

create policy listing_addresses_select_accepted on public.listing_addresses
  for select to authenticated
  using ((select private.has_accepted_interest(listing_id)));

-- -----------------------------------------------------------------------------
-- messages: conversación asociada a un interés
-- -----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.interests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null constraint messages_body_len check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_interest_created_idx on public.messages (interest_id, created_at);
create index messages_sender_idx on public.messages (sender_id);

create function private.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid;
  v_owner uuid;
  v_status public.interest_status;
begin
  select i.from_user, l.owner_id, i.status into v_from, v_owner, v_status
    from public.interests i
    join public.listings l on l.id = i.listing_id
   where i.id = new.interest_id;

  if new.sender_id not in (v_from, v_owner) then
    raise exception 'No formas parte de esta conversación' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('pending', 'accepted') then
    raise exception 'Esta conversación está cerrada' using errcode = 'check_violation';
  end if;
  if private.is_blocked_between(v_from, v_owner) then
    raise exception 'No es posible contactar con este usuario' using errcode = 'insufficient_privilege';
  end if;

  new.created_at := now();
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.messages_before_insert();

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (interest_id, sender_id, body) on public.messages to authenticated;

create policy messages_select_participant on public.messages
  for select to authenticated
  using ((select private.is_interest_participant(interest_id)));

create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_interest_participant(interest_id))
  );

-- Sin UPDATE ni DELETE: los mensajes no se editan ni se borran.


-- >>> 20261104000500_stays.sql
-- =============================================================================
-- 05 · Estancias (stays) y participantes (compañeros)
-- =============================================================================
-- Una estancia vincula un anuncio room/flat, su propietario (host) y un
-- inquilino (guest). La propone cualquiera de los dos y la otra parte la
-- confirma. Con ambas confirmaciones pasa a 'active'.
--
-- Estancia retroactiva: sin interés previo (interest_id null) y con fecha de
-- inicio pasada. Sirve para sembrar reputación de convivencias anteriores a
-- Convivo. Exige igualmente la doble confirmación.
--
-- Los usuarios NO pueden actualizar la tabla directamente: todo cambio de
-- estado pasa por las funciones RPC de abajo.

create table public.stays (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id),
  interest_id uuid references public.interests (id) on delete set null,
  host_id uuid not null references public.profiles (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,
  proposed_by uuid references public.profiles (id) on delete set null,
  start_date date not null,
  end_date date,
  is_retroactive boolean not null default false,
  host_confirmed_at timestamptz,
  guest_confirmed_at timestamptz,
  status public.stay_status not null default 'proposed',
  activated_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stays_host_not_guest check (host_id <> guest_id),
  constraint stays_dates check (end_date is null or end_date >= start_date),
  constraint stays_active_confirmed check (
    status not in ('active', 'ended')
    or (host_confirmed_at is not null and guest_confirmed_at is not null and activated_at is not null)
  )
);

create index stays_listing_idx on public.stays (listing_id);
create index stays_host_idx on public.stays (host_id);
create index stays_guest_idx on public.stays (guest_id);
create index stays_interest_idx on public.stays (interest_id);
-- Como mucho una estancia viva por anuncio e inquilino.
create unique index stays_one_open_per_guest on public.stays (listing_id, guest_id)
  where status in ('proposed', 'active');

create trigger stays_set_updated_at
  before update on public.stays
  for each row execute function private.set_updated_at();

create function private.stays_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_listing public.listings%rowtype;
  v_interest public.interests%rowtype;
begin
  select * into v_listing from public.listings where id = new.listing_id;
  if v_listing.id is null then
    raise exception 'El anuncio no existe' using errcode = 'foreign_key_violation';
  end if;
  if v_listing.kind not in ('room', 'flat') then
    raise exception 'Solo se pueden registrar estancias en habitaciones o pisos' using errcode = 'check_violation';
  end if;
  if new.host_id <> v_listing.owner_id then
    raise exception 'El anfitrión debe ser el propietario del anuncio' using errcode = 'check_violation';
  end if;
  if private.is_blocked_between(new.host_id, new.guest_id) then
    raise exception 'No es posible registrar una estancia con este usuario' using errcode = 'insufficient_privilege';
  end if;

  if new.interest_id is not null then
    select * into v_interest from public.interests where id = new.interest_id;
    if v_interest.listing_id is distinct from new.listing_id
       or v_interest.from_user is distinct from new.guest_id
       or v_interest.status is distinct from 'accepted' then
      raise exception 'La estancia debe partir de un interés aceptado en este anuncio' using errcode = 'check_violation';
    end if;
    new.is_retroactive := false;
  else
    if new.start_date > current_date then
      raise exception 'Una estancia sin interés previo debe haber empezado ya (estancia retroactiva)'
        using errcode = 'check_violation';
    end if;
    new.is_retroactive := true;
  end if;

  -- Inserción de usuario: estado inicial forzado y autoconfirmación de quien
  -- propone. Las inserciones de sistema (sin JWT: seed, service_role) se
  -- respetan tal cual, pero siguen sujetas a los CHECK.
  if v_actor is not null then
    if v_actor not in (new.host_id, new.guest_id) then
      raise exception 'Solo el anfitrión o el inquilino pueden proponer la estancia' using errcode = 'insufficient_privilege';
    end if;
    new.proposed_by := v_actor;
    new.status := 'proposed';
    new.host_confirmed_at := case when v_actor = new.host_id then now() end;
    new.guest_confirmed_at := case when v_actor = new.guest_id then now() end;
    new.activated_at := null;
    new.ended_at := null;
    new.cancelled_at := null;
  end if;
  return new;
end;
$$;

create trigger stays_before_insert
  before insert on public.stays
  for each row execute function private.stays_before_insert();

-- -----------------------------------------------------------------------------
-- stay_participants: compañeros de piso que conviven durante la estancia
-- -----------------------------------------------------------------------------
create table public.stay_participants (
  stay_id uuid not null references public.stays (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (stay_id, user_id)
);
create index stay_participants_user_idx on public.stay_participants (user_id);

-- ¿El usuario actual es participante (compañero) de la estancia?
create function private.is_stay_participant(p_stay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stay_participants
     where stay_id = p_stay_id and user_id = (select auth.uid())
  );
$$;
grant execute on function private.is_stay_participant(uuid) to authenticated, service_role;

-- ¿El usuario actual es host, guest o participante de la estancia?
create function private.is_stay_member(p_stay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stays s
     where s.id = p_stay_id
       and (
         (select auth.uid()) in (s.host_id, s.guest_id)
         or exists (
           select 1 from public.stay_participants p
            where p.stay_id = s.id and p.user_id = (select auth.uid())
         )
       )
  );
$$;
grant execute on function private.is_stay_member(uuid) to authenticated, service_role;

alter table public.stays enable row level security;
revoke all on public.stays from anon, authenticated;
grant select on public.stays to authenticated;
grant insert (listing_id, interest_id, host_id, guest_id, start_date, end_date) on public.stays to authenticated;

-- Columnas directas para host/guest (además de ser más rápido, permite
-- RETURNING en el INSERT: una subconsulta no vería aún la fila nueva).
create policy stays_select_member on public.stays
  for select to authenticated
  using (
    (select auth.uid()) in (host_id, guest_id)
    or (select private.is_stay_participant(id))
    or (select private.is_admin())
  );

create policy stays_insert_party on public.stays
  for insert to authenticated
  with check ((select auth.uid()) in (host_id, guest_id));

-- Sin UPDATE/DELETE directos: usar las funciones RPC.

alter table public.stay_participants enable row level security;
revoke all on public.stay_participants from anon, authenticated;
grant select on public.stay_participants to authenticated;

create policy stay_participants_select_member on public.stay_participants
  for select to authenticated
  using ((select private.is_stay_member(stay_id)) or (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- RPC de estancias
-- -----------------------------------------------------------------------------

-- Confirma la estancia por la parte que llama. Con ambas -> 'active'.
create function public.confirm_stay(p_stay_id uuid)
returns public.stays
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_stay public.stays%rowtype;
begin
  select * into v_stay from public.stays where id = p_stay_id for update;
  if v_stay.id is null or v_actor is null or v_actor not in (v_stay.host_id, v_stay.guest_id) then
    raise exception 'Estancia no encontrada' using errcode = 'no_data_found';
  end if;
  if v_stay.status <> 'proposed' then
    raise exception 'Esta estancia ya no admite confirmaciones' using errcode = 'check_violation';
  end if;
  if private.is_blocked_between(v_stay.host_id, v_stay.guest_id) then
    raise exception 'No es posible confirmar esta estancia' using errcode = 'insufficient_privilege';
  end if;

  if v_actor = v_stay.host_id then
    v_stay.host_confirmed_at := coalesce(v_stay.host_confirmed_at, now());
  else
    v_stay.guest_confirmed_at := coalesce(v_stay.guest_confirmed_at, now());
  end if;

  if v_stay.host_confirmed_at is not null and v_stay.guest_confirmed_at is not null then
    v_stay.status := 'active';
    v_stay.activated_at := now();
  end if;

  update public.stays
     set host_confirmed_at = v_stay.host_confirmed_at,
         guest_confirmed_at = v_stay.guest_confirmed_at,
         status = v_stay.status,
         activated_at = v_stay.activated_at
   where id = p_stay_id
  returning * into v_stay;
  return v_stay;
end;
$$;

-- Rechaza o cancela una estancia propuesta (cualquiera de las dos partes).
create function public.cancel_stay(p_stay_id uuid)
returns public.stays
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_stay public.stays%rowtype;
begin
  select * into v_stay from public.stays where id = p_stay_id for update;
  if v_stay.id is null or v_actor is null or v_actor not in (v_stay.host_id, v_stay.guest_id) then
    raise exception 'Estancia no encontrada' using errcode = 'no_data_found';
  end if;
  if v_stay.status <> 'proposed' then
    raise exception 'Solo se puede cancelar una estancia pendiente de confirmar' using errcode = 'check_violation';
  end if;

  update public.stays
     set status = 'cancelled', cancelled_at = now()
   where id = p_stay_id
  returning * into v_stay;
  return v_stay;
end;
$$;

-- Da por terminada una estancia activa (cualquiera de las dos partes).
create function public.end_stay(p_stay_id uuid, p_end_date date default current_date)
returns public.stays
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_stay public.stays%rowtype;
begin
  select * into v_stay from public.stays where id = p_stay_id for update;
  if v_stay.id is null or v_actor is null or v_actor not in (v_stay.host_id, v_stay.guest_id) then
    raise exception 'Estancia no encontrada' using errcode = 'no_data_found';
  end if;
  if v_stay.status <> 'active' then
    raise exception 'Solo se puede terminar una estancia activa' using errcode = 'check_violation';
  end if;
  if p_end_date is null or p_end_date < v_stay.start_date or p_end_date > current_date then
    raise exception 'Fecha de fin no válida' using errcode = 'check_violation';
  end if;

  update public.stays
     set status = 'ended', end_date = p_end_date, ended_at = now()
   where id = p_stay_id
  returning * into v_stay;
  return v_stay;
end;
$$;

-- Añade un compañero de piso a la estancia (host o guest).
create function public.add_stay_participant(p_stay_id uuid, p_user_id uuid)
returns public.stay_participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_stay public.stays%rowtype;
  v_row public.stay_participants%rowtype;
begin
  select * into v_stay from public.stays where id = p_stay_id;
  if v_stay.id is null or v_actor is null or v_actor not in (v_stay.host_id, v_stay.guest_id) then
    raise exception 'Estancia no encontrada' using errcode = 'no_data_found';
  end if;
  if v_stay.status not in ('proposed', 'active') then
    raise exception 'No se pueden añadir participantes a esta estancia' using errcode = 'check_violation';
  end if;
  if p_user_id in (v_stay.host_id, v_stay.guest_id) then
    raise exception 'Esa persona ya forma parte de la estancia' using errcode = 'check_violation';
  end if;
  if private.is_blocked_between(v_actor, p_user_id) then
    raise exception 'No es posible añadir a este usuario' using errcode = 'insufficient_privilege';
  end if;

  insert into public.stay_participants (stay_id, user_id, added_by)
  values (p_stay_id, p_user_id, v_actor)
  returning * into v_row;
  return v_row;
end;
$$;

-- El propio compañero confirma su participación.
create function public.confirm_stay_participation(p_stay_id uuid)
returns public.stay_participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.stay_participants%rowtype;
begin
  update public.stay_participants
     set confirmed_at = coalesce(confirmed_at, now())
   where stay_id = p_stay_id and user_id = (select auth.uid())
  returning * into v_row;
  if v_row.stay_id is null then
    raise exception 'No figuras como participante de esta estancia' using errcode = 'no_data_found';
  end if;
  return v_row;
end;
$$;

-- El compañero rechaza su participación (solo si aún no la confirmó).
create function public.decline_stay_participation(p_stay_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.stay_participants
   where stay_id = p_stay_id
     and user_id = (select auth.uid())
     and confirmed_at is null;
  if not found then
    raise exception 'No hay ninguna participación pendiente que rechazar' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke execute on function
  public.confirm_stay(uuid), public.cancel_stay(uuid), public.end_stay(uuid, date),
  public.add_stay_participant(uuid, uuid), public.confirm_stay_participation(uuid),
  public.decline_stay_participation(uuid)
  from public, anon;
grant execute on function
  public.confirm_stay(uuid), public.cancel_stay(uuid), public.end_stay(uuid, date),
  public.add_stay_participant(uuid, uuid), public.confirm_stay_participation(uuid),
  public.decline_stay_participation(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Ventana de reseña
-- -----------------------------------------------------------------------------
-- Hay hasta dos aperturas posibles (hora de referencia: Europe/Madrid):
--   o1: cuando la estancia cumple 30 días (start_date + 30)
--   o2: cuando termina (end_date)
-- Ninguna puede ser anterior a la doble confirmación (activated_at): así una
-- estancia retroactiva confirmada hoy abre su ventana hoy. Si la estancia
-- termina antes de cumplir 30 días, solo cuenta o2.
-- Cada ventana dura 30 días. La ventana "vigente" es la última apertura ya
-- ocurrida o, si aún no ha ocurrido ninguna, la próxima. Como solo se puede
-- reseñar una vez por estancia y sujeto, quien reseña en la primera ventana
-- ya no reseña en la segunda.
create function private.review_window_opens_at(p_stay public.stays)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  with o as (
    select greatest(p_stay.activated_at, ((p_stay.start_date + 30)::timestamp at time zone 'Europe/Madrid')) as o1,
           greatest(p_stay.activated_at, (p_stay.end_date::timestamp at time zone 'Europe/Madrid')) as o2
  ),
  openings as (
    select o1 as t from o where p_stay.end_date is null or p_stay.end_date >= p_stay.start_date + 30
    union all
    select o2 from o where p_stay.end_date is not null
  )
  select case
    when p_stay.status in ('active', 'ended') and p_stay.activated_at is not null then
      (select coalesce(max(t) filter (where t <= now()), min(t)) from openings)
  end;
$$;
grant execute on function private.review_window_opens_at(public.stays) to authenticated, service_role;

create function public.get_review_window(p_stay_id uuid)
returns table (opens_at timestamptz, closes_at timestamptz, is_open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.opens_at,
         w.opens_at + interval '30 days',
         w.opens_at is not null and now() >= w.opens_at and now() < w.opens_at + interval '30 days'
    from public.stays s
    cross join lateral (select private.review_window_opens_at(s) as opens_at) w
   where s.id = p_stay_id
     and (private.is_stay_member(s.id) or private.is_admin());
$$;
revoke execute on function public.get_review_window(uuid) from public, anon;
grant execute on function public.get_review_window(uuid) to authenticated;


-- >>> 20261104000600_reviews.sql
-- =============================================================================
-- 06 · Reseñas: elegibilidad, doble ciego, inmutabilidad y estadísticas
-- =============================================================================
-- Reglas que impone la base de datos (no solo la app):
--  a) Solo se reseña con una estancia confirmada por ambas partes
--     (status active/ended) y siendo host, guest o compañero confirmado.
--  b) Doble ciego: `published_at` guarda CUÁNDO se hace visible. Al crear la
--     reseña vale "apertura de la ventana + 14 días"; si la contraparte ya
--     había reseñado, ambas pasan a `now()`. La visibilidad pública es
--     `published_at <= now()`, así que no hace falta ningún cron.
--  c) Inmutables: nadie (ni service_role) puede editar texto, nota ni
--     criterios. Solo se "borran" con motivo mediante delete_review(): queda
--     constancia (fecha, motivo, quién) pero no el contenido.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.stays (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  subject_type public.review_subject_type not null,
  subject_listing_id uuid references public.listings (id) on delete cascade,
  subject_user_id uuid references public.profiles (id) on delete cascade,
  relationship public.review_relationship not null,
  rating smallint constraint reviews_rating_range check (rating between 1 and 5),
  criteria jsonb,
  body text,
  created_at timestamptz not null default now(),
  published_at timestamptz not null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text,

  constraint reviews_subject_shape check (
    (subject_type = 'listing' and subject_listing_id is not null and subject_user_id is null)
    or (subject_type = 'user' and subject_user_id is not null and subject_listing_id is null)
  ),
  constraint reviews_not_self check (subject_user_id is null or subject_user_id <> author_id),
  constraint reviews_content_or_deleted check (
    (deleted_at is null and rating is not null and criteria is not null
      and body is not null and char_length(btrim(body)) between 50 and 1500
      and deletion_reason is null)
    or
    (deleted_at is not null and rating is null and criteria is null and body is null
      and char_length(btrim(deletion_reason)) between 10 and 500)
  )
);

-- Una reseña por (estancia, autor, sujeto).
create unique index reviews_unique_listing on public.reviews (stay_id, author_id, subject_listing_id)
  where subject_type = 'listing';
create unique index reviews_unique_user on public.reviews (stay_id, author_id, subject_user_id)
  where subject_type = 'user';

create index reviews_subject_user_idx on public.reviews (subject_user_id, published_at desc)
  where subject_type = 'user';
create index reviews_subject_listing_idx on public.reviews (subject_listing_id, published_at desc)
  where subject_type = 'listing';
create index reviews_author_idx on public.reviews (author_id);

-- Criterios (1..5) obligatorios según la relación. Lista cerrada.
create function private.review_criteria_keys(p_relationship public.review_relationship)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_relationship
    when 'tenant_to_listing'    then array['cleanliness', 'accuracy', 'area', 'condition', 'value']
    when 'tenant_to_landlord'   then array['communication', 'treatment', 'compliance', 'deposit']
    when 'landlord_to_tenant'   then array['payment_punctuality', 'home_care', 'coexistence', 'communication']
    when 'flatmate_to_flatmate' then array['coexistence', 'cleanliness', 'noise', 'respect']
  end;
$$;

create function private.valid_review_criteria(p_criteria jsonb, p_relationship public.review_relationship)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[] := private.review_criteria_keys(p_relationship);
  k text;
begin
  if p_criteria is null or jsonb_typeof(p_criteria) <> 'object' then
    return false;
  end if;
  if (p_criteria - v_keys) <> '{}'::jsonb then
    return false;
  end if;
  foreach k in array v_keys loop
    if not private.is_score(p_criteria -> k) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

grant execute on function
  private.review_criteria_keys(public.review_relationship),
  private.valid_review_criteria(jsonb, public.review_relationship)
  to authenticated, service_role;

-- Exponemos las claves para que la app no las duplique a mano.
create function public.review_criteria_for(p_relationship public.review_relationship)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select private.review_criteria_keys(p_relationship);
$$;
grant execute on function public.review_criteria_for(public.review_relationship) to anon, authenticated;

-- "La otra parte" de una reseña: el usuario reseñado o, si es un inmueble, su
-- anfitrión en esa estancia.
create function private.review_counterparty(p_review public.reviews, p_host_id uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_review.subject_user_id, p_host_id);
$$;

-- -----------------------------------------------------------------------------
-- Alta de reseña: reglas a) y b)
-- -----------------------------------------------------------------------------
create function private.reviews_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_stay public.stays%rowtype;
  v_author_role text;
  v_subject_role text;
  v_other uuid;
  v_opens timestamptz;
  v_counterpart_exists boolean;
begin
  if v_actor is not null and new.author_id is distinct from v_actor then
    raise exception 'Solo puedes publicar reseñas en tu nombre' using errcode = 'insufficient_privilege';
  end if;

  select * into v_stay from public.stays where id = new.stay_id;

  -- a) estancia confirmada por ambas partes
  if v_stay.id is null
     or v_stay.status not in ('active', 'ended')
     or v_stay.host_confirmed_at is null
     or v_stay.guest_confirmed_at is null then
    raise exception 'Solo se puede reseñar una estancia confirmada por ambas partes'
      using errcode = 'check_violation';
  end if;

  -- a) el autor forma parte de la estancia
  v_author_role := case
    when new.author_id = v_stay.host_id then 'host'
    when new.author_id = v_stay.guest_id then 'guest'
    when exists (
      select 1 from public.stay_participants
       where stay_id = v_stay.id and user_id = new.author_id and confirmed_at is not null
    ) then 'flatmate'
  end;
  if v_author_role is null then
    raise exception 'No formas parte de esta estancia' using errcode = 'insufficient_privilege';
  end if;

  -- Relación permitida
  if new.subject_type = 'listing' then
    if v_author_role <> 'guest' or new.subject_listing_id is distinct from v_stay.listing_id then
      raise exception 'Solo el inquilino puede reseñar el inmueble de su estancia' using errcode = 'check_violation';
    end if;
    new.relationship := 'tenant_to_listing';
    v_other := v_stay.host_id;
  else
    v_subject_role := case
      when new.subject_user_id = v_stay.host_id then 'host'
      when new.subject_user_id = v_stay.guest_id then 'guest'
      when exists (
        select 1 from public.stay_participants
         where stay_id = v_stay.id and user_id = new.subject_user_id and confirmed_at is not null
      ) then 'flatmate'
    end;

    new.relationship := case
      when v_author_role = 'guest' and v_subject_role = 'host' then 'tenant_to_landlord'
      when v_author_role = 'host' and v_subject_role = 'guest' then 'landlord_to_tenant'
      when v_author_role in ('guest', 'flatmate') and v_subject_role in ('guest', 'flatmate')
           and new.author_id <> new.subject_user_id then 'flatmate_to_flatmate'
    end::public.review_relationship;

    if new.relationship is null then
      raise exception 'Esa relación no se puede reseñar en esta estancia' using errcode = 'check_violation';
    end if;
    v_other := new.subject_user_id;
  end if;

  if private.is_blocked_between(new.author_id, v_other) then
    raise exception 'No puedes reseñar a este usuario' using errcode = 'insufficient_privilege';
  end if;

  if not private.valid_review_criteria(new.criteria, new.relationship) then
    raise exception 'Criterios no válidos: se esperan %', private.review_criteria_keys(new.relationship)
      using errcode = 'check_violation';
  end if;

  -- Ventana de reseña (las inserciones de sistema, sin JWT, la omiten: seed o
  -- importaciones de estancias antiguas hechas por un admin).
  v_opens := private.review_window_opens_at(v_stay);
  if v_actor is not null and (now() < v_opens or now() >= v_opens + interval '30 days') then
    raise exception 'La ventana para reseñar esta estancia no está abierta' using errcode = 'check_violation';
  end if;

  -- b) Doble ciego
  select exists (
    select 1 from public.reviews r
     where r.stay_id = new.stay_id
       and r.author_id = v_other
       and r.deleted_at is null
       and private.review_counterparty(r, v_stay.host_id) = new.author_id
  ) into v_counterpart_exists;

  new.created_at := now();
  new.deleted_at := null;
  new.deleted_by := null;
  new.deletion_reason := null;

  if v_counterpart_exists then
    new.published_at := now();
    -- Publica también lo que la contraparte (y el propio autor) hubiera escrito
    -- dentro de este par en esta estancia.
    update public.reviews r
       set published_at = now()
     where r.stay_id = new.stay_id
       and r.deleted_at is null
       and r.published_at > now()
       and (
         (r.author_id = v_other and private.review_counterparty(r, v_stay.host_id) = new.author_id)
         or (r.author_id = new.author_id and private.review_counterparty(r, v_stay.host_id) = v_other)
       );
  else
    new.published_at := v_opens + interval '14 days';
  end if;

  return new;
end;
$$;

create trigger reviews_before_insert
  before insert on public.reviews
  for each row execute function private.reviews_before_insert();

-- -----------------------------------------------------------------------------
-- Inmutabilidad: regla c) — se aplica a TODOS los roles
-- -----------------------------------------------------------------------------
create function private.reviews_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.stay_id <> old.stay_id or new.author_id <> old.author_id
     or new.subject_type <> old.subject_type
     or new.subject_listing_id is distinct from old.subject_listing_id
     or new.subject_user_id is distinct from old.subject_user_id
     or new.relationship <> old.relationship
     or new.created_at <> old.created_at then
    raise exception 'Las reseñas no se pueden modificar' using errcode = 'check_violation';
  end if;

  if old.deleted_at is not null then
    raise exception 'Esta reseña ya fue eliminada' using errcode = 'check_violation';
  end if;

  -- Caso 1: borrado con motivo (se vacía el contenido).
  if new.deleted_at is not null then
    if new.body is not null or new.criteria is not null or new.rating is not null then
      raise exception 'Al eliminar una reseña se descarta su contenido' using errcode = 'check_violation';
    end if;
    new.published_at := old.published_at;
    return new;
  end if;

  -- Caso 2: adelantar la publicación (doble ciego). Nunca retrasarla.
  if new.rating is distinct from old.rating
     or new.criteria is distinct from old.criteria
     or new.body is distinct from old.body
     or new.deletion_reason is distinct from old.deletion_reason
     or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Las reseñas no se pueden editar' using errcode = 'check_violation';
  end if;
  if new.published_at > old.published_at then
    raise exception 'No se puede retrasar la publicación de una reseña' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger reviews_before_update
  before update on public.reviews
  for each row execute function private.reviews_before_update();

-- Prohíbe el borrado físico directo. Solo se permite en cascada (al borrar la
-- cuenta o la estancia), que llega con profundidad de trigger > 1.
-- TODO(Prompt 6): al borrar la cuenta, anonimizar en vez de borrar.
create function private.reviews_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'Las reseñas no se borran: usa delete_review(id, motivo)' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger reviews_before_delete
  before delete on public.reviews
  for each row execute function private.reviews_before_delete();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (stay_id, author_id, subject_type, subject_listing_id, subject_user_id, rating, criteria, body)
  on public.reviews to authenticated;
-- Sin UPDATE ni DELETE para usuarios.

-- Terceros (y el reseñado) solo ven lo publicado. Las eliminadas siguen
-- visibles como constancia, pero ya sin contenido.
create policy reviews_select_published on public.reviews
  for select to anon, authenticated
  using (published_at <= now());

-- El autor siempre ve la suya.
create policy reviews_select_own on public.reviews
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy reviews_select_admin on public.reviews
  for select to authenticated
  using ((select private.is_admin()));

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (author_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------

-- Borrado con motivo (autor o admin). Deja constancia sin el contenido.
create function public.delete_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_author uuid;
begin
  select author_id into v_author from public.reviews where id = p_review_id and deleted_at is null;
  if v_author is null or v_actor is null or (v_actor <> v_author and not private.is_admin()) then
    raise exception 'Reseña no encontrada' using errcode = 'no_data_found';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'Indica un motivo (entre 10 y 500 caracteres)' using errcode = 'check_violation';
  end if;

  update public.reviews
     set deleted_at = now(),
         deleted_by = v_actor,
         deletion_reason = btrim(p_reason),
         body = null,
         criteria = null,
         rating = null
   where id = p_review_id;
end;
$$;
revoke execute on function public.delete_review(uuid, text) from public, anon;
grant execute on function public.delete_review(uuid, text) to authenticated;

-- Estadísticas de un perfil por relación. SECURITY DEFINER con filtro
-- explícito de "publicada y no eliminada": así el autor no ve su propia reseña
-- pendiente contada en la media.
--   tenant_to_landlord   -> valoraciones "como propietario"
--   landlord_to_tenant   -> valoraciones "como inquilino"
--   flatmate_to_flatmate -> valoraciones "como compañero"
create function public.profile_review_stats(p_user_id uuid)
returns table (
  relationship public.review_relationship,
  review_count bigint,
  avg_rating numeric,
  criteria_avg jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select r.relationship, r.rating, r.criteria
      from public.reviews r
     where r.subject_user_id = p_user_id
       and r.deleted_at is null
       and r.published_at <= now()
  ),
  crit as (
    select pub.relationship, c.key, round(avg(c.value::numeric), 2) as avg_value
      from pub, jsonb_each_text(pub.criteria) c
     group by pub.relationship, c.key
  )
  select p.relationship,
         count(*),
         round(avg(p.rating), 2),
         coalesce(
           (select jsonb_object_agg(crit.key, crit.avg_value) from crit where crit.relationship = p.relationship),
           '{}'::jsonb
         )
    from pub p
   group by p.relationship;
$$;

create function public.listing_review_stats(p_listing_id uuid)
returns table (review_count bigint, avg_rating numeric, criteria_avg jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select r.rating, r.criteria
      from public.reviews r
     where r.subject_listing_id = p_listing_id
       and r.deleted_at is null
       and r.published_at <= now()
  )
  select count(*),
         round(avg(pub.rating), 2),
         coalesce(
           (select jsonb_object_agg(x.key, x.avg_value)
              from (select c.key, round(avg(c.value::numeric), 2) as avg_value
                      from pub, jsonb_each_text(pub.criteria) c
                     group by c.key) x),
           '{}'::jsonb
         )
    from pub;
$$;

grant execute on function public.profile_review_stats(uuid), public.listing_review_stats(uuid)
  to anon, authenticated;


-- >>> 20261104000700_reports.sql
-- =============================================================================
-- 07 · Denuncias (reports)
-- =============================================================================
-- Claves foráneas reales para cada tipo de objetivo (en vez de un target_id
-- genérico sin integridad) y CHECK de "exactamente uno".

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_listing_id uuid references public.listings (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete cascade,
  target_review_id uuid references public.reviews (id) on delete cascade,
  target_message_id uuid references public.messages (id) on delete cascade,
  reason public.report_reason not null,
  details text constraint reports_details_len check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text constraint reports_resolution_note_len check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint reports_one_target check (
    num_nonnulls(target_listing_id, target_user_id, target_review_id, target_message_id) = 1
  ),
  constraint reports_not_self check (target_user_id is null or target_user_id <> reporter_id),
  constraint reports_resolution_shape check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status <> 'open' and resolved_at is not null)
  )
);

create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_listing_idx on public.reports (target_listing_id) where target_listing_id is not null;
create index reports_user_idx on public.reports (target_user_id) where target_user_id is not null;
create index reports_review_idx on public.reports (target_review_id) where target_review_id is not null;
create index reports_message_idx on public.reports (target_message_id) where target_message_id is not null;

-- Un mensaje solo lo puede denunciar quien participa en esa conversación.
create function private.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_message_id is not null then
    if not exists (
      select 1
        from public.messages m
        join public.interests i on i.id = m.interest_id
        join public.listings l on l.id = i.listing_id
       where m.id = new.target_message_id
         and new.reporter_id in (i.from_user, l.owner_id)
    ) then
      raise exception 'No puedes denunciar este mensaje' using errcode = 'insufficient_privilege';
    end if;
  end if;
  new.status := 'open';
  new.resolved_at := null;
  new.resolved_by := null;
  new.resolution_note := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function private.reports_before_insert();

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_id, target_listing_id, target_user_id, target_review_id, target_message_id, reason, details)
  on public.reports to authenticated;
grant update (status, resolved_by, resolved_at, resolution_note) on public.reports to authenticated;

create policy reports_select_own_or_admin on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- Solo administradores resuelven denuncias.
create policy reports_update_admin on public.reports
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()) and resolved_by = (select auth.uid()));


-- >>> 20261104000800_storage.sql
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


-- >>> 20261105000100_avatars.sql
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


-- >>> 20261105000200_conversations.sql
-- =============================================================================
-- 10 · Conversaciones: no leídos, límites anti-spam y Realtime
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Última lectura de cada conversación por cada participante
-- -----------------------------------------------------------------------------
create table public.conversation_reads (
  interest_id uuid not null references public.interests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (interest_id, user_id)
);
create index conversation_reads_user_idx on public.conversation_reads (user_id);

alter table public.conversation_reads enable row level security;
revoke all on public.conversation_reads from anon, authenticated;
grant select on public.conversation_reads to authenticated;

create policy conversation_reads_select_own on public.conversation_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Solo se escribe mediante mark_conversation_read().
create function public.mark_conversation_read(p_interest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_interest_participant(p_interest_id) then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;
  insert into public.conversation_reads (interest_id, user_id, last_read_at)
  values (p_interest_id, (select auth.uid()), now())
  on conflict (interest_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Mensajes no leídos por conversación del usuario actual (solo los ajenos).
create function public.my_unread_counts()
returns table (interest_id uuid, unread bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.interest_id, count(*)
    from public.messages m
    join public.interests i on i.id = m.interest_id
    join public.listings l on l.id = i.listing_id
    left join public.conversation_reads r
      on r.interest_id = m.interest_id and r.user_id = (select auth.uid())
   where (select auth.uid()) in (i.from_user, l.owner_id)
     and m.sender_id <> (select auth.uid())
     and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
   group by m.interest_id;
$$;

revoke execute on function public.mark_conversation_read(uuid), public.my_unread_counts() from public, anon;
grant execute on function public.mark_conversation_read(uuid), public.my_unread_counts() to authenticated;

-- Quien envía un mensaje lo ha "leído" hasta ese momento.
create function private.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversation_reads (interest_id, user_id, last_read_at)
  values (new.interest_id, new.sender_id, new.created_at)
  on conflict (interest_id, user_id) do update
    set last_read_at = greatest(public.conversation_reads.last_read_at, excluded.last_read_at);
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function private.messages_after_insert();

-- -----------------------------------------------------------------------------
-- Límites de frecuencia (anti-spam), impuestos en la base de datos
-- -----------------------------------------------------------------------------
--   * 60 mensajes por usuario y hora
--   * 15 intereses nuevos por usuario y hora
-- Solo se aplican a peticiones de usuarios (con JWT), no al sistema.
create index messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index interests_from_user_created_idx on public.interests (from_user, created_at desc);

create function private.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_count integer;
begin
  if v_actor is null then
    return new;
  end if;

  if tg_table_name = 'messages' then
    select count(*) into v_count from public.messages
     where sender_id = v_actor and created_at > now() - interval '1 hour';
    if v_count >= 60 then
      raise exception 'Has enviado demasiados mensajes en poco tiempo. Espera un rato.'
        using errcode = 'P0429';
    end if;
  elsif tg_table_name = 'interests' then
    select count(*) into v_count from public.interests
     where from_user = v_actor and created_at > now() - interval '1 hour';
    if v_count >= 15 then
      raise exception 'Has contactado con demasiados anuncios en poco tiempo. Espera un rato.'
        using errcode = 'P0429';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function private.enforce_rate_limit();

create trigger interests_rate_limit
  before insert on public.interests
  for each row execute function private.enforce_rate_limit();

-- -----------------------------------------------------------------------------
-- Realtime: los mensajes nuevos llegan al navegador. Supabase Realtime aplica
-- las políticas RLS de SELECT de cada suscriptor, así que solo los reciben
-- las dos partes de la conversación.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.interests;
  end if;
end
$$;


-- >>> 20261105000300_reviews_ux.sql
-- =============================================================================
-- 11 · Reseñas: respuestas públicas, moderación, avisos y señales anti-abuso
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ocultación cautelar: una reseña denunciada por contener DATOS PERSONALES se
-- oculta al público hasta que un admin la revise. El resto de denuncias no
-- ocultan nada (la reseña sigue visible mientras se revisa).
-- -----------------------------------------------------------------------------
create function private.review_is_hidden(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports
     where target_review_id = p_review_id
       and reason = 'personal_data'
       and status = 'open'
  );
$$;
grant execute on function private.review_is_hidden(uuid) to anon, authenticated, service_role;

drop policy reviews_select_published on public.reviews;
create policy reviews_select_published on public.reviews
  for select to anon, authenticated
  using (published_at <= now() and not (select private.review_is_hidden(id)));

-- Las estadísticas tampoco cuentan reseñas ocultas.
create or replace function public.profile_review_stats(p_user_id uuid)
returns table (
  relationship public.review_relationship,
  review_count bigint,
  avg_rating numeric,
  criteria_avg jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select r.relationship, r.rating, r.criteria
      from public.reviews r
     where r.subject_user_id = p_user_id
       and r.deleted_at is null
       and r.published_at <= now()
       and not private.review_is_hidden(r.id)
  ),
  crit as (
    select pub.relationship, c.key, round(avg(c.value::numeric), 2) as avg_value
      from pub, jsonb_each_text(pub.criteria) c
     group by pub.relationship, c.key
  )
  select p.relationship,
         count(*),
         round(avg(p.rating), 2),
         coalesce(
           (select jsonb_object_agg(crit.key, crit.avg_value) from crit where crit.relationship = p.relationship),
           '{}'::jsonb
         )
    from pub p
   group by p.relationship;
$$;

create or replace function public.listing_review_stats(p_listing_id uuid)
returns table (review_count bigint, avg_rating numeric, criteria_avg jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select r.rating, r.criteria
      from public.reviews r
     where r.subject_listing_id = p_listing_id
       and r.deleted_at is null
       and r.published_at <= now()
       and not private.review_is_hidden(r.id)
  )
  select count(*),
         round(avg(pub.rating), 2),
         coalesce(
           (select jsonb_object_agg(x.key, x.avg_value)
              from (select c.key, round(avg(c.value::numeric), 2) as avg_value
                      from pub, jsonb_each_text(pub.criteria) c
                     group by c.key) x),
           '{}'::jsonb
         )
    from pub;
$$;

-- Límite de denuncias: 10 al día por usuario (evita usar las denuncias por
-- datos personales para ocultar reseñas en masa).
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);

create function private.reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    select count(*) from public.reports
     where reporter_id = new.reporter_id and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'Has enviado demasiadas denuncias hoy. Inténtalo mañana.' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function private.reports_rate_limit();

-- Una sola denuncia abierta por persona y reseña.
create unique index reports_one_open_per_review on public.reports (reporter_id, target_review_id)
  where target_review_id is not null and status = 'open';

-- -----------------------------------------------------------------------------
-- Respuesta pública del reseñado: una por reseña, no editable
-- -----------------------------------------------------------------------------
create table public.review_responses (
  review_id uuid primary key references public.reviews (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null constraint review_responses_body_len check (char_length(btrim(body)) between 10 and 1000),
  created_at timestamptz not null default now()
);

create function private.review_responses_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews%rowtype;
  v_respondent uuid;
begin
  select * into v_review from public.reviews where id = new.review_id;
  if v_review.id is null or v_review.deleted_at is not null or v_review.published_at > now()
     or private.review_is_hidden(v_review.id) then
    raise exception 'Solo se puede responder a una reseña publicada' using errcode = 'check_violation';
  end if;

  -- Responde la persona reseñada; si es un inmueble, su propietario.
  if v_review.subject_type = 'user' then
    v_respondent := v_review.subject_user_id;
  else
    select owner_id into v_respondent from public.listings where id = v_review.subject_listing_id;
  end if;

  if (select auth.uid()) is not null and new.author_id is distinct from (select auth.uid()) then
    raise exception 'Solo puedes responder en tu nombre' using errcode = 'insufficient_privilege';
  end if;
  if new.author_id is distinct from v_respondent then
    raise exception 'Solo la persona reseñada puede responder' using errcode = 'insufficient_privilege';
  end if;

  new.created_at := now();
  return new;
end;
$$;

create trigger review_responses_before_insert
  before insert on public.review_responses
  for each row execute function private.review_responses_before_insert();

create function private.review_is_public(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reviews
     where id = p_review_id and deleted_at is null and published_at <= now()
       and not private.review_is_hidden(id)
  );
$$;
grant execute on function private.review_is_public(uuid) to anon, authenticated, service_role;

alter table public.review_responses enable row level security;
revoke all on public.review_responses from anon, authenticated;
grant select on public.review_responses to anon, authenticated;
grant insert (review_id, author_id, body) on public.review_responses to authenticated;

create policy review_responses_select_public on public.review_responses
  for select to anon, authenticated
  using ((select private.review_is_public(review_id)) or author_id = (select auth.uid()));

create policy review_responses_insert_own on public.review_responses
  for insert to authenticated
  with check (author_id = (select auth.uid()));
-- Sin UPDATE ni DELETE: la respuesta es única y no editable.

-- -----------------------------------------------------------------------------
-- Notificaciones in-app
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null constraint notifications_kind check (kind in ('review_window_opened', 'review_window_closing')),
  title text not null constraint notifications_title_len check (char_length(title) <= 200),
  body text constraint notifications_body_len check (char_length(body) <= 1000),
  url text constraint notifications_url_internal check (url ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Las crea el sistema (tarea programada con service_role).

-- -----------------------------------------------------------------------------
-- Avisos de ventana de reseña (idempotencia de la tarea programada)
-- -----------------------------------------------------------------------------
create table public.review_window_notices (
  stay_id uuid not null references public.stays (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null constraint review_window_notices_kind check (kind in ('opened', 'closing')),
  opens_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (stay_id, user_id, kind, opens_at)
);
alter table public.review_window_notices enable row level security;
revoke all on public.review_window_notices from anon, authenticated;
-- Sin políticas: solo service_role.

-- Avisos pendientes de enviar. Solo para la tarea programada (service_role).
create function public.review_window_notices_due()
returns table (
  stay_id uuid,
  user_id uuid,
  kind text,
  opens_at timestamptz,
  closes_at timestamptz,
  listing_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select s.id, s.host_id, s.guest_id, l.title, private.review_window_opens_at(s) as opens_at
      from public.stays s
      join public.listings l on l.id = s.listing_id
     where s.status in ('active', 'ended')
  ),
  members as (
    select w.id as stay_id, m.user_id, w.opens_at, w.title
      from w
      cross join lateral (
        select w.host_id as user_id
        union select w.guest_id
        union select p.user_id from public.stay_participants p where p.stay_id = w.id and p.confirmed_at is not null
      ) m
     where w.opens_at is not null
  ),
  due as (
    select m.*, 'opened'::text as kind from members m
     where now() >= m.opens_at and now() < m.opens_at + interval '30 days'
    union all
    select m.*, 'closing'::text from members m
     where now() >= m.opens_at + interval '27 days' and now() < m.opens_at + interval '30 days'
  )
  select d.stay_id, d.user_id, d.kind, d.opens_at, d.opens_at + interval '30 days', d.title
    from due d
   where not exists (
     select 1 from public.review_window_notices n
      where n.stay_id = d.stay_id and n.user_id = d.user_id and n.kind = d.kind and n.opens_at = d.opens_at
   );
$$;
revoke execute on function public.review_window_notices_due() from public, anon, authenticated;
grant execute on function public.review_window_notices_due() to service_role;

-- -----------------------------------------------------------------------------
-- Señales anti-abuso: hashes de IP y de navegador (nunca en claro)
-- -----------------------------------------------------------------------------
create table public.user_signals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip_hash text not null constraint user_signals_ip_hash_len check (char_length(ip_hash) = 64),
  ua_hash text not null constraint user_signals_ua_hash_len check (char_length(ua_hash) = 64),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, ip_hash, ua_hash)
);
create index user_signals_ip_idx on public.user_signals (ip_hash);
alter table public.user_signals enable row level security;
revoke all on public.user_signals from anon, authenticated;
-- Sin políticas: solo se escribe con record_signal() y lo leen los admins vía RPC.

create function public.record_signal(p_ip_hash text, p_ua_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  insert into public.user_signals (user_id, ip_hash, ua_hash)
  values ((select auth.uid()), p_ip_hash, p_ua_hash)
  on conflict (user_id, ip_hash, ua_hash) do update set last_seen_at = now();
end;
$$;
revoke execute on function public.record_signal(text, text) from public, anon;
grant execute on function public.record_signal(text, text) to authenticated;

-- Reseñas cuyo autor y sujeto comparten IP o navegador (posible autorreseña o
-- reseña cruzada pactada). Solo para administradores.
create function public.admin_review_flags()
returns table (review_id uuid, author_id uuid, subject_user_id uuid, shared_ip boolean, shared_device boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.id, r.author_id, coalesce(r.subject_user_id, l.owner_id),
           exists (select 1 from public.user_signals a join public.user_signals b on a.ip_hash = b.ip_hash
                    where a.user_id = r.author_id and b.user_id = coalesce(r.subject_user_id, l.owner_id)),
           exists (select 1 from public.user_signals a join public.user_signals b
                       on a.ip_hash = b.ip_hash and a.ua_hash = b.ua_hash
                    where a.user_id = r.author_id and b.user_id = coalesce(r.subject_user_id, l.owner_id))
      from public.reviews r
      left join public.listings l on l.id = r.subject_listing_id
     where r.deleted_at is null
       and exists (select 1 from public.user_signals a join public.user_signals b on a.ip_hash = b.ip_hash
                    where a.user_id = r.author_id and b.user_id = coalesce(r.subject_user_id, l.owner_id));
end;
$$;
revoke execute on function public.admin_review_flags() from public, anon;
grant execute on function public.admin_review_flags() to authenticated;


-- >>> 20261106000100_rental_period.sql
-- =============================================================================
-- Periodo de alquiler de un anuncio.
--   indefinite    : sin fecha de fin (lo habitual en pisos).
--   academic_year : un curso universitario (normalmente de septiembre a junio).
--   fixed         : fechas concretas (por ejemplo, un verano o unas prácticas).
-- available_until es el último día del periodo: obligatorio para publicar si no
-- es indefinido, y siempre posterior a la fecha de entrada. Sirve para los tres
-- tipos (en "busco", es hasta cuándo necesita el piso).
-- =============================================================================

create type public.rental_term as enum ('indefinite', 'academic_year', 'fixed');

alter table public.listings
  add column rental_term public.rental_term not null default 'indefinite',
  add column available_until date;

alter table public.listings
  add constraint listings_until_only_with_term
    check (rental_term <> 'indefinite' or available_until is null),
  add constraint listings_until_required
    check (status = 'draft' or rental_term = 'indefinite' or available_until is not null),
  add constraint listings_until_after_start
    check (available_until is null or available_until > coalesce(available_from, move_in_date));

comment on column public.listings.rental_term is 'Periodo de alquiler: indefinido, curso universitario o fechas concretas.';
comment on column public.listings.available_until is 'Último día del periodo (null si es indefinido).';

create index listings_active_term_idx on public.listings (rental_term) where status = 'active';


-- >>> 20261106000200_listing_guards.sql
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


-- >>> 20261106000300_auth_rate_limits.sql
-- =============================================================================
-- Límite de intentos en login, registro y enlace mágico (Fase 6).
--
-- Como el resto de límites (decisión 30), vive en la BD y no en la memoria del
-- servidor: vale igual con varias instancias de Vercel. Se cuenta por dos
-- claves, siempre como HMAC con SIGNAL_SECRET (nunca la IP ni el email en
-- claro):
--   - huella de la IP: frena a quien prueba muchas cuentas desde un sitio
--     (en el login cuenta cuentas distintas con fallos, no fallos);
--   - huella del email normalizado: frena a quien ataca una cuenta desde
--     muchas IP.
-- En el login solo cuentan los intentos FALLIDOS (entrar bien no penaliza). En
-- el registro y el enlace mágico cuenta cada petición.
-- Los límites por IP son generosos porque en una residencia o un campus muchos
-- estudiantes comparten la misma IP pública.
-- =============================================================================

create table public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null constraint auth_attempts_kind check (kind in ('login_failed', 'signup', 'magic_link')),
  ip_hash text not null constraint auth_attempts_ip_hash check (ip_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null constraint auth_attempts_email_hash check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index auth_attempts_ip_idx on public.auth_attempts (kind, ip_hash, created_at);
create index auth_attempts_email_idx on public.auth_attempts (kind, email_hash, created_at);
create index auth_attempts_created_idx on public.auth_attempts (created_at);

comment on table public.auth_attempts is
  'Intentos de login fallidos, registros y enlaces mágicos (solo huellas HMAC). Nadie la lee: solo las funciones auth_rate_*.';

alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;
-- Sin políticas: ni anon ni authenticated pueden leer ni escribir directamente.

-- Límites: [intentos, ventana] por IP y por email.
create function private.auth_rate_limits(p_kind text)
returns table (per_ip int, per_email int, win interval)
language sql
immutable
set search_path = ''
as $$
  select l.per_ip, l.per_email, l.win from (values
    ('login_failed', 30, 8, interval '15 minutes'),
    ('signup',       60, 3, interval '1 hour'),
    ('magic_link',   60, 5, interval '1 hour')
  ) as l(kind, per_ip, per_email, win)
  where l.kind = p_kind;
$$;

/**
 * ¿Se permite el intento? Para 'signup' y 'magic_link' además lo registra.
 * Para el login se llama con 'login_failed' ANTES de intentar entrar (solo
 * comprueba) y auth_rate_failed() DESPUÉS si la contraseña era incorrecta.
 */
create function public.auth_rate_allowed(p_kind text, p_ip_hash text, p_email_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit record;
  v_ip int;
  v_email int;
begin
  select * into v_limit from private.auth_rate_limits(p_kind);
  if not found then
    raise exception 'Tipo de intento no válido' using errcode = 'check_violation';
  end if;
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Huella no válida' using errcode = 'check_violation';
  end if;

  -- Limpieza de vez en cuando: no hace falta guardar nada de más de un día.
  if random() < 0.02 then
    delete from public.auth_attempts where created_at < now() - interval '1 day';
  end if;

  -- En el login, por IP se cuentan CUENTAS distintas con fallos: así se frena
  -- a quien prueba una contraseña contra muchas cuentas ("password spraying")
  -- sin castigar a una residencia entera porque alguien se equivoque mucho.
  select case when p_kind = 'login_failed' then count(distinct email_hash) else count(*) end into v_ip
    from public.auth_attempts
   where kind = p_kind and ip_hash = p_ip_hash and created_at > now() - v_limit.win;
  select count(*) into v_email from public.auth_attempts
   where kind = p_kind and email_hash = p_email_hash and created_at > now() - v_limit.win;

  if v_ip >= v_limit.per_ip or v_email >= v_limit.per_email then
    return false;
  end if;

  if p_kind <> 'login_failed' then
    insert into public.auth_attempts (kind, ip_hash, email_hash) values (p_kind, p_ip_hash, p_email_hash);
  end if;
  return true;
end;
$$;

-- Registra un login fallido.
create function public.auth_rate_failed(p_ip_hash text, p_email_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auth_attempts (kind, ip_hash, email_hash) values ('login_failed', p_ip_hash, p_email_hash);
$$;

-- Se llaman antes de iniciar sesión, así que anon tiene que poder ejecutarlas.
-- Solo aceptan huellas (64 hex) y no devuelven nada de nadie.
revoke execute on function public.auth_rate_allowed(text, text, text), public.auth_rate_failed(text, text) from public;
grant execute on function public.auth_rate_allowed(text, text, text), public.auth_rate_failed(text, text)
  to anon, authenticated;


-- >>> 20261106000400_account_deletion.sql
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
