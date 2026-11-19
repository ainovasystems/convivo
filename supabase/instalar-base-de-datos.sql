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


-- >>> 20261106000500_fraud_and_moderation_log.sql
-- =============================================================================
-- Anti-fraude y registro de auditoría de moderación (Fase 6, bloques 5 y 6).
--
-- 1. listing_flags: marcas automáticas para que un admin revise un anuncio. NO
--    despublican nada ni avisan al anunciante (no queremos dar pistas a quien
--    intenta estafar). Las pone un trigger al publicar o al cambiar un anuncio
--    activo, así que no se saltan llamando a la API directamente:
--      - payment_scam: texto típico de estafa (Western Union, MoneyGram,
--        "paga por adelantado", "estoy en el extranjero", "te mando las llaves"…);
--      - low_price: precio por debajo de la mitad de la mediana de anuncios
--        activos del mismo tipo en la ciudad (mínimo 5 para comparar) o, si no
--        hay bastantes, en la provincia; sin comparables, un umbral absoluto
--        (habitación < 120 €, piso < 250 €).
-- 2. moderation_log: registro append-only de quién hizo qué y cuándo. Nadie
--    lo modifica ni lo borra (tampoco service_role: lo impide un trigger).
--    Se escribe solo desde la BD: al resolver una denuncia, al eliminar una
--    reseña siendo admin y al revisar una marca de fraude.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Texto normalizado (minúsculas, sin tildes ni signos), igual que en la app.
-- -----------------------------------------------------------------------------
create function private.normalize_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Frases de estafa. Para ampliar, añade una alternativa (normalizada) aquí.
create function private.scam_phrase(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (regexp_match(
    private.normalize_text(p_text),
    '(western union|money ?gram|ria money|paysafecard|bitcoin|criptomoneda'
    || '|pag(a|ar|o|ues|ue) (\w+ )?por adelantado|pago adelantado|por adelantado (la|el) (fianza|deposito|primer mes)'
    || '|antes de ver (el|la) (piso|habitacion|casa|vivienda)|sin ver (el|la) (piso|habitacion|casa|vivienda)'
    || '|estoy (en el|fuera del?) (extranjero|pais|espana)|vivo (en el|fuera del?) (extranjero|pais)'
    || '|(te|le|os) (mando|envio|enviare|mandare|haremos llegar) las llaves|envio de (las )?llaves'
    || '|(por|mediante) (correo|mensajeria) las llaves)'))[1];
$$;

-- -----------------------------------------------------------------------------
-- listing_flags
-- -----------------------------------------------------------------------------
create table public.listing_flags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reason text not null constraint listing_flags_reason check (reason in ('payment_scam', 'low_price')),
  details text not null constraint listing_flags_details_len check (char_length(details) <= 500),
  status text not null default 'open' constraint listing_flags_status check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_note text constraint listing_flags_note_len check (char_length(resolution_note) <= 1000)
);
create unique index listing_flags_one_open on public.listing_flags (listing_id, reason) where status = 'open';
create index listing_flags_open_idx on public.listing_flags (created_at desc) where status = 'open';

alter table public.listing_flags enable row level security;
revoke all on public.listing_flags from anon, authenticated;
grant select on public.listing_flags to authenticated;
-- Solo admins las leen. Nadie las escribe directamente (trigger y RPC).
create policy listing_flags_select_admin on public.listing_flags
  for select to authenticated
  using ((select private.is_admin()));

create function private.flag_listing(p_listing public.listings)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phrase text;
  v_median numeric;
  v_scope text;
  v_floor int;
begin
  if p_listing.status <> 'active' then
    return;
  end if;

  v_phrase := private.scam_phrase(p_listing.title || ' ' || p_listing.description);
  if v_phrase is not null
     and not exists (select 1 from public.listing_flags
                      where listing_id = p_listing.id and reason = 'payment_scam' and status = 'open') then
    insert into public.listing_flags (listing_id, reason, details)
    values (p_listing.id, 'payment_scam', format('Texto sospechoso: «%s»', v_phrase));
  end if;

  if p_listing.kind in ('room', 'flat') and p_listing.monthly_rent is not null
     and not exists (select 1 from public.listing_flags
                      where listing_id = p_listing.id and reason = 'low_price' and status = 'open') then
    -- Mediana de la ciudad con al menos 5 comparables; si no, de la provincia.
    select percentile_cont(0.5) within group (order by monthly_rent), 'la ciudad'
      into v_median, v_scope
      from public.listings
     where status = 'active' and kind = p_listing.kind and id <> p_listing.id
       and lower(city) = lower(p_listing.city) and monthly_rent is not null
    having count(*) >= 5;
    if v_median is null then
      select percentile_cont(0.5) within group (order by monthly_rent), 'la provincia'
        into v_median, v_scope
        from public.listings
       where status = 'active' and kind = p_listing.kind and id <> p_listing.id
         and province = p_listing.province and monthly_rent is not null
      having count(*) >= 5;
    end if;

    if v_median is not null and p_listing.monthly_rent < v_median * 0.5 then
      insert into public.listing_flags (listing_id, reason, details)
      values (p_listing.id, 'low_price',
              format('%s €/mes, menos de la mitad de la mediana de %s (%s €/mes)',
                     p_listing.monthly_rent, v_scope, round(v_median)));
    elsif v_median is null then
      v_floor := case p_listing.kind when 'room' then 120 else 250 end;
      if p_listing.monthly_rent < v_floor then
        insert into public.listing_flags (listing_id, reason, details)
        values (p_listing.id, 'low_price',
                format('%s €/mes, por debajo del mínimo razonable (%s €) y sin anuncios con los que comparar',
                       p_listing.monthly_rent, v_floor));
      end if;
    end if;
  end if;
end;
$$;

create function private.listings_after_write_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.flag_listing(new);
  return null;
end;
$$;

create trigger listings_fraud_flags
  after insert or update of status, title, description, monthly_rent, city, province on public.listings
  for each row
  when (new.status = 'active')
  execute function private.listings_after_write_flags();

-- -----------------------------------------------------------------------------
-- moderation_log (append-only)
-- -----------------------------------------------------------------------------
create table public.moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  action text not null constraint moderation_log_action check (action in (
    'report_dismissed', 'report_resolved', 'review_deleted', 'listing_flag_dismissed', 'listing_flag_actioned'
  )),
  target_type text not null constraint moderation_log_target_type check (target_type in ('report', 'review', 'listing_flag')),
  target_id uuid not null,
  note text constraint moderation_log_note_len check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index moderation_log_created_idx on public.moderation_log (created_at desc);

comment on table public.moderation_log is
  'Registro de auditoría de moderación. Solo se inserta (desde triggers y RPC); nadie puede modificarlo ni borrarlo.';

create function private.moderation_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El registro de moderación no se puede modificar ni borrar' using errcode = 'check_violation';
end;
$$;

create trigger moderation_log_no_update
  before update or delete on public.moderation_log
  for each row execute function private.moderation_log_immutable();
create trigger moderation_log_no_truncate
  before truncate on public.moderation_log
  for each statement execute function private.moderation_log_immutable();

alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from anon, authenticated;
grant select on public.moderation_log to authenticated;
create policy moderation_log_select_admin on public.moderation_log
  for select to authenticated
  using ((select private.is_admin()));

create function private.log_moderation(p_action text, p_target_type text, p_target_id uuid, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.moderation_log (actor_id, action, target_type, target_id, note)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, left(p_note, 1000));
$$;

-- Denuncia resuelta o descartada (solo un admin puede cambiar su estado: RLS).
create function private.reports_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('dismissed', 'resolved') then
    perform private.log_moderation(
      case new.status when 'dismissed' then 'report_dismissed' else 'report_resolved' end,
      'report', new.id, new.resolution_note);
  end if;
  return null;
end;
$$;
create trigger reports_moderation_log
  after update of status on public.reports
  for each row execute function private.reports_after_update_log();

-- Reseña eliminada por un admin (el autor borrando la suya no es moderación).
create function private.reviews_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and private.is_admin()
     and new.deleted_by is distinct from new.author_id then
    perform private.log_moderation('review_deleted', 'review', new.id, new.deletion_reason);
  end if;
  return null;
end;
$$;
create trigger reviews_moderation_log
  after update of deleted_at on public.reviews
  for each row execute function private.reviews_after_update_log();

-- Revisar una marca de fraude: descartarla o cerrar el anuncio (definitivo).
create function public.admin_resolve_listing_flag(p_flag_id uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.listing_flags;
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('dismiss', 'close_listing') then
    raise exception 'Acción no válida' using errcode = 'check_violation';
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 5 and 1000 then
    raise exception 'Explica brevemente la decisión (5 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  select * into v_flag from public.listing_flags where id = p_flag_id and status = 'open' for update;
  if not found then
    raise exception 'Marca no encontrada o ya revisada' using errcode = 'no_data_found';
  end if;

  if p_action = 'close_listing' then
    update public.listings set status = 'closed' where id = v_flag.listing_id and status <> 'closed';
    -- Cierra también las demás marcas abiertas del mismo anuncio.
    update public.listing_flags
       set status = 'actioned', resolved_by = (select auth.uid()), resolved_at = now(), resolution_note = btrim(p_note)
     where listing_id = v_flag.listing_id and status = 'open';
    perform private.log_moderation('listing_flag_actioned', 'listing_flag', p_flag_id, btrim(p_note));
  else
    update public.listing_flags
       set status = 'dismissed', resolved_by = (select auth.uid()), resolved_at = now(), resolution_note = btrim(p_note)
     where id = p_flag_id;
    perform private.log_moderation('listing_flag_dismissed', 'listing_flag', p_flag_id, btrim(p_note));
  end if;
end;
$$;
revoke execute on function public.admin_resolve_listing_flag(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_listing_flag(uuid, text, text) to authenticated;


-- >>> 20261106000600_legal_notices.sql
-- =============================================================================
-- Canal público de denuncias de contenido ilícito (DSA, arts. 16 y 17).
--
-- Cualquiera, tenga cuenta o no (p. ej. un casero reseñado que no usa
-- Convivo), puede notificar un anuncio, un perfil o una reseña. La plataforma:
--   - acusa recibo (referencia en pantalla y email a quien notifica);
--   - se marca un objetivo interno de respuesta de 72 h (due_at);
--   - decide un admin y la decisión queda motivada y registrada
--     (moderation_log). Si se retira contenido, se avisa a la persona afectada
--     con la motivación (art. 17) y a quien notificó con el resultado.
-- Las denuncias internas (botón «Denunciar» de las reseñas) también avisan ya
-- a quien denunció y, si se elimina la reseña, a su autor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Límite de notificaciones por IP y email (reutiliza auth_attempts).
-- -----------------------------------------------------------------------------
alter table public.auth_attempts drop constraint auth_attempts_kind;
alter table public.auth_attempts
  add constraint auth_attempts_kind check (kind in ('login_failed', 'signup', 'magic_link', 'legal_notice'));

create or replace function private.auth_rate_limits(p_kind text)
returns table (per_ip int, per_email int, win interval)
language sql
immutable
set search_path = ''
as $$
  select l.per_ip, l.per_email, l.win from (values
    ('login_failed', 30, 8, interval '15 minutes'),
    ('signup',       60, 3, interval '1 hour'),
    ('magic_link',   60, 5, interval '1 hour'),
    ('legal_notice', 20, 10, interval '1 day')
  ) as l(kind, per_ip, per_email, win)
  where l.kind = p_kind;
$$;

-- -----------------------------------------------------------------------------
-- legal_notices
-- -----------------------------------------------------------------------------
create table public.legal_notices (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  target_type text not null constraint legal_notices_target_type check (target_type in ('listing', 'profile', 'review', 'other')),
  target_id uuid,
  target_url text not null constraint legal_notices_url_len check (char_length(target_url) between 5 and 500),
  reason text not null constraint legal_notices_reason check (reason in (
    'defamation', 'personal_data', 'discrimination', 'fraud', 'minor', 'intellectual_property', 'threat', 'other_illegal'
  )),
  explanation text not null constraint legal_notices_explanation_len check (char_length(btrim(explanation)) between 30 and 3000),
  notifier_name text not null constraint legal_notices_name_len check (char_length(btrim(notifier_name)) between 2 and 120),
  notifier_email text not null constraint legal_notices_email check (notifier_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(notifier_email) <= 200),
  notifier_user_id uuid references public.profiles (id),
  good_faith boolean not null constraint legal_notices_good_faith check (good_faith),
  status text not null default 'received' constraint legal_notices_status check (status in ('received', 'actioned', 'rejected')),
  decision_note text constraint legal_notices_decision_len check (char_length(decision_note) <= 2000),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  -- Objetivo interno de respuesta (el DSA pide diligencia, sin plazo fijo).
  due_at timestamptz not null default now() + interval '72 hours',
  constraint legal_notices_target_id check ((target_type = 'other') = (target_id is null))
);
create index legal_notices_open_idx on public.legal_notices (due_at) where status = 'received';

comment on table public.legal_notices is
  'Notificaciones de contenido ilícito (DSA art. 16), también de personas sin cuenta. Solo las leen los admins.';

alter table public.legal_notices enable row level security;
revoke all on public.legal_notices from anon, authenticated;
grant select on public.legal_notices to authenticated;
create policy legal_notices_select_admin on public.legal_notices
  for select to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Nuevos tipos de aviso in-app y de acciones en el registro de moderación.
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications
  add constraint notifications_kind check (kind in (
    'review_window_opened', 'review_window_closing', 'report_decision', 'content_removed'
  ));

alter table public.moderation_log drop constraint moderation_log_action;
alter table public.moderation_log
  add constraint moderation_log_action check (action in (
    'report_dismissed', 'report_resolved', 'review_deleted', 'listing_flag_dismissed', 'listing_flag_actioned',
    'notice_actioned', 'notice_rejected', 'listing_closed'
  ));
alter table public.moderation_log drop constraint moderation_log_target_type;
alter table public.moderation_log
  add constraint moderation_log_target_type check (target_type in ('report', 'review', 'listing_flag', 'notice', 'listing'));

-- -----------------------------------------------------------------------------
-- Alta de una notificación (anon incluido). Devuelve la referencia.
-- -----------------------------------------------------------------------------
create function public.submit_legal_notice(
  p_target_type text,
  p_target_id uuid,
  p_target_url text,
  p_reason text,
  p_explanation text,
  p_notifier_name text,
  p_notifier_email text,
  p_good_faith boolean,
  p_ip_hash text,
  p_email_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
begin
  if not public.auth_rate_allowed('legal_notice', p_ip_hash, p_email_hash) then
    raise exception 'Has enviado muchas notificaciones. Inténtalo de nuevo mañana.' using errcode = 'P0429';
  end if;
  -- El objetivo tiene que existir (si se indica).
  if p_target_type = 'listing' and not exists (select 1 from public.listings where id = p_target_id)
     or p_target_type = 'profile' and not exists (select 1 from public.profiles where id = p_target_id)
     or p_target_type = 'review' and not exists (select 1 from public.reviews where id = p_target_id) then
    raise exception 'No encontramos el contenido que quieres notificar' using errcode = 'no_data_found';
  end if;

  insert into public.legal_notices (target_type, target_id, target_url, reason, explanation,
                                    notifier_name, notifier_email, notifier_user_id, good_faith)
  values (p_target_type, p_target_id, btrim(p_target_url), p_reason, btrim(p_explanation),
          btrim(p_notifier_name), lower(btrim(p_notifier_email)), (select auth.uid()), coalesce(p_good_faith, false))
  returning reference into v_ref;
  return v_ref;
end;
$$;
revoke execute on function public.submit_legal_notice(text, uuid, text, text, text, text, text, boolean, text, text) from public;
grant execute on function public.submit_legal_notice(text, uuid, text, text, text, text, text, boolean, text, text)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Acciones de moderación sobre el contenido notificado.
-- -----------------------------------------------------------------------------

-- Cerrar un anuncio por moderación (definitivo), con aviso motivado al dueño.
create function public.admin_close_listing(p_listing_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 5 and 1000 then
    raise exception 'Explica brevemente la decisión (5 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  update public.listings set status = 'closed'
   where id = p_listing_id and status <> 'closed'
   returning owner_id, title into v_owner, v_title;
  if v_owner is null then
    raise exception 'Anuncio no encontrado o ya cerrado' using errcode = 'no_data_found';
  end if;
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_owner, 'content_removed', 'Hemos cerrado uno de tus anuncios',
          format('«%s» se ha cerrado por moderación. Motivo: %s. Si no estás de acuerdo, responde al email que te hemos enviado.',
                 left(v_title, 80), left(btrim(p_note), 500)),
          '/mis-anuncios');
  perform private.log_moderation('listing_closed', 'listing', p_listing_id, btrim(p_note));
end;
$$;
revoke execute on function public.admin_close_listing(uuid, text) from public, anon;
grant execute on function public.admin_close_listing(uuid, text) to authenticated;

-- Decidir una notificación: 'actioned' (se retiró el contenido) o 'rejected'.
create function public.admin_decide_legal_notice(p_notice_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('actioned', 'rejected') then
    raise exception 'Decisión no válida' using errcode = 'check_violation';
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 10 and 2000 then
    raise exception 'Motiva la decisión (10 a 2000 caracteres): se le enviará a quien notificó' using errcode = 'check_violation';
  end if;
  update public.legal_notices
     set status = p_decision, decision_note = btrim(p_note), decided_by = (select auth.uid()), decided_at = now()
   where id = p_notice_id and status = 'received';
  if not found then
    raise exception 'Notificación no encontrada o ya decidida' using errcode = 'no_data_found';
  end if;
  perform private.log_moderation(
    case p_decision when 'actioned' then 'notice_actioned' else 'notice_rejected' end, 'notice', p_notice_id, btrim(p_note));
end;
$$;
revoke execute on function public.admin_decide_legal_notice(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_legal_notice(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Motivación también en las denuncias internas (art. 17).
-- -----------------------------------------------------------------------------
create or replace function private.reports_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('dismissed', 'resolved') then
    perform private.log_moderation(
      case new.status when 'dismissed' then 'report_dismissed' else 'report_resolved' end,
      'report', new.id, new.resolution_note);
    insert into public.notifications (user_id, kind, title, body, url)
    values (new.reporter_id, 'report_decision',
            case new.status when 'dismissed' then 'Hemos revisado tu denuncia y no retiramos el contenido'
                            else 'Hemos revisado tu denuncia y hemos actuado' end,
            left(coalesce('Motivo: ' || new.resolution_note, 'Gracias por avisarnos.'), 1000),
            null);
  end if;
  return null;
end;
$$;

create or replace function private.reviews_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and private.is_admin()
     and new.deleted_by is distinct from new.author_id then
    perform private.log_moderation('review_deleted', 'review', new.id, new.deletion_reason);
    insert into public.notifications (user_id, kind, title, body, url)
    values (new.author_id, 'content_removed', 'Hemos eliminado una de tus reseñas',
            left(format('La reseña se ha eliminado por moderación. %s Si no estás de acuerdo, escríbenos al canal de reclamaciones indicado en las condiciones de uso.',
                        coalesce(new.deletion_reason, '')), 1000),
            '/mis-resenas');
  end if;
  return null;
end;
$$;


-- >>> 20261106000700_birth_year_and_gender_preference.sql
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


-- >>> 20261109000100_returning_accounts.sql
-- =============================================================================
-- Cuentas que se borran y vuelven (para no escapar de las malas reseñas).
--
-- 1. Al borrar una cuenta se guarda una HUELLA cifrada de su email (HMAC con una
--    clave que solo existe en la BD, nunca el email), las huellas de IP y
--    navegador que ya había y cuántas reseñas negativas tenía. Caduca a los 2
--    años (prevención del fraude, interés legítimo).
-- 2. Si alguien se registra con ese mismo email, la cuenta nueva queda enlazada
--    a la antigua (profiles.restored_from): su perfil muestra el historial de
--    reseñas anterior y las medias lo cuentan. Las reseñas no se tocan (siguen
--    siendo inmutables): se leen por la cadena de cuentas.
-- 3. Con otro email: el perfil de una cuenta reciente lleva «Cuenta nueva» (app)
--    y el admin ve las cuentas recientes que comparten IP o navegador con una
--    cuenta borrada que tenía reseñas negativas (indicio, no prueba).
-- =============================================================================

-- Clave del HMAC, generada aquí y legible solo por las funciones del sistema.
create table private.app_secrets (
  name text primary key,
  value bytea not null
);
revoke all on private.app_secrets from public, anon, authenticated;
insert into private.app_secrets (name, value) values ('account_trace', extensions.gen_random_bytes(32));

create function private.email_fingerprint(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(convert_to(lower(btrim(p_email)), 'UTF8'),
                    (select value from private.app_secrets where name = 'account_trace'), 'sha256'),
    'hex');
$$;
revoke execute on function private.email_fingerprint(text) from public, anon, authenticated;

create table private.deleted_account_traces (
  profile_id uuid primary key references public.profiles (id),
  email_hash text not null,
  ip_hashes text[] not null default '{}',
  ua_hashes text[] not null default '{}',
  negative_reviews int not null default 0,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 years',
  restored_by uuid references public.profiles (id)
);
create index deleted_account_traces_email_idx on private.deleted_account_traces (email_hash);
alter table private.deleted_account_traces enable row level security;
revoke all on private.deleted_account_traces from public, anon, authenticated;

-- La cuenta nueva apunta a la anterior. La pone el sistema, nunca el usuario.
alter table public.profiles add column restored_from uuid references public.profiles (id);
comment on column public.profiles.restored_from is
  'Cuenta borrada anterior de la misma persona (mismo email): su historial de reseñas se muestra en esta.';

-- Cadena de cuentas de una persona: ella y sus cuentas anteriores (máx. 10).
create function public.profile_lineage(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain(id, depth) as (
    select p_user_id, 0
    union all
    select p.restored_from, c.depth + 1
      from chain c join public.profiles p on p.id = c.id
     where p.restored_from is not null and c.depth < 10
  )
  select array_agg(id) from chain;
$$;
grant execute on function public.profile_lineage(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Al borrar: guardar la huella antes de anonimizar (que borra user_signals).
-- -----------------------------------------------------------------------------
create or replace function private.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email is not null then
    insert into private.deleted_account_traces (profile_id, email_hash, ip_hashes, ua_hashes, negative_reviews)
    values (
      old.id,
      private.email_fingerprint(old.email),
      coalesce((select array_agg(distinct s.ip_hash) from public.user_signals s where s.user_id = old.id), '{}'),
      coalesce((select array_agg(distinct s.ua_hash) from public.user_signals s where s.user_id = old.id), '{}'),
      (select count(*) from public.reviews r
        where r.deleted_at is null and r.rating <= 2
          and (r.subject_user_id = any(public.profile_lineage(old.id))
               or r.subject_listing_id in (select l.id from public.listings l where l.owner_id = old.id)))
    )
    on conflict (profile_id) do nothing;
  end if;
  perform private.anonymize_user(old.id);
  return old;
end;
$$;

-- -----------------------------------------------------------------------------
-- Al registrarse: si el email coincide con una cuenta borrada, se enlaza.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
  v_previous uuid;
begin
  if char_length(v_name) < 2 then
    v_name := 'Nuevo usuario';
  end if;

  if new.email is not null then
    select t.profile_id into v_previous
      from private.deleted_account_traces t
     where t.email_hash = private.email_fingerprint(new.email)
       and t.restored_by is null
       and t.expires_at > now()
     order by t.deleted_at desc
     limit 1;
  end if;

  insert into public.profiles (id, display_name, email_verified, restored_from)
  values (new.id, v_name, new.email_confirmed_at is not null, v_previous);

  if v_previous is not null then
    update private.deleted_account_traces set restored_by = new.id where profile_id = v_previous;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Las medias de un perfil cuentan también las de sus cuentas anteriores.
-- -----------------------------------------------------------------------------
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
     where r.subject_user_id = any(public.profile_lineage(p_user_id))
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

-- -----------------------------------------------------------------------------
-- Admin: cuentas recientes que comparten IP o navegador con una cuenta borrada
-- que tenía reseñas negativas.
-- -----------------------------------------------------------------------------
create function public.admin_returning_account_flags()
returns table (
  profile_id uuid,
  display_name text,
  created_at timestamptz,
  previous_profile_id uuid,
  previous_deleted_at timestamptz,
  negative_reviews int,
  shared_device boolean
)
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
    select distinct on (p.id, t.profile_id)
           p.id, p.display_name, p.created_at, t.profile_id, t.deleted_at, t.negative_reviews,
           (s.ua_hash = any(t.ua_hashes))
      from public.profiles p
      join public.user_signals s on s.user_id = p.id
      join private.deleted_account_traces t
        on (s.ip_hash = any(t.ip_hashes) or s.ua_hash = any(t.ua_hashes))
     where p.deleted_at is null
       and p.restored_from is null
       and p.created_at > now() - interval '180 days'
       and p.created_at > t.deleted_at
       and t.negative_reviews > 0
       and t.restored_by is null
       and t.expires_at > now()
     order by p.id, t.profile_id, (s.ua_hash = any(t.ua_hashes)) desc;
end;
$$;
revoke execute on function public.admin_returning_account_flags() from public, anon;
grant execute on function public.admin_returning_account_flags() to authenticated;


-- >>> 20261110000100_contracts.sql
-- =============================================================================
-- Contratos de alquiler con firma dentro de Convivo (fase 1).
--
-- Flujo: el casero prepara un BORRADOR desde una conversación con interés
-- aceptado → lo ENVÍA (el texto queda guardado y sellado con su hash SHA-256)
-- → firman las dos partes (nombre completo + hash del texto que han leído) →
-- FIRMADO: se crea (o se activa) la estancia con las dos confirmaciones, lo que
-- abre las reseñas verificadas.
--
-- Reglas en la BD:
--   - Solo el dueño del anuncio crea el contrato, para un interés ACEPTADO, y
--     el inquilino es quien mostró el interés.
--   - Solo se edita en borrador. Enviado, el texto es inmutable; firmado, el
--     contrato entero lo es (para cualquier rol).
--   - Se firma solo el texto exacto que se envió (se comprueba el hash) y con el
--     nombre que figura en el contrato.
-- Firma electrónica SIMPLE (eIDAS): queda constancia de quién, cuándo y qué.
-- Una firma avanzada con proveedor externo será una fase posterior.
-- =============================================================================

create type public.contract_kind as enum ('room', 'flat_habitual', 'flat_seasonal');
create type public.contract_status as enum ('draft', 'sent', 'signed', 'cancelled');

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  -- Nulos si se borra la cuenta de una parte: el contrato firmado se conserva.
  listing_id uuid references public.listings (id) on delete set null,
  interest_id uuid references public.interests (id) on delete set null,
  landlord_id uuid not null references public.profiles (id),
  tenant_id uuid not null references public.profiles (id),
  kind public.contract_kind not null,
  template_version text not null constraint contracts_template_version_len check (char_length(template_version) between 1 and 40),
  terms jsonb not null default '{}'::jsonb constraint contracts_terms_object check (jsonb_typeof(terms) = 'object'),
  status public.contract_status not null default 'draft',
  document_text text constraint contracts_document_len check (char_length(document_text) <= 60000),
  document_hash text constraint contracts_document_hash check (document_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  landlord_signed_at timestamptz,
  landlord_signature text,
  tenant_signed_at timestamptz,
  tenant_signature text,
  signed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  stay_id uuid references public.stays (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_parties check (landlord_id <> tenant_id),
  constraint contracts_sent_has_document check (status = 'draft' or status = 'cancelled' or (document_text is not null and document_hash is not null and sent_at is not null)),
  constraint contracts_signed_complete check (
    status <> 'signed' or (landlord_signed_at is not null and tenant_signed_at is not null and signed_at is not null)
  )
);
create index contracts_landlord_idx on public.contracts (landlord_id);
create index contracts_tenant_idx on public.contracts (tenant_id);
create index contracts_interest_idx on public.contracts (interest_id);
-- Como mucho un contrato vivo (borrador o enviado) por conversación.
create unique index contracts_one_open_per_interest on public.contracts (interest_id) where status in ('draft', 'sent');

create trigger contracts_set_updated_at
  before update on public.contracts
  for each row execute function private.set_updated_at();

comment on table public.contracts is
  'Contratos de alquiler entre casero e inquilino, con firma electrónica simple dentro de Convivo.';

-- -----------------------------------------------------------------------------
-- Alta: casero dueño del anuncio, interés aceptado, inquilino = interesado.
-- -----------------------------------------------------------------------------
create function private.contracts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interest public.interests%rowtype;
  v_listing public.listings%rowtype;
begin
  select * into v_interest from public.interests where id = new.interest_id;
  select * into v_listing from public.listings where id = v_interest.listing_id;
  if v_interest.id is null or v_interest.status <> 'accepted' then
    raise exception 'Solo se puede preparar un contrato cuando el interés está aceptado' using errcode = 'check_violation';
  end if;
  if v_listing.kind not in ('room', 'flat') then
    raise exception 'Solo hay contratos para habitaciones y pisos' using errcode = 'check_violation';
  end if;
  if new.landlord_id <> v_listing.owner_id or new.tenant_id <> v_interest.from_user or new.listing_id <> v_listing.id then
    raise exception 'El contrato tiene que ser entre el anunciante y la persona interesada' using errcode = 'check_violation';
  end if;
  if (v_listing.kind = 'room') <> (new.kind = 'room') then
    raise exception 'El tipo de contrato no corresponde al anuncio' using errcode = 'check_violation';
  end if;
  new.status := 'draft';
  new.document_text := null;
  new.document_hash := null;
  new.sent_at := null;
  new.landlord_signed_at := null;
  new.landlord_signature := null;
  new.tenant_signed_at := null;
  new.tenant_signature := null;
  new.signed_at := null;
  new.stay_id := null;
  return new;
end;
$$;
create trigger contracts_before_insert
  before insert on public.contracts
  for each row execute function private.contracts_before_insert();

-- -----------------------------------------------------------------------------
-- Cambios: el usuario solo toca tipo y condiciones en borrador. El resto pasa
-- por las RPC (variable de sesión convivo.contract_rpc). Firmado = inmutable.
-- -----------------------------------------------------------------------------
create function private.contracts_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Al borrar la cuenta de una parte solo se vacían los enlaces al anuncio y a
  -- la conversación (ON DELETE SET NULL); el texto firmado no se toca.
  if coalesce(current_setting('convivo.anonymizing', true), '') = 'on'
     and new.document_text is not distinct from old.document_text
     and new.terms = old.terms and new.status = old.status then
    return new;
  end if;
  if old.status in ('signed', 'cancelled') then
    raise exception 'Un contrato firmado o cancelado no se puede modificar' using errcode = 'check_violation';
  end if;
  if coalesce(current_setting('convivo.contract_rpc', true), '') <> 'on' then
    if old.status <> 'draft' then
      raise exception 'El contrato ya se ha enviado: no se puede editar. Cancélalo y prepara otro.' using errcode = 'check_violation';
    end if;
    if (new.kind = 'room') <> (old.kind = 'room') then
      raise exception 'El tipo de contrato no corresponde al anuncio' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger contracts_before_update
  before update on public.contracts
  for each row execute function private.contracts_before_update();

create function private.contracts_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and pg_trigger_depth() < 2 then
    raise exception 'Solo se pueden borrar contratos en borrador' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
create trigger contracts_before_delete
  before delete on public.contracts
  for each row execute function private.contracts_before_delete();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.contracts enable row level security;
revoke all on public.contracts from anon, authenticated;
grant select on public.contracts to authenticated;
grant insert (listing_id, interest_id, landlord_id, tenant_id, kind, template_version, terms) on public.contracts to authenticated;
grant update (kind, template_version, terms) on public.contracts to authenticated;
grant delete on public.contracts to authenticated;

create policy contracts_select_party on public.contracts
  for select to authenticated
  using ((select auth.uid()) in (landlord_id, tenant_id) or (select private.is_admin()));

create policy contracts_insert_landlord on public.contracts
  for insert to authenticated
  with check (landlord_id = (select auth.uid()));

create policy contracts_update_landlord on public.contracts
  for update to authenticated
  using (landlord_id = (select auth.uid()))
  with check (landlord_id = (select auth.uid()));

create policy contracts_delete_landlord_draft on public.contracts
  for delete to authenticated
  using (landlord_id = (select auth.uid()) and status = 'draft');

-- -----------------------------------------------------------------------------
-- Avisos in-app
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications
  add constraint notifications_kind check (kind in (
    'review_window_opened', 'review_window_closing', 'report_decision', 'content_removed',
    'contract_to_sign', 'contract_signed', 'contract_cancelled'
  ));

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------

-- Enviar a firmar: guarda el texto exacto que se firmará y su hash.
create function public.send_contract(p_contract_id uuid, p_document_text text)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_hash text;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or v_contract.landlord_id <> (select auth.uid()) then
    raise exception 'Contrato no encontrado' using errcode = 'no_data_found';
  end if;
  if v_contract.status <> 'draft' then
    raise exception 'Este contrato ya se envió' using errcode = 'check_violation';
  end if;
  if p_document_text is null or char_length(btrim(p_document_text)) < 500 then
    raise exception 'El texto del contrato está incompleto' using errcode = 'check_violation';
  end if;
  if coalesce(v_contract.terms ->> 'landlord_name', '') = '' or coalesce(v_contract.terms ->> 'tenant_name', '') = '' then
    raise exception 'Faltan los nombres completos de las partes' using errcode = 'check_violation';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_document_text, 'UTF8'), 'sha256'), 'hex');
  perform set_config('convivo.contract_rpc', 'on', true);
  update public.contracts
     set status = 'sent', document_text = p_document_text, document_hash = v_hash, sent_at = now()
   where id = p_contract_id
  returning * into v_contract;

  insert into public.notifications (user_id, kind, title, body, url)
  values (v_contract.tenant_id, 'contract_to_sign', 'Tienes un contrato para firmar',
          'Revísalo con calma antes de firmar. Si algo no te cuadra, coméntalo en la conversación.',
          '/contratos/' || v_contract.id);
  return v_contract;
end;
$$;

-- Firmar: la parte que llama, con su nombre completo y el hash del texto leído.
create function public.sign_contract(p_contract_id uuid, p_full_name text, p_document_hash text)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_contract public.contracts%rowtype;
  v_expected text;
  v_stay uuid;
  v_interest public.interests%rowtype;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or v_actor is null or v_actor not in (v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'Contrato no encontrado' using errcode = 'no_data_found';
  end if;
  if v_contract.status <> 'sent' then
    raise exception 'Este contrato no está pendiente de firma' using errcode = 'check_violation';
  end if;
  if p_document_hash is distinct from v_contract.document_hash then
    raise exception 'El texto que has leído no coincide con el contrato enviado. Recarga la página.' using errcode = 'check_violation';
  end if;
  v_expected := case when v_actor = v_contract.landlord_id then v_contract.terms ->> 'landlord_name' else v_contract.terms ->> 'tenant_name' end;
  if lower(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(btrim(v_expected), '\s+', ' ', 'g')) then
    raise exception 'Escribe tu nombre completo tal como aparece en el contrato: %', v_expected using errcode = 'check_violation';
  end if;
  if private.is_blocked_between(v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'No es posible firmar este contrato' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('convivo.contract_rpc', 'on', true);
  if v_actor = v_contract.landlord_id then
    if v_contract.landlord_signed_at is not null then
      raise exception 'Ya has firmado este contrato' using errcode = 'check_violation';
    end if;
    v_contract.landlord_signed_at := now();
    v_contract.landlord_signature := btrim(p_full_name);
  else
    if v_contract.tenant_signed_at is not null then
      raise exception 'Ya has firmado este contrato' using errcode = 'check_violation';
    end if;
    v_contract.tenant_signed_at := now();
    v_contract.tenant_signature := btrim(p_full_name);
  end if;

  if v_contract.landlord_signed_at is not null and v_contract.tenant_signed_at is not null then
    -- Firmado por los dos: estancia confirmada por ambas partes.
    select * into v_interest from public.interests where id = v_contract.interest_id;
    select s.id into v_stay from public.stays s
     where s.listing_id = v_contract.listing_id and s.guest_id = v_contract.tenant_id and s.status in ('proposed', 'active')
     limit 1;
    if v_stay is null then
      insert into public.stays (listing_id, interest_id, host_id, guest_id, start_date, end_date)
      values (v_contract.listing_id, v_contract.interest_id, v_contract.landlord_id, v_contract.tenant_id,
              (v_contract.terms ->> 'start_date')::date, nullif(v_contract.terms ->> 'end_date', '')::date)
      returning id into v_stay;
    end if;
    update public.stays
       set host_confirmed_at = coalesce(host_confirmed_at, v_contract.landlord_signed_at),
           guest_confirmed_at = coalesce(guest_confirmed_at, v_contract.tenant_signed_at),
           status = 'active',
           activated_at = coalesce(activated_at, now())
     where id = v_stay;

    v_contract.status := 'signed';
    v_contract.signed_at := now();
    v_contract.stay_id := v_stay;
    insert into public.notifications (user_id, kind, title, body, url)
    select u, 'contract_signed', 'Contrato firmado por las dos partes',
           'Ya tenéis el contrato firmado y la estancia confirmada. Guarda una copia.', '/contratos/' || v_contract.id
      from unnest(array[v_contract.landlord_id, v_contract.tenant_id]) as u;
  end if;

  update public.contracts
     set landlord_signed_at = v_contract.landlord_signed_at,
         landlord_signature = v_contract.landlord_signature,
         tenant_signed_at = v_contract.tenant_signed_at,
         tenant_signature = v_contract.tenant_signature,
         status = v_contract.status,
         signed_at = v_contract.signed_at,
         stay_id = v_contract.stay_id
   where id = p_contract_id
  returning * into v_contract;
  return v_contract;
end;
$$;

-- Cancelar antes de que firmen los dos (cualquiera de las partes).
create function public.cancel_contract(p_contract_id uuid)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_contract public.contracts%rowtype;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or v_actor is null or v_actor not in (v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'Contrato no encontrado' using errcode = 'no_data_found';
  end if;
  if v_contract.status not in ('draft', 'sent') then
    raise exception 'Un contrato firmado o cancelado no se puede cancelar' using errcode = 'check_violation';
  end if;
  perform set_config('convivo.contract_rpc', 'on', true);
  update public.contracts
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor
   where id = p_contract_id
  returning * into v_contract;
  if v_contract.sent_at is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    values (case when v_actor = v_contract.landlord_id then v_contract.tenant_id else v_contract.landlord_id end,
            'contract_cancelled', 'Se ha cancelado un contrato',
            'El contrato que estaba pendiente de firma se ha cancelado.', '/contratos/' || v_contract.id);
  end if;
  return v_contract;
end;
$$;

revoke execute on function public.send_contract(uuid, text), public.sign_contract(uuid, text, text),
  public.cancel_contract(uuid) from public, anon;
grant execute on function public.send_contract(uuid, text), public.sign_contract(uuid, text, text),
  public.cancel_contract(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Borrado de cuenta: los contratos firmados se conservan (documento legal entre
-- las partes); los borradores se borran y los pendientes de firma se cancelan.
-- -----------------------------------------------------------------------------
create or replace function private.anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('convivo.anonymizing', 'on', true);
  perform set_config('convivo.contract_rpc', 'on', true);

  delete from public.contracts
   where status = 'draft' and (landlord_id = p_user or tenant_id = p_user);
  update public.contracts
     set status = 'cancelled', cancelled_at = now(), cancelled_by = p_user
   where status = 'sent' and (landlord_id = p_user or tenant_id = p_user);

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


-- >>> 20261111000100_contract_inventories.sql
-- =============================================================================
-- Contratos, fase 2: inventario de entrada y de salida, con fotos.
--
-- Con el contrato FIRMADO, cualquiera de las dos partes abre el inventario de
-- entrada y va añadiendo elementos (zona, elemento, estado, notas y fotos). Los
-- dos lo revisan y lo confirman. Si alguien cambia algo después de que el otro
-- haya confirmado, las confirmaciones se anulan y hay que volver a confirmar.
-- Confirmado por los dos, queda BLOQUEADO para siempre (para cualquier rol),
-- y sirve de prueba del estado de la vivienda al devolver la fianza.
--
-- El inventario de salida se abre cuando el de entrada está bloqueado.
-- Las fotos van a un bucket PRIVADO (inventory-photos): solo las ven las dos
-- partes del contrato. Ruta: {contract_id}/{inventory_id}/{uuid}.webp
-- =============================================================================

create type public.inventory_stage as enum ('entry', 'exit');
create type public.item_condition as enum ('new', 'good', 'worn', 'damaged');

create table public.contract_inventories (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  stage public.inventory_stage not null,
  created_by uuid references public.profiles (id),
  landlord_confirmed_at timestamptz,
  tenant_confirmed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_inventories_one_per_stage unique (contract_id, stage),
  constraint contract_inventories_locked_complete check (
    locked_at is null or (landlord_confirmed_at is not null and tenant_confirmed_at is not null)
  )
);

create trigger contract_inventories_set_updated_at
  before update on public.contract_inventories
  for each row execute function private.set_updated_at();

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.contract_inventories (id) on delete cascade,
  area text not null constraint inventory_items_area_len check (char_length(btrim(area)) between 1 and 60),
  name text not null constraint inventory_items_name_len check (char_length(btrim(name)) between 1 and 80),
  condition public.item_condition not null,
  notes text not null default '' constraint inventory_items_notes_len check (char_length(notes) <= 500),
  photos text[] not null default '{}' constraint inventory_items_photos_max check (coalesce(array_length(photos, 1), 0) <= 6),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_items_inventory_idx on public.inventory_items (inventory_id, created_at);

create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function private.set_updated_at();

comment on table public.contract_inventories is
  'Inventario de entrada o salida de un contrato firmado; confirmado por las dos partes queda bloqueado.';
comment on table public.inventory_items is
  'Elementos del inventario (zona, elemento, estado, notas y fotos).';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create function private.is_contract_party(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract_id and (select auth.uid()) in (c.landlord_id, c.tenant_id)
  );
$$;

create function private.is_inventory_party(p_inventory_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contract_inventories i
      join public.contracts c on c.id = i.contract_id
     where i.id = p_inventory_id and (select auth.uid()) in (c.landlord_id, c.tenant_id)
  );
$$;

-- Acceso a una foto del bucket por su ruta {contract_id}/{inventory_id}/{fichero}.
-- p_write: además exige que el inventario no esté bloqueado.
create function private.inventory_photo_access(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_name is null or p_name !~ ('^' || v_uuid || '/' || v_uuid || '/' || v_uuid || '\.webp$') then
    return false;
  end if;
  return exists (
    select 1 from public.contract_inventories i
      join public.contracts c on c.id = i.contract_id
     where c.id = split_part(p_name, '/', 1)::uuid
       and i.id = split_part(p_name, '/', 2)::uuid
       and (select auth.uid()) in (c.landlord_id, c.tenant_id)
       and (not p_write or i.locked_at is null)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta del inventario: contrato firmado; salida solo con la entrada bloqueada.
-- -----------------------------------------------------------------------------
create function private.contract_inventories_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
begin
  select * into v_contract from public.contracts where id = new.contract_id;
  if v_contract.id is null
     or ((select auth.uid()) is not null and (select auth.uid()) not in (v_contract.landlord_id, v_contract.tenant_id)) then
    raise exception 'Contrato no encontrado' using errcode = 'no_data_found';
  end if;
  if v_contract.status <> 'signed' then
    raise exception 'El inventario se hace con el contrato ya firmado por las dos partes' using errcode = 'check_violation';
  end if;
  if new.stage = 'exit' and not exists (
    select 1 from public.contract_inventories
     where contract_id = new.contract_id and stage = 'entry' and locked_at is not null
  ) then
    raise exception 'Primero tenéis que confirmar los dos el inventario de entrada' using errcode = 'check_violation';
  end if;
  new.created_by := (select auth.uid());
  new.landlord_confirmed_at := null;
  new.tenant_confirmed_at := null;
  new.locked_at := null;
  return new;
end;
$$;
create trigger contract_inventories_before_insert
  before insert on public.contract_inventories
  for each row execute function private.contract_inventories_before_insert();

-- Bloqueado = inmutable para cualquier rol (también service_role).
create function private.contract_inventories_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked_at is not null then
    raise exception 'El inventario está confirmado por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.contract_id <> old.contract_id or new.stage <> old.stage then
    raise exception 'No se puede cambiar el contrato ni el tipo de inventario' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger contract_inventories_guard
  before update or delete on public.contract_inventories
  for each row execute function private.contract_inventories_guard();

-- -----------------------------------------------------------------------------
-- Elementos: solo con el inventario abierto; las fotos, dentro de su carpeta.
-- Cualquier cambio anula las confirmaciones (hay que volver a revisar).
-- -----------------------------------------------------------------------------
create function private.inventory_items_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.contract_inventories%rowtype;
  v_inventory_id uuid := case when tg_op = 'DELETE' then old.inventory_id else new.inventory_id end;
  v_photo text;
begin
  select * into v_inv from public.contract_inventories where id = v_inventory_id;
  if v_inv.locked_at is not null then
    raise exception 'El inventario está confirmado por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    update public.contract_inventories
       set landlord_confirmed_at = null, tenant_confirmed_at = null
     where id = v_inv.id and (landlord_confirmed_at is not null or tenant_confirmed_at is not null);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.inventory_id <> old.inventory_id then
    raise exception 'Un elemento no se puede mover a otro inventario' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    if (select count(*) from public.inventory_items where inventory_id = v_inv.id) >= 150 then
      raise exception 'El inventario admite como mucho 150 elementos' using errcode = 'check_violation';
    end if;
  else
    new.created_by := old.created_by;
  end if;
  new.area := btrim(new.area);
  new.name := btrim(new.name);
  new.notes := btrim(new.notes);

  foreach v_photo in array new.photos loop
    if v_photo !~ ('^' || v_inv.contract_id::text || '/' || v_inv.id::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$') then
      raise exception 'Foto no válida para este inventario' using errcode = 'check_violation';
    end if;
  end loop;

  update public.contract_inventories
     set landlord_confirmed_at = null, tenant_confirmed_at = null
   where id = v_inv.id and (landlord_confirmed_at is not null or tenant_confirmed_at is not null);
  return new;
end;
$$;
create trigger inventory_items_before_change
  before insert or update or delete on public.inventory_items
  for each row execute function private.inventory_items_before_change();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.contract_inventories enable row level security;
revoke all on public.contract_inventories from anon, authenticated;
grant select on public.contract_inventories to authenticated;
grant insert (contract_id, stage) on public.contract_inventories to authenticated;

create policy contract_inventories_select_party on public.contract_inventories
  for select to authenticated
  using ((select private.is_contract_party(contract_id)) or (select private.is_admin()));

create policy contract_inventories_insert_party on public.contract_inventories
  for insert to authenticated
  with check ((select private.is_contract_party(contract_id)));

alter table public.inventory_items enable row level security;
revoke all on public.inventory_items from anon, authenticated;
grant select, delete on public.inventory_items to authenticated;
grant insert (inventory_id, area, name, condition, notes, photos) on public.inventory_items to authenticated;
grant update (area, name, condition, notes, photos) on public.inventory_items to authenticated;

create policy inventory_items_select_party on public.inventory_items
  for select to authenticated
  using ((select private.is_inventory_party(inventory_id)) or (select private.is_admin()));

create policy inventory_items_insert_party on public.inventory_items
  for insert to authenticated
  with check ((select private.is_inventory_party(inventory_id)));

create policy inventory_items_update_party on public.inventory_items
  for update to authenticated
  using ((select private.is_inventory_party(inventory_id)))
  with check ((select private.is_inventory_party(inventory_id)));

create policy inventory_items_delete_party on public.inventory_items
  for delete to authenticated
  using ((select private.is_inventory_party(inventory_id)));

-- -----------------------------------------------------------------------------
-- Storage: bucket privado para las fotos del inventario.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-photos', 'inventory-photos', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy inventory_photos_select_party on storage.objects
  for select to authenticated
  using (bucket_id = 'inventory-photos' and (select private.inventory_photo_access(name, false)));

create policy inventory_photos_insert_party on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inventory-photos' and (select private.inventory_photo_access(name, true)));

create policy inventory_photos_delete_party on storage.objects
  for delete to authenticated
  using (bucket_id = 'inventory-photos' and (select private.inventory_photo_access(name, true)));

-- -----------------------------------------------------------------------------
-- Avisos in-app
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications
  add constraint notifications_kind check (kind in (
    'review_window_opened', 'review_window_closing', 'report_decision', 'content_removed',
    'contract_to_sign', 'contract_signed', 'contract_cancelled',
    'inventory_to_confirm', 'inventory_confirmed'
  ));

-- -----------------------------------------------------------------------------
-- RPC: confirmar el inventario (la parte que llama).
-- -----------------------------------------------------------------------------
create function public.confirm_inventory(p_inventory_id uuid)
returns public.contract_inventories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_inv public.contract_inventories%rowtype;
  v_contract public.contracts%rowtype;
  v_other uuid;
  v_label text;
begin
  select * into v_inv from public.contract_inventories where id = p_inventory_id for update;
  select * into v_contract from public.contracts where id = v_inv.contract_id;
  if v_inv.id is null or v_actor is null or v_actor not in (v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'Inventario no encontrado' using errcode = 'no_data_found';
  end if;
  if v_inv.locked_at is not null then
    raise exception 'El inventario ya está confirmado por las dos partes' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.inventory_items where inventory_id = v_inv.id) then
    raise exception 'Añade al menos un elemento antes de confirmar' using errcode = 'check_violation';
  end if;

  v_other := case when v_actor = v_contract.landlord_id then v_contract.tenant_id else v_contract.landlord_id end;
  v_label := case when v_inv.stage = 'entry' then 'de entrada' else 'de salida' end;
  if v_actor = v_contract.landlord_id then
    if v_inv.landlord_confirmed_at is not null then
      raise exception 'Ya has confirmado este inventario' using errcode = 'check_violation';
    end if;
    v_inv.landlord_confirmed_at := now();
  else
    if v_inv.tenant_confirmed_at is not null then
      raise exception 'Ya has confirmado este inventario' using errcode = 'check_violation';
    end if;
    v_inv.tenant_confirmed_at := now();
  end if;

  if v_inv.landlord_confirmed_at is not null and v_inv.tenant_confirmed_at is not null then
    v_inv.locked_at := now();
    insert into public.notifications (user_id, kind, title, body, url)
    select u, 'inventory_confirmed', 'Inventario ' || v_label || ' confirmado',
           case when v_inv.stage = 'entry'
                then 'Los dos habéis confirmado el estado de la vivienda. Ya no se puede cambiar.'
                else 'Los dos habéis confirmado el estado de salida. La fianza se devuelve en el plazo de un mes desde la entrega de llaves.' end,
           '/contratos/' || v_contract.id || '/inventario/' || case when v_inv.stage = 'entry' then 'entrada' else 'salida' end
      from unnest(array[v_contract.landlord_id, v_contract.tenant_id]) as u;
  else
    insert into public.notifications (user_id, kind, title, body, url)
    values (v_other, 'inventory_to_confirm', 'Tienes un inventario ' || v_label || ' por revisar',
            'Revisa los elementos y las fotos. Si estás de acuerdo, confírmalo.',
            '/contratos/' || v_contract.id || '/inventario/' || case when v_inv.stage = 'entry' then 'entrada' else 'salida' end);
  end if;

  update public.contract_inventories
     set landlord_confirmed_at = v_inv.landlord_confirmed_at,
         tenant_confirmed_at = v_inv.tenant_confirmed_at,
         locked_at = v_inv.locked_at
   where id = v_inv.id
  returning * into v_inv;
  return v_inv;
end;
$$;

revoke execute on function public.confirm_inventory(uuid) from public, anon;
grant execute on function public.confirm_inventory(uuid) to authenticated;


-- >>> 20261114000100_remove_cohabitation.sql
-- -----------------------------------------------------------------------------
-- Quita la preferencia «solo chicas / solo chicos» (listings.cohabitation).
-- Motivo: riesgo con la Ley 15/2022 (igualdad de trato y no discriminación).
-- Revoca la decisión 41. Al borrar la columna se limpian los anuncios que ya la
-- tenían rellena. Lo que cada anunciante escriba en su descripción sigue siendo
-- libre (el filtro anti-discriminación del texto no se toca).
-- -----------------------------------------------------------------------------
alter table public.listings drop constraint if exists listings_cohabitation_shared;
alter table public.listings drop column if exists cohabitation;
drop type if exists public.cohabitation_preference;


-- >>> 20261116000100_deposit_tracking.sql
-- =============================================================================
-- Seguimiento de la fianza (contratos firmados). Sin tocar dinero: Convivo no
-- cobra, no custodia ni transfiere nada; solo deja constancia.
--
-- Flujo:
--   1. El casero anota que ha DEPOSITADO la fianza (fecha y n.º de resguardo) y,
--      si quiere, sube el resguardo (bucket PRIVADO, solo lo ve él). Las dos
--      partes ven el estado, la fecha y el número; nunca el documento.
--   2. Al terminar la estancia, el inquilino DECLARA la fecha de entrega de
--      llaves y el casero la CONFIRMA. Si no responde en 7 días, se da por
--      confirmada (la hace la tarea diaria o la siguiente acción de cualquiera
--      de las partes), con aviso a los dos y constancia.
--   3. Con las llaves confirmadas corre el plazo de UN MES para devolver la
--      fianza (art. 36.4 LAU): vencimiento = fecha de llaves + 1 mes. La tarea
--      diaria avisa 7 días antes y cuando vence.
--   4. El casero marca la DEVOLUCIÓN (fecha) y el inquilino la confirma o la
--      marca como no recibida.
--
-- Reglas en la BD:
--   - Nadie escribe directamente (sin permisos de escritura): todo va por RPC.
--   - Lo registrado es inmutable una vez anotado o confirmado, para cualquier
--     rol (también service_role): depósito, llaves confirmadas, devolución
--     confirmada.
--   - Cronología append-only (contract_deposit_events), para el paquete de
--     pruebas del inquilino.
--   - Solo contratos FIRMADOS y con fianza mayor que cero.
--   - Al borrar la cuenta de una parte el seguimiento se conserva, igual que el
--     contrato firmado y el inventario.
-- =============================================================================

-- Fecha de hoy en España (los plazos se cuentan por días naturales de allí).
create function private.today_es()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Madrid')::date; $$;

create type public.deposit_status as enum ('pending', 'deposited', 'returned', 'claimed');

create table public.contract_deposits (
  contract_id uuid primary key references public.contracts (id) on delete cascade,
  status public.deposit_status not null default 'pending',
  -- 1. Depósito en el organismo de la comunidad (lo anota el casero).
  deposited_on date,
  receipt_number text constraint contract_deposits_receipt_number_len check (char_length(receipt_number) between 1 and 60),
  receipt_path text,
  deposit_recorded_at timestamptz,
  has_receipt boolean generated always as (receipt_path is not null) stored,
  -- 2. Entrega de llaves: la declara el inquilino y la confirma el casero (o pasa el plazo).
  keys_declared_on date,
  keys_declared_at timestamptz,
  keys_confirmed_at timestamptz,
  keys_confirmation text constraint contract_deposits_keys_confirmation check (keys_confirmation in ('landlord', 'auto')),
  return_due_on date,
  -- 3. Devolución: la marca el casero y la responde el inquilino.
  return_marked_on date,
  return_marked_at timestamptz,
  return_response text constraint contract_deposits_return_response check (return_response in ('confirmed', 'not_received')),
  return_response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_deposits_deposit_complete check (
    (deposited_on is null) = (receipt_number is null) and (deposited_on is null) = (deposit_recorded_at is null)
  ),
  constraint contract_deposits_keys_complete check (
    keys_confirmed_at is null
    or (keys_declared_on is not null and keys_declared_at is not null and keys_confirmation is not null and return_due_on is not null)
  ),
  constraint contract_deposits_return_complete check (
    (return_response is null) or (return_marked_on is not null and return_marked_at is not null and return_response_at is not null)
  ),
  constraint contract_deposits_status_coherent check (
    (status <> 'returned' or return_response = 'confirmed')
    and (status <> 'claimed' or return_response = 'not_received')
  )
);

create trigger contract_deposits_set_updated_at
  before update on public.contract_deposits
  for each row execute function private.set_updated_at();

comment on table public.contract_deposits is
  'Seguimiento de la fianza de un contrato firmado: depósito, entrega de llaves, plazo de devolución y devolución. No mueve dinero.';

-- Cronología de avisos y confirmaciones (append-only).
create table public.contract_deposit_events (
  id bigint generated always as identity primary key,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  kind text not null constraint contract_deposit_events_kind check (kind in (
    'deposit_recorded', 'receipt_attached', 'keys_declared', 'keys_confirmed', 'keys_auto_confirmed',
    'return_closing', 'return_overdue', 'return_marked', 'return_confirmed', 'return_disputed'
  )),
  actor_id uuid references public.profiles (id), -- nulo = el sistema
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index contract_deposit_events_contract_idx on public.contract_deposit_events (contract_id, created_at, id);
-- Los avisos del sistema se registran una sola vez por contrato.
create unique index contract_deposit_events_once
  on public.contract_deposit_events (contract_id, kind)
  where kind in ('keys_auto_confirmed', 'return_closing', 'return_overdue');

comment on table public.contract_deposit_events is
  'Cronología de la fianza (depósito, llaves, avisos, devolución). Solo se inserta, desde las RPC; nadie la modifica ni la borra.';

create function private.deposit_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- borrado en cascada del contrato (solo puede ser un borrador)
  end if;
  raise exception 'La cronología de la fianza no se puede modificar ni borrar' using errcode = 'check_violation';
end;
$$;
create trigger contract_deposit_events_no_update
  before update or delete on public.contract_deposit_events
  for each row execute function private.deposit_events_immutable();
create trigger contract_deposit_events_no_truncate
  before truncate on public.contract_deposit_events
  for each statement execute function private.deposit_events_immutable();

-- Lo registrado no se cambia: ni las partes ni service_role.
create function private.contract_deposits_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() < 2 then
      raise exception 'El seguimiento de la fianza no se puede borrar' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if new.contract_id <> old.contract_id then
    raise exception 'No se puede cambiar el contrato' using errcode = 'check_violation';
  end if;
  if old.status = 'returned' then
    raise exception 'La devolución ya está confirmada: el registro no se puede modificar' using errcode = 'check_violation';
  end if;
  if old.deposit_recorded_at is not null
     and (new.deposited_on is distinct from old.deposited_on
          or new.receipt_number is distinct from old.receipt_number
          or new.deposit_recorded_at is distinct from old.deposit_recorded_at) then
    raise exception 'El depósito ya está anotado y no se puede modificar' using errcode = 'check_violation';
  end if;
  if old.receipt_path is not null and new.receipt_path is distinct from old.receipt_path then
    raise exception 'El resguardo ya está subido y no se puede sustituir' using errcode = 'check_violation';
  end if;
  if old.keys_confirmed_at is not null
     and (new.keys_declared_on is distinct from old.keys_declared_on
          or new.keys_declared_at is distinct from old.keys_declared_at
          or new.keys_confirmed_at is distinct from old.keys_confirmed_at
          or new.keys_confirmation is distinct from old.keys_confirmation
          or new.return_due_on is distinct from old.return_due_on) then
    raise exception 'La entrega de llaves ya está confirmada y no se puede modificar' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger contract_deposits_guard
  before update or delete on public.contract_deposits
  for each row execute function private.contract_deposits_guard();

-- -----------------------------------------------------------------------------
-- RLS. Las partes leen (sin la ruta del resguardo: el documento solo lo ve el
-- casero) y nadie escribe directamente.
-- -----------------------------------------------------------------------------
alter table public.contract_deposits enable row level security;
revoke all on public.contract_deposits from anon, authenticated;
grant select (
  contract_id, status, deposited_on, receipt_number, deposit_recorded_at, has_receipt,
  keys_declared_on, keys_declared_at, keys_confirmed_at, keys_confirmation, return_due_on,
  return_marked_on, return_marked_at, return_response, return_response_at, created_at, updated_at
) on public.contract_deposits to authenticated;

create policy contract_deposits_select_party on public.contract_deposits
  for select to authenticated
  using ((select private.is_contract_party(contract_id)) or (select private.is_admin()));

alter table public.contract_deposit_events enable row level security;
revoke all on public.contract_deposit_events from anon, authenticated;
grant select on public.contract_deposit_events to authenticated;

create policy contract_deposit_events_select_party on public.contract_deposit_events
  for select to authenticated
  using ((select private.is_contract_party(contract_id)) or (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Storage: bucket privado para el resguardo. Solo el casero lo lee y lo sube, y
-- solo mientras no haya otro resguardo asociado. Ruta: {contract_id}/{uuid}.{ext}
-- -----------------------------------------------------------------------------
create function private.deposit_receipt_access(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_name is null or p_name !~ ('^' || v_uuid || '/' || v_uuid || '\.(pdf|jpg|png|webp)$') then
    return false;
  end if;
  return exists (
    select 1 from public.contracts c
     where c.id = split_part(p_name, '/', 1)::uuid
       and c.landlord_id = (select auth.uid())
       and c.status = 'signed'
  ) and (
    not p_write or not exists (
      select 1 from public.contract_deposits d
       where d.contract_id = split_part(p_name, '/', 1)::uuid
         and (d.receipt_path is not null or d.status = 'returned')
    )
  );
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deposit-receipts', 'deposit-receipts', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy deposit_receipts_select_landlord on storage.objects
  for select to authenticated
  using (bucket_id = 'deposit-receipts' and (select private.deposit_receipt_access(name, false)));

create policy deposit_receipts_insert_landlord on storage.objects
  for insert to authenticated
  with check (bucket_id = 'deposit-receipts' and (select private.deposit_receipt_access(name, true)));

create policy deposit_receipts_delete_landlord on storage.objects
  for delete to authenticated
  using (bucket_id = 'deposit-receipts' and (select private.deposit_receipt_access(name, true)));

-- -----------------------------------------------------------------------------
-- Avisos in-app
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications
  add constraint notifications_kind check (kind in (
    'review_window_opened', 'review_window_closing', 'report_decision', 'content_removed',
    'contract_to_sign', 'contract_signed', 'contract_cancelled',
    'inventory_to_confirm', 'inventory_confirmed',
    'deposit_recorded', 'deposit_keys_declared', 'deposit_keys_confirmed',
    'deposit_return_closing', 'deposit_return_overdue',
    'deposit_return_marked', 'deposit_return_confirmed', 'deposit_return_disputed'
  ));

-- -----------------------------------------------------------------------------
-- Helpers internos
-- -----------------------------------------------------------------------------

-- Valida que quien llama es parte de un contrato FIRMADO con fianza y crea la
-- fila de seguimiento si no existe. Devuelve el contrato (bloqueado).
create function private.deposit_prepare(p_contract_id uuid)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
begin
  select * into v_c from public.contracts where id = p_contract_id for update;
  if v_c.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Contrato no encontrado' using errcode = 'no_data_found';
  end if;
  if v_c.status <> 'signed' then
    raise exception 'El seguimiento de la fianza empieza cuando los dos habéis firmado el contrato' using errcode = 'check_violation';
  end if;
  if not (coalesce(v_c.terms ->> 'deposit', '') ~ '^[0-9]+(\.[0-9]+)?$') or (v_c.terms ->> 'deposit')::numeric <= 0 then
    raise exception 'Este contrato no tiene fianza' using errcode = 'check_violation';
  end if;
  insert into public.contract_deposits (contract_id) values (v_c.id) on conflict (contract_id) do nothing;
  return v_c;
end;
$$;

-- Da por confirmada la entrega de llaves si han pasado 7 días sin respuesta del
-- casero. Idempotente. Avisa a los dos y deja constancia. Devuelve true si la
-- ha confirmado ahora.
create function private.deposit_auto_confirm(p_contract_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.contract_deposits%rowtype;
  v_c public.contracts%rowtype;
  v_due date;
  v_confirmed_at timestamptz;
begin
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.contract_id is null or v_d.keys_declared_at is null or v_d.keys_confirmed_at is not null
     or v_d.keys_declared_at + interval '7 days' > now() then
    return false;
  end if;
  select * into v_c from public.contracts where id = p_contract_id;
  v_due := (v_d.keys_declared_on + interval '1 month')::date;
  v_confirmed_at := v_d.keys_declared_at + interval '7 days';

  update public.contract_deposits
     set keys_confirmed_at = v_confirmed_at, keys_confirmation = 'auto', return_due_on = v_due
   where contract_id = p_contract_id;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'keys_auto_confirmed', null,
          jsonb_build_object('keys_on', v_d.keys_declared_on, 'return_due_on', v_due, 'deemed_at', v_confirmed_at));

  insert into public.notifications (user_id, kind, title, body, url)
  select u, 'deposit_keys_confirmed', 'Entrega de llaves dada por confirmada',
         'Han pasado 7 días sin respuesta, así que se da por confirmada la entrega de llaves del '
           || to_char(v_d.keys_declared_on, 'DD/MM/YYYY') || '. El plazo de un mes para devolver la fianza termina el '
           || to_char(v_due, 'DD/MM/YYYY') || '.',
         '/contratos/' || p_contract_id
    from unnest(array[v_c.landlord_id, v_c.tenant_id]) as u;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------

-- 1. El casero anota el depósito (y, si quiere, el resguardo).
create function public.record_deposit(
  p_contract_id uuid, p_deposited_on date, p_receipt_number text, p_receipt_path text default null
)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
  v_number text := btrim(coalesce(p_receipt_number, ''));
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda anota el depósito de la fianza' using errcode = 'insufficient_privilege';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.status <> 'pending' then
    raise exception 'La fianza ya consta como depositada' using errcode = 'check_violation';
  end if;
  if p_deposited_on is null or p_deposited_on > private.today_es() or p_deposited_on < date '2020-01-01' then
    raise exception 'La fecha del depósito no es válida (no puede ser futura)' using errcode = 'check_violation';
  end if;
  if char_length(v_number) not between 1 and 60 then
    raise exception 'Escribe el número de resguardo (hasta 60 caracteres)' using errcode = 'check_violation';
  end if;
  if p_receipt_path is not null and p_receipt_path !~ ('^' || p_contract_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$') then
    raise exception 'Resguardo no válido para este contrato' using errcode = 'check_violation';
  end if;

  update public.contract_deposits
     set status = 'deposited', deposited_on = p_deposited_on, receipt_number = v_number,
         receipt_path = p_receipt_path, deposit_recorded_at = now()
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'deposit_recorded', v_actor,
          jsonb_build_object('deposited_on', p_deposited_on, 'receipt_number', v_number, 'has_receipt', p_receipt_path is not null));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'deposit_recorded', 'Tu fianza consta como depositada',
          'La fecha de depósito es el ' || to_char(p_deposited_on, 'DD/MM/YYYY') || ' y el número de resguardo, ' || v_number || '.',
          '/contratos/' || p_contract_id);
  return v_d;
end;
$$;

-- 1b. El casero sube el resguardo después (una sola vez).
create function public.attach_deposit_receipt(p_contract_id uuid, p_receipt_path text)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda sube el resguardo' using errcode = 'insufficient_privilege';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.deposit_recorded_at is null then
    raise exception 'Primero anota la fecha y el número de resguardo' using errcode = 'check_violation';
  end if;
  if v_d.receipt_path is not null then
    raise exception 'El resguardo ya está subido y no se puede sustituir' using errcode = 'check_violation';
  end if;
  if p_receipt_path is null or p_receipt_path !~ ('^' || p_contract_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$') then
    raise exception 'Resguardo no válido para este contrato' using errcode = 'check_violation';
  end if;
  update public.contract_deposits set receipt_path = p_receipt_path where contract_id = p_contract_id returning * into v_d;
  insert into public.contract_deposit_events (contract_id, kind, actor_id) values (p_contract_id, 'receipt_attached', v_actor);
  return v_d;
end;
$$;

-- Ruta del resguardo, solo para el casero (el inquilino no ve el documento).
create function public.deposit_receipt_path(p_contract_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.receipt_path
    from public.contract_deposits d
    join public.contracts c on c.id = d.contract_id
   where d.contract_id = p_contract_id and c.landlord_id = (select auth.uid());
$$;

-- 2. El inquilino declara la fecha de entrega de llaves (con la estancia terminada).
create function public.declare_keys_handover(p_contract_id uuid, p_keys_on date)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
  v_stay_status public.stay_status;
  v_start date;
  v_end date;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.tenant_id then
    raise exception 'Solo quien alquila declara la entrega de llaves' using errcode = 'insufficient_privilege';
  end if;
  -- Si el casero no respondió a una declaración anterior en 7 días, ya se dio por confirmada.
  if private.deposit_auto_confirm(p_contract_id) then
    select * into v_d from public.contract_deposits where contract_id = p_contract_id;
    return v_d;
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.keys_confirmed_at is not null then
    raise exception 'La entrega de llaves ya está confirmada y no se puede cambiar' using errcode = 'check_violation';
  end if;
  if v_d.status not in ('pending', 'deposited') then
    raise exception 'La devolución de la fianza ya está en marcha' using errcode = 'check_violation';
  end if;

  v_start := nullif(v_c.terms ->> 'start_date', '')::date;
  v_end := nullif(v_c.terms ->> 'end_date', '')::date;
  select s.status into v_stay_status from public.stays s where s.id = v_c.stay_id;
  if not (v_stay_status = 'ended' or (v_end is not null and v_end <= private.today_es())) then
    raise exception 'Podrás declarar la entrega de llaves cuando la estancia haya terminado (márcala como terminada en la conversación)'
      using errcode = 'check_violation';
  end if;
  if p_keys_on is null or p_keys_on > private.today_es() or (v_start is not null and p_keys_on < v_start) then
    raise exception 'La fecha de entrega de llaves no es válida (no puede ser futura ni anterior al inicio del contrato)'
      using errcode = 'check_violation';
  end if;

  update public.contract_deposits
     set keys_declared_on = p_keys_on, keys_declared_at = now()
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'keys_declared', v_actor, jsonb_build_object('keys_on', p_keys_on));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.landlord_id, 'deposit_keys_declared', 'Confirma la entrega de llaves',
          'Tu inquilino declara que entregó las llaves el ' || to_char(p_keys_on, 'DD/MM/YYYY')
            || '. Si no respondes en 7 días, se dará por confirmada y empezará a correr el plazo de un mes para devolver la fianza.',
          '/contratos/' || p_contract_id);
  return v_d;
end;
$$;

-- 2b. El casero confirma la entrega de llaves: empieza el plazo de un mes.
create function public.confirm_keys_handover(p_contract_id uuid)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
  v_due date;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda confirma la entrega de llaves' using errcode = 'insufficient_privilege';
  end if;
  if private.deposit_auto_confirm(p_contract_id) then
    select * into v_d from public.contract_deposits where contract_id = p_contract_id;
    return v_d;
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.keys_declared_at is null then
    raise exception 'Todavía no hay una entrega de llaves declarada' using errcode = 'check_violation';
  end if;
  if v_d.keys_confirmed_at is not null then
    raise exception 'La entrega de llaves ya está confirmada' using errcode = 'check_violation';
  end if;

  v_due := (v_d.keys_declared_on + interval '1 month')::date;
  update public.contract_deposits
     set keys_confirmed_at = now(), keys_confirmation = 'landlord', return_due_on = v_due
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'keys_confirmed', v_actor, jsonb_build_object('keys_on', v_d.keys_declared_on, 'return_due_on', v_due));
  insert into public.notifications (user_id, kind, title, body, url)
  select u, 'deposit_keys_confirmed', 'Entrega de llaves confirmada',
         'Entrega de llaves del ' || to_char(v_d.keys_declared_on, 'DD/MM/YYYY')
           || '. El plazo de un mes para devolver la fianza termina el ' || to_char(v_due, 'DD/MM/YYYY') || '.',
         '/contratos/' || p_contract_id
    from unnest(array[v_c.landlord_id, v_c.tenant_id]) as u;
  return v_d;
end;
$$;

-- 3. El casero marca la devolución.
create function public.mark_deposit_returned(p_contract_id uuid, p_returned_on date)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda marca la devolución de la fianza' using errcode = 'insufficient_privilege';
  end if;
  perform private.deposit_auto_confirm(p_contract_id);
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.keys_confirmed_at is null then
    raise exception 'La devolución se marca cuando la entrega de llaves está confirmada' using errcode = 'check_violation';
  end if;
  if v_d.status = 'returned' then
    raise exception 'La devolución ya está confirmada' using errcode = 'check_violation';
  end if;
  if v_d.return_marked_at is not null and v_d.return_response is null then
    raise exception 'Ya has marcado la devolución: falta que la confirme el inquilino' using errcode = 'check_violation';
  end if;
  if p_returned_on is null or p_returned_on > private.today_es() or p_returned_on < v_d.keys_declared_on then
    raise exception 'La fecha de devolución no es válida (no puede ser futura ni anterior a la entrega de llaves)'
      using errcode = 'check_violation';
  end if;

  update public.contract_deposits
     set return_marked_on = p_returned_on, return_marked_at = now(), return_response = null, return_response_at = null,
         status = case when v_d.deposited_on is not null then 'deposited'::public.deposit_status else 'pending'::public.deposit_status end
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'return_marked', v_actor, jsonb_build_object('returned_on', p_returned_on));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'deposit_return_marked', 'Tu casero dice que te ha devuelto la fianza',
          'Fecha de devolución: ' || to_char(p_returned_on, 'DD/MM/YYYY') || '. Confirma si la has recibido o indica que no.',
          '/contratos/' || p_contract_id);
  return v_d;
end;
$$;

-- 3b. El inquilino confirma la devolución o dice que no la ha recibido.
create function public.respond_deposit_return(p_contract_id uuid, p_received boolean)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.tenant_id then
    raise exception 'Solo quien alquila confirma si ha recibido la fianza' using errcode = 'insufficient_privilege';
  end if;
  if p_received is null then
    raise exception 'Indica si has recibido la fianza' using errcode = 'check_violation';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.return_marked_at is null or v_d.return_response is not null then
    raise exception 'No hay una devolución pendiente de confirmar' using errcode = 'check_violation';
  end if;

  update public.contract_deposits
     set return_response = case when p_received then 'confirmed' else 'not_received' end,
         return_response_at = now(),
         status = case when p_received then 'returned'::public.deposit_status else 'claimed'::public.deposit_status end
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, case when p_received then 'return_confirmed' else 'return_disputed' end, v_actor,
          jsonb_build_object('returned_on', v_d.return_marked_on));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.landlord_id,
          case when p_received then 'deposit_return_confirmed' else 'deposit_return_disputed' end,
          case when p_received then 'Tu inquilino confirma que ha recibido la fianza'
               else 'Tu inquilino indica que no ha recibido la fianza' end,
          case when p_received then 'La devolución queda confirmada y el registro ya no se puede cambiar.'
               else 'Revisa la devolución con él. Cuando la hayas hecho, puedes volver a marcarla.' end,
          '/contratos/' || p_contract_id);
  return v_d;
end;
$$;

revoke execute on function
  public.record_deposit(uuid, date, text, text), public.attach_deposit_receipt(uuid, text), public.deposit_receipt_path(uuid),
  public.declare_keys_handover(uuid, date), public.confirm_keys_handover(uuid),
  public.mark_deposit_returned(uuid, date), public.respond_deposit_return(uuid, boolean)
  from public, anon;
grant execute on function
  public.record_deposit(uuid, date, text, text), public.attach_deposit_receipt(uuid, text), public.deposit_receipt_path(uuid),
  public.declare_keys_handover(uuid, date), public.confirm_keys_handover(uuid),
  public.mark_deposit_returned(uuid, date), public.respond_deposit_return(uuid, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Tarea diaria (solo service_role): da por confirmadas las entregas de llaves sin
-- respuesta en 7 días y avisa 7 días antes de que venza el plazo de devolución y
-- cuando vence. Idempotente (un aviso por contrato). Devuelve a quién hay que
-- mandarle el email.
-- -----------------------------------------------------------------------------
create function public.deposit_timers_run()
returns table (contract_id uuid, user_id uuid, kind text, party text, keys_on date, due_on date, listing_title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_today date := private.today_es();
  v_title text;
begin
  -- 1. Llaves sin respuesta del casero.
  for r in
    select d.contract_id as cid, d.keys_declared_on, c.landlord_id, c.tenant_id, c.listing_id
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_declared_at is not null and d.keys_confirmed_at is null
       and d.keys_declared_at + interval '7 days' <= now()
  loop
    if private.deposit_auto_confirm(r.cid) then
      select l.title into v_title from public.listings l where l.id = r.listing_id;
      return query
        select r.cid, r.landlord_id, 'keys_auto_confirmed'::text, 'landlord'::text, r.keys_declared_on,
               (select d.return_due_on from public.contract_deposits d where d.contract_id = r.cid), coalesce(v_title, 'tu alquiler');
      return query
        select r.cid, r.tenant_id, 'keys_auto_confirmed'::text, 'tenant'::text, r.keys_declared_on,
               (select d.return_due_on from public.contract_deposits d where d.contract_id = r.cid), coalesce(v_title, 'tu alquiler');
    end if;
  end loop;

  -- 2. Plazo de devolución a punto de vencer (7 días antes) y vencido.
  for r in
    select d.contract_id as cid, d.keys_declared_on, d.return_due_on, c.landlord_id, c.tenant_id, c.listing_id,
           case when v_today > d.return_due_on then 'return_overdue' else 'return_closing' end as due_kind
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_confirmed_at is not null and d.status <> 'returned'
       and (d.return_marked_at is null or d.return_response = 'not_received')
       and v_today >= d.return_due_on - 7
  loop
    begin
      insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
      values (r.cid, r.due_kind, null, jsonb_build_object('return_due_on', r.return_due_on));
    exception when unique_violation then
      continue; -- ya avisado
    end;
    select l.title into v_title from public.listings l where l.id = r.listing_id;
    v_title := coalesce(v_title, 'tu alquiler');

    insert into public.notifications (user_id, kind, title, body, url)
    values
      (r.landlord_id, 'deposit_' || r.due_kind,
       case when r.due_kind = 'return_overdue' then 'Ha vencido el plazo para devolver la fianza'
            else 'Se acerca el plazo para devolver la fianza' end,
       case when r.due_kind = 'return_overdue'
            then 'El plazo de un mes terminó el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '. Si ya la has devuelto, márcalo en el contrato.'
            else 'Tienes hasta el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || ' para devolver la fianza (un mes desde la entrega de llaves).' end,
       '/contratos/' || r.cid),
      (r.tenant_id, 'deposit_' || r.due_kind,
       case when r.due_kind = 'return_overdue' then 'Ha vencido el plazo para que te devuelvan la fianza'
            else 'Se acerca el plazo para que te devuelvan la fianza' end,
       case when r.due_kind = 'return_overdue'
            then 'El plazo de un mes terminó el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '. Puedes descargar el paquete de pruebas desde el contrato.'
            else 'El plazo de un mes termina el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '.' end,
       '/contratos/' || r.cid);

    return query select r.cid, r.landlord_id, r.due_kind, 'landlord'::text, r.keys_declared_on, r.return_due_on, v_title;
    return query select r.cid, r.tenant_id, r.due_kind, 'tenant'::text, r.keys_declared_on, r.return_due_on, v_title;
  end loop;
end;
$$;
revoke execute on function public.deposit_timers_run() from public, anon, authenticated;
grant execute on function public.deposit_timers_run() to service_role;


-- >>> 20261117000100_deposit_settlement.sql
-- =============================================================================
-- Fianza: liquidación de salida (2 de 2) + ajuste de la entrega de llaves.
--
-- Convivo solo DOCUMENTA: no media, no propone cifras, no decide quién tiene
-- razón y no toca dinero.
--
-- A) Entrega de llaves: se ELIMINA la confirmación automática a los 7 días. La
--    entrega solo queda confirmada si la confirma el casero. Si no responde, la
--    fecha consta como «declarada por el inquilino, sin confirmar» (con su fecha
--    y hora de registro), el casero recibe recordatorios y, pasado un mes desde
--    la fecha declarada, el inquilino puede descargar el paquete de pruebas
--    (que dice de forma expresa que la fecha no la confirmó el casero).
--    La BD ya no admite la confirmación automática (ni en la columna ni en la
--    cronología); la web de pruebas no tenía ningún registro con ella.
--
-- B) Liquidación de salida: con el inventario de salida bloqueado, el casero
--    abre la liquidación (lista de partidas: concepto, importe y, si procede, el
--    elemento del inventario). Solo se pueden vincular a un elemento los DAÑOS
--    NUEVOS (la entrada no estaba dañado y la salida sí); el desgaste por el uso
--    normal no es descontable. El casero la envía; el inquilino responde partida
--    por partida (acepto / no acepto, con comentario) y las dos partes la
--    confirman al final. Estados: draft (en preparación), sent (enviada),
--    agreed (de acuerdo) y disputed (con discrepancias). Confirmada por las dos
--    partes queda BLOQUEADA, inmutable para cualquier rol (también service_role).
--
-- C) La devolución admite anotar el importe devuelto (informativo).
--
-- Todo evento va a la cronología append-only existente (contract_deposit_events).
-- Nadie escribe directamente: todo va por RPC. Se conserva al borrar la cuenta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cronología: nuevos tipos de evento
-- -----------------------------------------------------------------------------
alter table public.contract_deposit_events drop constraint contract_deposit_events_kind;
alter table public.contract_deposit_events
  add constraint contract_deposit_events_kind check (kind in (
    'deposit_recorded', 'receipt_attached', 'keys_declared', 'keys_confirmed',
    'keys_reminder', 'keys_unconfirmed_due',
    'return_closing', 'return_overdue', 'return_marked', 'return_confirmed', 'return_disputed',
    'settlement_opened', 'settlement_sent', 'settlement_answered', 'settlement_reopened',
    'settlement_confirmed', 'settlement_locked'
  ));

drop index public.contract_deposit_events_once;
create unique index contract_deposit_events_once
  on public.contract_deposit_events (contract_id, kind)
  where kind in ('keys_unconfirmed_due', 'return_closing', 'return_overdue');

-- -----------------------------------------------------------------------------
-- Avisos in-app: nuevos tipos
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications
  add constraint notifications_kind check (kind in (
    'review_window_opened', 'review_window_closing', 'report_decision', 'content_removed',
    'contract_to_sign', 'contract_signed', 'contract_cancelled',
    'inventory_to_confirm', 'inventory_confirmed',
    'deposit_recorded', 'deposit_keys_declared', 'deposit_keys_confirmed',
    'deposit_return_closing', 'deposit_return_overdue',
    'deposit_return_marked', 'deposit_return_confirmed', 'deposit_return_disputed',
    'deposit_keys_reminder', 'deposit_keys_unconfirmed_due',
    'settlement_sent', 'settlement_answered', 'settlement_reopened', 'settlement_to_confirm', 'settlement_locked'
  ));

-- -----------------------------------------------------------------------------
-- A) Entrega de llaves sin confirmación automática
-- -----------------------------------------------------------------------------
create or replace function public.declare_keys_handover(p_contract_id uuid, p_keys_on date)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
  v_stay_status public.stay_status;
  v_start date;
  v_end date;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.tenant_id then
    raise exception 'Solo quien alquila declara la entrega de llaves' using errcode = 'insufficient_privilege';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.keys_confirmed_at is not null then
    raise exception 'La entrega de llaves ya está confirmada y no se puede cambiar' using errcode = 'check_violation';
  end if;
  if v_d.status not in ('pending', 'deposited') then
    raise exception 'La devolución de la fianza ya está en marcha' using errcode = 'check_violation';
  end if;

  v_start := nullif(v_c.terms ->> 'start_date', '')::date;
  v_end := nullif(v_c.terms ->> 'end_date', '')::date;
  select s.status into v_stay_status from public.stays s where s.id = v_c.stay_id;
  if not (v_stay_status = 'ended' or (v_end is not null and v_end <= private.today_es())) then
    raise exception 'Podrás declarar la entrega de llaves cuando la estancia haya terminado (márcala como terminada en la conversación)'
      using errcode = 'check_violation';
  end if;
  if p_keys_on is null or p_keys_on > private.today_es() or (v_start is not null and p_keys_on < v_start) then
    raise exception 'La fecha de entrega de llaves no es válida (no puede ser futura ni anterior al inicio del contrato)'
      using errcode = 'check_violation';
  end if;

  update public.contract_deposits
     set keys_declared_on = p_keys_on, keys_declared_at = now()
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'keys_declared', v_actor, jsonb_build_object('keys_on', p_keys_on));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.landlord_id, 'deposit_keys_declared', 'Confirma la entrega de llaves',
          'Tu inquilino declara que entregó las llaves el ' || to_char(p_keys_on, 'DD/MM/YYYY')
            || '. Confírmalo en el contrato (o habladlo en la conversación si no coincide). Mientras no lo confirmes, constará como declarada por el inquilino y sin confirmar, y te enviaremos recordatorios.',
          '/contratos/' || p_contract_id);
  return v_d;
end;
$$;

create or replace function public.confirm_keys_handover(p_contract_id uuid)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
  v_due date;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda confirma la entrega de llaves' using errcode = 'insufficient_privilege';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.keys_declared_at is null then
    raise exception 'Todavía no hay una entrega de llaves declarada' using errcode = 'check_violation';
  end if;
  if v_d.keys_confirmed_at is not null then
    raise exception 'La entrega de llaves ya está confirmada' using errcode = 'check_violation';
  end if;

  v_due := (v_d.keys_declared_on + interval '1 month')::date;
  update public.contract_deposits
     set keys_confirmed_at = now(), keys_confirmation = 'landlord', return_due_on = v_due
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'keys_confirmed', v_actor, jsonb_build_object('keys_on', v_d.keys_declared_on, 'return_due_on', v_due));
  insert into public.notifications (user_id, kind, title, body, url)
  select u, 'deposit_keys_confirmed', 'Entrega de llaves confirmada',
         'Entrega de llaves del ' || to_char(v_d.keys_declared_on, 'DD/MM/YYYY')
           || ', confirmada por el casero. El plazo de un mes para devolver la fianza termina el ' || to_char(v_due, 'DD/MM/YYYY') || '.',
         '/contratos/' || p_contract_id
    from unnest(array[v_c.landlord_id, v_c.tenant_id]) as u;
  return v_d;
end;
$$;

-- Ya nada da por confirmada una entrega de llaves.
drop function private.deposit_auto_confirm(uuid);
alter table public.contract_deposits drop constraint contract_deposits_keys_confirmation;
alter table public.contract_deposits
  add constraint contract_deposits_keys_confirmation check (keys_confirmation = 'landlord');

-- -----------------------------------------------------------------------------
-- C) Devolución con importe devuelto (informativo)
-- -----------------------------------------------------------------------------
alter table public.contract_deposits
  add column returned_amount numeric(10, 2) constraint contract_deposits_returned_amount check (returned_amount >= 0 and returned_amount <= 1000000);
grant select (returned_amount) on public.contract_deposits to authenticated;

drop function public.mark_deposit_returned(uuid, date);
create function public.mark_deposit_returned(p_contract_id uuid, p_returned_on date, p_returned_amount numeric default null)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda marca la devolución de la fianza' using errcode = 'insufficient_privilege';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.keys_confirmed_at is null then
    raise exception 'La devolución se marca cuando la entrega de llaves está confirmada' using errcode = 'check_violation';
  end if;
  if v_d.status = 'returned' then
    raise exception 'La devolución ya está confirmada' using errcode = 'check_violation';
  end if;
  if v_d.return_marked_at is not null and v_d.return_response is null then
    raise exception 'Ya has marcado la devolución: falta que la confirme el inquilino' using errcode = 'check_violation';
  end if;
  if p_returned_on is null or p_returned_on > private.today_es() or p_returned_on < v_d.keys_declared_on then
    raise exception 'La fecha de devolución no es válida (no puede ser futura ni anterior a la entrega de llaves)'
      using errcode = 'check_violation';
  end if;
  if p_returned_amount is not null and (p_returned_amount < 0 or p_returned_amount > (v_c.terms ->> 'deposit')::numeric) then
    raise exception 'El importe devuelto no puede ser negativo ni superior a la fianza' using errcode = 'check_violation';
  end if;

  update public.contract_deposits
     set return_marked_on = p_returned_on, return_marked_at = now(), return_response = null, return_response_at = null,
         returned_amount = round(p_returned_amount, 2),
         status = case when v_d.deposited_on is not null then 'deposited'::public.deposit_status else 'pending'::public.deposit_status end
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'return_marked', v_actor,
          jsonb_build_object('returned_on', p_returned_on, 'returned_amount', v_d.returned_amount));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'deposit_return_marked', 'Tu casero dice que te ha devuelto la fianza',
          'Fecha de devolución: ' || to_char(p_returned_on, 'DD/MM/YYYY')
            || case when v_d.returned_amount is not null then ' · importe indicado: ' || to_char(v_d.returned_amount, 'FM999999990.00') || ' €' else '' end
            || '. Confirma si la has recibido o indica que no.',
          '/contratos/' || p_contract_id);
  return v_d;
end;
$$;

-- -----------------------------------------------------------------------------
-- B) Liquidación de salida
-- -----------------------------------------------------------------------------
create type public.settlement_status as enum ('draft', 'sent', 'agreed', 'disputed');

create table public.contract_settlements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references public.contracts (id) on delete cascade,
  exit_inventory_id uuid not null references public.contract_inventories (id) on delete cascade,
  status public.settlement_status not null default 'draft',
  deposit_amount numeric(10, 2) not null constraint contract_settlements_deposit_positive check (deposit_amount > 0),
  created_by uuid references public.profiles (id),
  sent_at timestamptz,
  sent_hash text,
  responded_at timestamptz,
  landlord_confirmed_at timestamptz,
  tenant_confirmed_at timestamptz,
  locked_at timestamptz,
  final_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_settlements_sent_complete check (status = 'draft' or (sent_at is not null and sent_hash is not null)),
  constraint contract_settlements_locked_complete check (
    locked_at is null
    or (landlord_confirmed_at is not null and tenant_confirmed_at is not null and final_hash is not null and status in ('agreed', 'disputed'))
  )
);

create trigger contract_settlements_set_updated_at
  before update on public.contract_settlements
  for each row execute function private.set_updated_at();

create table public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.contract_settlements (id) on delete cascade,
  sort_order int not null default 1,
  concept text not null constraint settlement_items_concept_len check (char_length(btrim(concept)) between 1 and 120),
  amount numeric(10, 2) not null constraint settlement_items_amount check (amount > 0 and amount <= 1000000),
  inventory_item_id uuid references public.inventory_items (id),
  tenant_response text constraint settlement_items_response check (tenant_response in ('accepted', 'rejected')),
  tenant_comment text constraint settlement_items_comment_len check (char_length(tenant_comment) <= 500),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_items_response_complete check ((tenant_response is null) = (responded_at is null)),
  constraint settlement_items_reject_comment check (tenant_response is distinct from 'rejected' or char_length(btrim(coalesce(tenant_comment, ''))) >= 3)
);
create index settlement_items_settlement_idx on public.settlement_items (settlement_id, sort_order, id);
create unique index settlement_items_one_per_element on public.settlement_items (settlement_id, inventory_item_id) where inventory_item_id is not null;

create trigger settlement_items_set_updated_at
  before update on public.settlement_items
  for each row execute function private.set_updated_at();

comment on table public.contract_settlements is
  'Liquidación de salida de la fianza: partidas del casero y respuesta del inquilino. Solo documenta; confirmada por las dos partes queda bloqueada.';
comment on table public.settlement_items is
  'Partidas de la liquidación (concepto, importe y, si procede, el elemento del inventario de salida con daño nuevo).';

-- ¿Es el elemento de salida un DAÑO NUEVO? Dañado a la salida y, en la entrada
-- (mismo elemento por zona y nombre, el último anotado), en un estado que no
-- era «dañado». Sin elemento equivalente en la entrada, no es descontable.
create function private.is_new_damage(p_exit_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.inventory_items x
      join public.contract_inventories xi on xi.id = x.inventory_id and xi.stage = 'exit'
     where x.id = p_exit_item_id
       and x.condition = 'damaged'
       and (
         select e.condition::text
           from public.inventory_items e
           join public.contract_inventories ei on ei.id = e.inventory_id and ei.stage = 'entry' and ei.contract_id = xi.contract_id
          where lower(btrim(e.area)) = lower(btrim(x.area)) and lower(btrim(e.name)) = lower(btrim(x.name))
          order by e.created_at desc, e.id desc
          limit 1
       ) in ('new', 'good', 'worn')
  );
$$;

create function private.is_settlement_party(p_settlement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contract_settlements s
      join public.contracts c on c.id = s.contract_id
     where s.id = p_settlement_id and (select auth.uid()) in (c.landlord_id, c.tenant_id)
  );
$$;

-- Huella SHA-256 de la liquidación (partidas e, opcionalmente, respuestas).
create function private.settlement_hash(p_settlement_id uuid, p_with_answers boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.contract_settlements%rowtype;
  v_text text;
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id;
  select string_agg(
           i.sort_order || '|' || i.id || '|' || i.concept || '|' || to_char(i.amount, 'FM999999990.00') || '|' || coalesce(i.inventory_item_id::text, '')
             || case when p_with_answers then '|' || coalesce(i.tenant_response, '') || '|' || coalesce(i.tenant_comment, '') else '' end,
           E'\n' order by i.sort_order, i.id)
    into v_text
    from public.settlement_items i
   where i.settlement_id = p_settlement_id;
  return encode(
    extensions.digest(
      convert_to(
        'settlement|' || v_s.contract_id || '|' || v_s.exit_inventory_id || '|' || to_char(v_s.deposit_amount, 'FM999999990.00')
          || case when p_with_answers then '|' || v_s.status::text else '' end
          || E'\n' || coalesce(v_text, ''),
        'UTF8'),
      'sha256'),
    'hex');
end;
$$;

-- Guardián de la liquidación: bloqueada = inmutable para cualquier rol.
create function private.contract_settlements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() < 2 then
      raise exception 'La liquidación no se puede borrar' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.locked_at is not null then
    raise exception 'La liquidación está confirmada por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;
  if new.contract_id <> old.contract_id or new.exit_inventory_id <> old.exit_inventory_id or new.deposit_amount <> old.deposit_amount then
    raise exception 'No se puede cambiar el contrato, el inventario ni el importe de la fianza' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger contract_settlements_guard
  before update or delete on public.contract_settlements
  for each row execute function private.contract_settlements_guard();

-- Guardián de las partidas.
create function private.settlement_items_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.contract_settlements%rowtype;
  v_sid uuid := case when tg_op = 'DELETE' then old.settlement_id else new.settlement_id end;
begin
  select * into v_s from public.contract_settlements where id = v_sid;
  if tg_op = 'DELETE' and (v_s.id is null or pg_trigger_depth() > 1) then
    return old; -- borrado en cascada del contrato
  end if;
  if v_s.locked_at is not null then
    raise exception 'La liquidación está confirmada por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    if v_s.status <> 'draft' then
      raise exception 'La liquidación ya está enviada: las partidas no se pueden quitar' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.settlement_id <> old.settlement_id then
    raise exception 'Una partida no se puede mover a otra liquidación' using errcode = 'check_violation';
  end if;

  if v_s.status = 'draft' then
    -- En preparación: se editan las partidas, sin respuestas del inquilino.
    if new.tenant_response is not null or new.tenant_comment is not null or new.responded_at is not null then
      raise exception 'La liquidación todavía no está enviada: no admite respuestas' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' then
      if (select count(*) from public.settlement_items where settlement_id = v_s.id) >= 50 then
        raise exception 'La liquidación admite como mucho 50 partidas' using errcode = 'check_violation';
      end if;
      new.sort_order := coalesce((select max(sort_order) from public.settlement_items where settlement_id = v_s.id), 0) + 1;
    end if;
    new.concept := btrim(new.concept);
    if new.inventory_item_id is not null
       and (tg_op = 'INSERT' or new.inventory_item_id is distinct from old.inventory_item_id) then
      if not exists (select 1 from public.inventory_items where id = new.inventory_item_id and inventory_id = v_s.exit_inventory_id)
         or not private.is_new_damage(new.inventory_item_id) then
        raise exception 'Solo se puede descontar un daño nuevo: el elemento estaba sin daños a la entrada y está dañado a la salida. El desgaste por el uso normal no es descontable'
          using errcode = 'check_violation';
      end if;
    end if;
  else
    -- Enviada: el contenido queda fijo; solo cambian las respuestas.
    if tg_op = 'INSERT' then
      raise exception 'La liquidación ya está enviada: no se pueden añadir partidas' using errcode = 'check_violation';
    end if;
    if new.concept is distinct from old.concept or new.amount is distinct from old.amount
       or new.inventory_item_id is distinct from old.inventory_item_id or new.sort_order is distinct from old.sort_order then
      raise exception 'La liquidación ya está enviada: las partidas no se pueden modificar' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger settlement_items_before_change
  before insert or update or delete on public.settlement_items
  for each row execute function private.settlement_items_before_change();

-- RLS: las partes (y los admins) leen; nadie escribe directamente.
alter table public.contract_settlements enable row level security;
revoke all on public.contract_settlements from anon, authenticated;
grant select on public.contract_settlements to authenticated;
create policy contract_settlements_select_party on public.contract_settlements
  for select to authenticated
  using ((select private.is_contract_party(contract_id)) or (select private.is_admin()));

alter table public.settlement_items enable row level security;
revoke all on public.settlement_items from anon, authenticated;
grant select on public.settlement_items to authenticated;
create policy settlement_items_select_party on public.settlement_items
  for select to authenticated
  using ((select private.is_settlement_party(settlement_id)) or (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- RPC de la liquidación
-- -----------------------------------------------------------------------------

-- 1. El casero abre la liquidación (con el inventario de salida bloqueado).
create function public.open_settlement(p_contract_id uuid)
returns public.contract_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
  v_inv public.contract_inventories%rowtype;
  v_s public.contract_settlements%rowtype;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda abre la liquidación' using errcode = 'insufficient_privilege';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id;
  if v_d.status = 'returned' then
    raise exception 'La devolución de la fianza ya está confirmada' using errcode = 'check_violation';
  end if;
  select * into v_inv from public.contract_inventories where contract_id = p_contract_id and stage = 'exit' and locked_at is not null;
  if v_inv.id is null then
    raise exception 'La liquidación se abre cuando los dos habéis confirmado el inventario de salida' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.contract_settlements where contract_id = p_contract_id) then
    raise exception 'La liquidación ya está abierta' using errcode = 'check_violation';
  end if;

  insert into public.contract_settlements (contract_id, exit_inventory_id, deposit_amount, created_by)
  values (p_contract_id, v_inv.id, round((v_c.terms ->> 'deposit')::numeric, 2), v_actor)
  returning * into v_s;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'settlement_opened', v_actor, jsonb_build_object('deposit_amount', v_s.deposit_amount));
  return v_s;
end;
$$;

-- 2. El casero añade o corrige una partida (solo en preparación).
create function public.save_settlement_item(
  p_settlement_id uuid, p_item_id uuid, p_concept text, p_amount numeric, p_inventory_item_id uuid default null
)
returns public.settlement_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
  v_i public.settlement_items%rowtype;
  v_concept text := btrim(coalesce(p_concept, ''));
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_s.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Liquidación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda prepara las partidas' using errcode = 'insufficient_privilege';
  end if;
  if v_s.locked_at is not null then
    raise exception 'La liquidación está confirmada por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;
  if v_s.status <> 'draft' then
    raise exception 'La liquidación ya está enviada: reábrela para cambiar las partidas' using errcode = 'check_violation';
  end if;
  if char_length(v_concept) not between 1 and 120 then
    raise exception 'Escribe el concepto de la partida (hasta 120 caracteres)' using errcode = 'check_violation';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'El importe de la partida tiene que ser mayor que cero' using errcode = 'check_violation';
  end if;

  if p_item_id is null then
    insert into public.settlement_items (settlement_id, concept, amount, inventory_item_id)
    values (v_s.id, v_concept, round(p_amount, 2), p_inventory_item_id)
    returning * into v_i;
  else
    update public.settlement_items
       set concept = v_concept, amount = round(p_amount, 2), inventory_item_id = p_inventory_item_id
     where id = p_item_id and settlement_id = v_s.id
    returning * into v_i;
    if v_i.id is null then
      raise exception 'Partida no encontrada' using errcode = 'no_data_found';
    end if;
  end if;
  return v_i;
end;
$$;

create function public.delete_settlement_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_i public.settlement_items%rowtype;
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
begin
  select * into v_i from public.settlement_items where id = p_item_id;
  select * into v_s from public.contract_settlements where id = v_i.settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_i.id is null or v_actor is null or v_actor <> v_c.landlord_id then
    raise exception 'Partida no encontrada' using errcode = 'no_data_found';
  end if;
  if v_s.locked_at is not null or v_s.status <> 'draft' then
    raise exception 'La liquidación ya está enviada: reábrela para cambiar las partidas' using errcode = 'check_violation';
  end if;
  delete from public.settlement_items where id = p_item_id;
end;
$$;

-- 3. El casero envía la liquidación al inquilino.
create function public.send_settlement(p_settlement_id uuid)
returns public.contract_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
  v_n int;
  v_total numeric;
  v_status public.settlement_status;
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_s.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Liquidación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda envía la liquidación' using errcode = 'insufficient_privilege';
  end if;
  if v_s.status <> 'draft' then
    raise exception 'La liquidación ya está enviada' using errcode = 'check_violation';
  end if;
  select count(*), coalesce(sum(amount), 0) into v_n, v_total from public.settlement_items where settlement_id = v_s.id;
  -- Sin partidas no hay nada que responder: consta directamente «de acuerdo».
  v_status := case when v_n = 0 then 'agreed'::public.settlement_status else 'sent'::public.settlement_status end;

  update public.contract_settlements
     set status = v_status, sent_at = now(), sent_hash = private.settlement_hash(v_s.id, false),
         responded_at = case when v_n = 0 then now() else null end,
         landlord_confirmed_at = null, tenant_confirmed_at = null
   where id = v_s.id
  returning * into v_s;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (v_c.id, 'settlement_sent', v_actor,
          jsonb_build_object('items', v_n, 'total', v_total, 'deposit_amount', v_s.deposit_amount, 'hash', v_s.sent_hash));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'settlement_sent',
          case when v_n = 0 then 'Tu casero propone la liquidación de la fianza, sin descuentos' else 'Tu casero te envía la liquidación de la fianza' end,
          case when v_n = 0 then 'No hay partidas. Revísala y confírmala si estás de acuerdo.'
               else v_n || case when v_n = 1 then ' partida' else ' partidas' end || ' por un total de ' || to_char(v_total, 'FM999999990.00')
                 || ' €. Responde a cada una (acepto / no acepto). Convivo solo deja constancia: no media ni decide.' end,
          '/contratos/' || v_c.id || '/fianza/liquidacion');
  return v_s;
end;
$$;

-- 4. El inquilino responde partida por partida. p_responses: [{item_id, response, comment}]
create function public.respond_settlement(p_settlement_id uuid, p_responses jsonb)
returns public.contract_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
  v_el jsonb;
  v_item public.settlement_items%rowtype;
  v_total int;
  v_resp text;
  v_comment text;
  v_rejected int := 0;
  v_accepted int := 0;
  v_status public.settlement_status;
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_s.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Liquidación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_actor <> v_c.tenant_id then
    raise exception 'Solo quien alquila responde a las partidas' using errcode = 'insufficient_privilege';
  end if;
  if v_s.locked_at is not null then
    raise exception 'La liquidación está confirmada por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;
  if v_s.status = 'draft' then
    raise exception 'Tu casero todavía no ha enviado la liquidación' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_responses) is distinct from 'array' then
    raise exception 'Respuestas no válidas' using errcode = 'check_violation';
  end if;
  select count(*) into v_total from public.settlement_items where settlement_id = v_s.id;
  if jsonb_array_length(p_responses) <> v_total then
    raise exception 'Responde a todas las partidas' using errcode = 'check_violation';
  end if;

  for v_el in select * from jsonb_array_elements(p_responses) loop
    v_resp := v_el ->> 'response';
    v_comment := btrim(coalesce(v_el ->> 'comment', ''));
    select * into v_item from public.settlement_items where id = (v_el ->> 'item_id')::uuid and settlement_id = v_s.id;
    if v_item.id is null then
      raise exception 'Partida no encontrada' using errcode = 'no_data_found';
    end if;
    if v_resp is null or v_resp not in ('accepted', 'rejected') then
      raise exception 'Indica si aceptas o no la partida «%»', v_item.concept using errcode = 'check_violation';
    end if;
    if char_length(v_comment) > 500 then
      raise exception 'El comentario de la partida «%» es demasiado largo (máximo 500 caracteres)', v_item.concept using errcode = 'check_violation';
    end if;
    if v_resp = 'rejected' and char_length(v_comment) < 3 then
      raise exception 'Explica con unas palabras por qué no aceptas la partida «%»', v_item.concept using errcode = 'check_violation';
    end if;
    update public.settlement_items
       set tenant_response = v_resp, tenant_comment = nullif(v_comment, ''), responded_at = now()
     where id = v_item.id;
    if v_resp = 'rejected' then v_rejected := v_rejected + 1; else v_accepted := v_accepted + 1; end if;
  end loop;
  if exists (select 1 from public.settlement_items where settlement_id = v_s.id and tenant_response is null) then
    raise exception 'Responde a todas las partidas, una sola vez cada una' using errcode = 'check_violation';
  end if;

  v_status := case when v_rejected > 0 then 'disputed'::public.settlement_status else 'agreed'::public.settlement_status end;
  update public.contract_settlements
     set status = v_status, responded_at = now(), landlord_confirmed_at = null, tenant_confirmed_at = null
   where id = v_s.id
  returning * into v_s;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (v_c.id, 'settlement_answered', v_actor,
          jsonb_build_object('accepted', v_accepted, 'rejected', v_rejected, 'status', v_status));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.landlord_id, 'settlement_answered',
          case when v_rejected > 0 then 'Tu inquilino no acepta alguna partida de la liquidación' else 'Tu inquilino acepta la liquidación de la fianza' end,
          case when v_rejected > 0
               then 'Acepta ' || v_accepted || ' y no acepta ' || v_rejected || '. Habladlo en la conversación; podéis reabrir la liquidación para cambiarla o confirmarla tal cual para dejar constancia.'
               else 'Acepta todas las partidas. Falta que los dos la confirméis.' end,
          '/contratos/' || v_c.id || '/fianza/liquidacion');
  return v_s;
end;
$$;

-- 5. El casero reabre la liquidación (vuelve a «en preparación»). Las respuestas
-- anteriores quedan en la cronología (copia de lo que había), no se pierden.
create function public.reopen_settlement(p_settlement_id uuid)
returns public.contract_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
  v_snapshot jsonb;
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_s.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Liquidación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda reabre la liquidación' using errcode = 'insufficient_privilege';
  end if;
  if v_s.locked_at is not null then
    raise exception 'La liquidación está confirmada por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;
  if v_s.status = 'draft' then
    raise exception 'La liquidación ya está en preparación' using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'concept', i.concept, 'amount', i.amount, 'response', i.tenant_response, 'comment', i.tenant_comment) order by i.sort_order, i.id), '[]'::jsonb)
    into v_snapshot from public.settlement_items i where i.settlement_id = v_s.id;

  update public.contract_settlements
     set status = 'draft', sent_at = null, sent_hash = null, responded_at = null,
         landlord_confirmed_at = null, tenant_confirmed_at = null
   where id = v_s.id
  returning * into v_s;
  update public.settlement_items
     set tenant_response = null, tenant_comment = null, responded_at = null
   where settlement_id = v_s.id and (tenant_response is not null or tenant_comment is not null or responded_at is not null);

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (v_c.id, 'settlement_reopened', v_actor, jsonb_build_object('previous', v_snapshot));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'settlement_reopened', 'Tu casero ha reabierto la liquidación',
          'Está en preparación otra vez. Te avisaremos cuando te envíe la nueva versión; tus respuestas anteriores quedan en la cronología.',
          '/contratos/' || v_c.id || '/fianza/liquidacion');
  return v_s;
end;
$$;

-- 6. Cada parte confirma la liquidación ya respondida. Las dos = bloqueada.
create function public.confirm_settlement(p_settlement_id uuid)
returns public.contract_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
  v_is_landlord boolean;
  v_hash text;
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_s.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Liquidación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_s.locked_at is not null then
    raise exception 'La liquidación ya está confirmada por las dos partes' using errcode = 'check_violation';
  end if;
  if v_s.status not in ('agreed', 'disputed') then
    raise exception 'Se confirma cuando el inquilino ha respondido a las partidas' using errcode = 'check_violation';
  end if;
  v_is_landlord := v_actor = v_c.landlord_id;
  if (v_is_landlord and v_s.landlord_confirmed_at is not null) or (not v_is_landlord and v_s.tenant_confirmed_at is not null) then
    raise exception 'Ya has confirmado la liquidación' using errcode = 'check_violation';
  end if;

  if v_is_landlord then
    update public.contract_settlements set landlord_confirmed_at = now() where id = v_s.id returning * into v_s;
  else
    update public.contract_settlements set tenant_confirmed_at = now() where id = v_s.id returning * into v_s;
  end if;
  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (v_c.id, 'settlement_confirmed', v_actor,
          jsonb_build_object('party', case when v_is_landlord then 'landlord' else 'tenant' end, 'status', v_s.status));

  if v_s.landlord_confirmed_at is not null and v_s.tenant_confirmed_at is not null then
    v_hash := private.settlement_hash(v_s.id, true);
    update public.contract_settlements set locked_at = now(), final_hash = v_hash where id = v_s.id returning * into v_s;
    insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
    values (v_c.id, 'settlement_locked', null, jsonb_build_object('status', v_s.status, 'hash', v_hash));
    insert into public.notifications (user_id, kind, title, body, url)
    select u, 'settlement_locked', 'Liquidación de la fianza cerrada',
           case when v_s.status = 'agreed' then 'Los dos habéis confirmado la liquidación, de acuerdo. Ya no se puede cambiar.'
                else 'Los dos habéis confirmado la liquidación, con discrepancias. Ya no se puede cambiar y el resumen sirve como constancia.' end,
           '/contratos/' || v_c.id || '/fianza/liquidacion'
      from unnest(array[v_c.landlord_id, v_c.tenant_id]) as u;
  else
    insert into public.notifications (user_id, kind, title, body, url)
    values (case when v_is_landlord then v_c.tenant_id else v_c.landlord_id end, 'settlement_to_confirm',
            'Falta tu confirmación de la liquidación de la fianza',
            'La otra parte ya la ha confirmado. Revísala y confírmala para dejarla cerrada.',
            '/contratos/' || v_c.id || '/fianza/liquidacion');
  end if;
  return v_s;
end;
$$;

revoke execute on function
  public.mark_deposit_returned(uuid, date, numeric),
  public.open_settlement(uuid), public.save_settlement_item(uuid, uuid, text, numeric, uuid), public.delete_settlement_item(uuid),
  public.send_settlement(uuid), public.respond_settlement(uuid, jsonb), public.reopen_settlement(uuid), public.confirm_settlement(uuid)
  from public, anon;
grant execute on function
  public.mark_deposit_returned(uuid, date, numeric),
  public.open_settlement(uuid), public.save_settlement_item(uuid, uuid, text, numeric, uuid), public.delete_settlement_item(uuid),
  public.send_settlement(uuid), public.respond_settlement(uuid, jsonb), public.reopen_settlement(uuid), public.confirm_settlement(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Tarea diaria (solo service_role): recordatorios al casero, aviso del mes sobre
-- una fecha de llaves sin confirmar, y avisos del plazo de devolución. Ya no da
-- por confirmada ninguna entrega de llaves. Idempotente.
-- -----------------------------------------------------------------------------
create or replace function public.deposit_timers_run()
returns table (contract_id uuid, user_id uuid, kind text, party text, keys_on date, due_on date, listing_title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_today date := private.today_es();
  v_title text;
  -- Días desde la declaración en que se manda cada recordatorio al casero.
  v_schedule constant int[] := array[3, 7, 14, 21, 28, 35, 42, 56];
  v_sent int;
begin
  -- 1. Recordatorios al casero mientras no responda a la fecha de llaves declarada.
  for r in
    select d.contract_id as cid, d.keys_declared_on, d.keys_declared_at, c.landlord_id, c.listing_id
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_declared_at is not null and d.keys_confirmed_at is null and d.status <> 'returned'
  loop
    select count(*) into v_sent from public.contract_deposit_events e
     where e.contract_id = r.cid and e.kind = 'keys_reminder' and e.created_at >= r.keys_declared_at;
    if v_sent < array_length(v_schedule, 1) and now() >= r.keys_declared_at + make_interval(days => v_schedule[v_sent + 1]) then
      insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
      values (r.cid, 'keys_reminder', null, jsonb_build_object('n', v_sent + 1, 'keys_on', r.keys_declared_on));
      select l.title into v_title from public.listings l where l.id = r.listing_id;
      insert into public.notifications (user_id, kind, title, body, url)
      values (r.landlord_id, 'deposit_keys_reminder', 'Recordatorio: confirma la entrega de llaves',
              'Tu inquilino declaró el ' || to_char(r.keys_declared_at at time zone 'Europe/Madrid', 'DD/MM/YYYY')
                || ' que entregó las llaves el ' || to_char(r.keys_declared_on, 'DD/MM/YYYY')
                || '. Mientras no lo confirmes, consta como declarada por el inquilino y sin confirmar. Si no coincide, habladlo en la conversación.',
              '/contratos/' || r.cid);
      return query select r.cid, r.landlord_id, 'keys_reminder'::text, 'landlord'::text, r.keys_declared_on, null::date, coalesce(v_title, 'tu alquiler');
    end if;
  end loop;

  -- 2. Pasado un mes desde la fecha declarada y sin confirmar: se puede descargar
  -- el paquete de pruebas (diciendo expresamente que no la confirmó el casero).
  for r in
    select d.contract_id as cid, d.keys_declared_on, c.landlord_id, c.tenant_id, c.listing_id
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_declared_at is not null and d.keys_confirmed_at is null and d.status <> 'returned'
       and v_today > (d.keys_declared_on + interval '1 month')::date
  loop
    begin
      insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
      values (r.cid, 'keys_unconfirmed_due', null,
              jsonb_build_object('keys_on', r.keys_declared_on, 'due_on', (r.keys_declared_on + interval '1 month')::date));
    exception when unique_violation then
      continue; -- ya avisado
    end;
    select l.title into v_title from public.listings l where l.id = r.listing_id;
    v_title := coalesce(v_title, 'tu alquiler');
    insert into public.notifications (user_id, kind, title, body, url)
    values
      (r.landlord_id, 'deposit_keys_unconfirmed_due', 'Ha pasado un mes desde la fecha de llaves declarada',
       'Tu inquilino declaró que entregó las llaves el ' || to_char(r.keys_declared_on, 'DD/MM/YYYY')
         || ' y tú no lo has confirmado. Confírmalo o habladlo en la conversación. Si la fianza sigue sin devolver, tu inquilino podrá descargar un paquete de pruebas que indica que la fecha no está confirmada por ti.',
       '/contratos/' || r.cid),
      (r.tenant_id, 'deposit_keys_unconfirmed_due', 'Ya puedes descargar el paquete de pruebas',
       'Ha pasado un mes desde la fecha de llaves que declaraste (' || to_char(r.keys_declared_on, 'DD/MM/YYYY')
         || '). Ojo: el casero no la ha confirmado y el paquete lo dirá expresamente. Si ya te devolvió la fianza, no hace falta.',
       '/contratos/' || r.cid);
    return query select r.cid, r.landlord_id, 'keys_unconfirmed_due'::text, 'landlord'::text, r.keys_declared_on, (r.keys_declared_on + interval '1 month')::date, v_title;
    return query select r.cid, r.tenant_id, 'keys_unconfirmed_due'::text, 'tenant'::text, r.keys_declared_on, (r.keys_declared_on + interval '1 month')::date, v_title;
  end loop;

  -- 3. Plazo de devolución a punto de vencer (7 días antes) y vencido (solo con la fecha confirmada).
  for r in
    select d.contract_id as cid, d.keys_declared_on, d.return_due_on, c.landlord_id, c.tenant_id, c.listing_id,
           case when v_today > d.return_due_on then 'return_overdue' else 'return_closing' end as due_kind
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_confirmed_at is not null and d.status <> 'returned'
       and (d.return_marked_at is null or d.return_response = 'not_received')
       and v_today >= d.return_due_on - 7
  loop
    begin
      insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
      values (r.cid, r.due_kind, null, jsonb_build_object('return_due_on', r.return_due_on));
    exception when unique_violation then
      continue; -- ya avisado
    end;
    select l.title into v_title from public.listings l where l.id = r.listing_id;
    v_title := coalesce(v_title, 'tu alquiler');

    insert into public.notifications (user_id, kind, title, body, url)
    values
      (r.landlord_id, 'deposit_' || r.due_kind,
       case when r.due_kind = 'return_overdue' then 'Ha vencido el plazo para devolver la fianza'
            else 'Se acerca el plazo para devolver la fianza' end,
       case when r.due_kind = 'return_overdue'
            then 'El plazo de un mes terminó el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '. Si ya la has devuelto, márcalo en el contrato.'
            else 'Tienes hasta el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || ' para devolver la fianza (un mes desde la entrega de llaves).' end,
       '/contratos/' || r.cid),
      (r.tenant_id, 'deposit_' || r.due_kind,
       case when r.due_kind = 'return_overdue' then 'Ha vencido el plazo para que te devuelvan la fianza'
            else 'Se acerca el plazo para que te devuelvan la fianza' end,
       case when r.due_kind = 'return_overdue'
            then 'El plazo de un mes terminó el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '. Puedes descargar el paquete de pruebas desde el contrato.'
            else 'El plazo de un mes termina el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '.' end,
       '/contratos/' || r.cid);

    return query select r.cid, r.landlord_id, r.due_kind, 'landlord'::text, r.keys_declared_on, r.return_due_on, v_title;
    return query select r.cid, r.tenant_id, r.due_kind, 'tenant'::text, r.keys_declared_on, r.return_due_on, v_title;
  end loop;
end;
$$;


-- >>> 20261118000100_review_personal_data.sql
-- Control previo de datos personales en reseñas y respuestas públicas (respaldo en BD).
--
-- La app ya lo comprueba al escribir y al guardar (src/lib/moderation/personal-data.ts).
-- Como las reseñas son inmutables (no se pueden corregir una vez publicadas) y la
-- API se puede llamar directamente, la BD repite aquí SOLO los patrones más claros:
-- teléfono, email, DNI/NIE e IBAN español. Las direcciones, los canales de contacto
-- y las tarjetas se quedan solo en la app: tienen más riesgo de falso positivo y,
-- si algo se escapa, el canal de denuncias (personal_data oculta la reseña) lo cubre.
--
-- Solo afecta a altas nuevas hechas por un usuario (auth.uid() no nulo). No toca
-- lo ya publicado, ni las inserciones de sistema (seed, service_role).
-- Si cambias un patrón de teléfono, email, DNI/NIE o IBAN en personal-data.ts,
-- revisa esta función.

create function private.contains_personal_data(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := translate(lower(coalesce(p_text, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc');
  v_run text;
  v_digits text;
begin
  -- Email: nombre@dominio.com · nombre arroba dominio · nombre (at) dominio
  if v_text ~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+'
     or v_text ~ '[a-z0-9._-]{2,}\s*(arroba|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*[a-z0-9-]{2,}' then
    return 'email';
  end if;

  -- Teléfono: 9 cifras que empiezan por 6-9 (con o sin 34 / 0034), con espacios, puntos o guiones.
  for v_run in select (regexp_matches(v_text, '\d(?:[ .\-]?\d)*', 'g'))[1] loop
    v_digits := regexp_replace(v_run, '\D', '', 'g');
    if v_digits ~ '^(?:0034|34)?[6-9][0-9]{8}$' then
      return 'phone';
    end if;
  end loop;

  -- DNI y NIE
  if v_text ~ '(^|[^a-z0-9])\d{2}[. ]?\d{3}[. ]?\d{3}[ -]?[trwagmyfpdxbnjzsqvhlcke]($|[^a-z0-9])'
     or v_text ~ '(^|[^a-z0-9])[xyz][ .-]?\d{7}[ .-]?[a-z]($|[^a-z0-9])' then
    return 'id';
  end if;

  -- IBAN español
  if v_text ~ '(^|[^a-z0-9])es\d{2}([ -]?\d){20}($|[^0-9])' then
    return 'payment';
  end if;

  return null;
end;
$$;

create function private.reviews_personal_data_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and private.contains_personal_data(new.body) is not null then
    raise exception 'El texto no puede incluir teléfonos, emails, DNI/NIE ni IBAN. Las reseñas son públicas y no se pueden editar: quita el dato personal y vuelve a enviarla.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger reviews_personal_data
  before insert on public.reviews
  for each row execute function private.reviews_personal_data_guard();

create trigger review_responses_personal_data
  before insert on public.review_responses
  for each row execute function private.reviews_personal_data_guard();


-- >>> 20261118000200_rename_hommie_texts.sql
-- Renombrado a Hommie: los dos únicos textos que llegan al usuario desde la base de datos
-- y nombraban la marca. Solo cambia el texto; la lógica es idéntica a la original.
--   · private.profiles_check_age (mensaje de edad mínima), de 20261106000700.
--   · public.send_settlement (aviso al inquilino), de 20261117000100.
-- Los nombres internos (variables de sesión «convivo.*», etc.) NO cambian.

create or replace function private.profiles_check_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_year is not null and extract(year from now())::int - new.birth_year < 18 then
    raise exception 'Para usar Hommie tienes que tener 18 años o más' using errcode = 'check_violation';
  end if;
  if new.birth_year is not null and extract(year from now())::int - new.birth_year > 110 then
    raise exception 'Revisa el año de nacimiento' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.send_settlement(p_settlement_id uuid)
returns public.contract_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
  v_n int;
  v_total numeric;
  v_status public.settlement_status;
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_s.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Liquidación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda envía la liquidación' using errcode = 'insufficient_privilege';
  end if;
  if v_s.status <> 'draft' then
    raise exception 'La liquidación ya está enviada' using errcode = 'check_violation';
  end if;
  select count(*), coalesce(sum(amount), 0) into v_n, v_total from public.settlement_items where settlement_id = v_s.id;
  -- Sin partidas no hay nada que responder: consta directamente «de acuerdo».
  v_status := case when v_n = 0 then 'agreed'::public.settlement_status else 'sent'::public.settlement_status end;

  update public.contract_settlements
     set status = v_status, sent_at = now(), sent_hash = private.settlement_hash(v_s.id, false),
         responded_at = case when v_n = 0 then now() else null end,
         landlord_confirmed_at = null, tenant_confirmed_at = null
   where id = v_s.id
  returning * into v_s;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (v_c.id, 'settlement_sent', v_actor,
          jsonb_build_object('items', v_n, 'total', v_total, 'deposit_amount', v_s.deposit_amount, 'hash', v_s.sent_hash));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'settlement_sent',
          case when v_n = 0 then 'Tu casero propone la liquidación de la fianza, sin descuentos' else 'Tu casero te envía la liquidación de la fianza' end,
          case when v_n = 0 then 'No hay partidas. Revísala y confírmala si estás de acuerdo.'
               else v_n || case when v_n = 1 then ' partida' else ' partidas' end || ' por un total de ' || to_char(v_total, 'FM999999990.00')
                 || ' €. Responde a cada una (acepto / no acepto). Hommie solo deja constancia: no media ni decide.' end,
          '/contratos/' || v_c.id || '/fianza/liquidacion');
  return v_s;
end;
$$;


-- >>> 20261119000100_audit_fixes_inventory_deposit.sql
-- =============================================================================
-- Arreglos de la auditoría (1): lo que queda fijado (inventario y fianza).
-- Ver docs/AUDITORIA-PRUEBAS-2026-11.md: B1, B2, I5, I6 y menores 20 y 25.
--
--  B1  Solo se confirma el inventario que se ha visto: cada cambio sube su
--      `revision` y confirm_inventory exige la revisión que tenía delante quien
--      confirma. La versión de un solo argumento se elimina.
--  B2  Los importes de los avisos salen como en la app: coma decimal y sin
--      céntimos cuando son euros justos (private.format_eur).
--  I6  El aviso «ha pasado un mes y el casero no la ha confirmado» exige además
--      7 días desde que el inquilino registró la declaración.
--  20  La firma guarda también el nombre tal como figura en el contrato.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B1. Revisión del inventario
-- -----------------------------------------------------------------------------
alter table public.contract_inventories add column revision integer not null default 0;
comment on column public.contract_inventories.revision is
  'Sube con cada cambio de los elementos. Para confirmar hay que enviar la revisión que se ha visto.';

create or replace function private.inventory_items_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.contract_inventories%rowtype;
  v_inventory_id uuid := case when tg_op = 'DELETE' then old.inventory_id else new.inventory_id end;
  v_photo text;
begin
  select * into v_inv from public.contract_inventories where id = v_inventory_id;
  if v_inv.locked_at is not null then
    raise exception 'El inventario está confirmado por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    update public.contract_inventories
       set landlord_confirmed_at = null, tenant_confirmed_at = null, revision = revision + 1
     where id = v_inv.id;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.inventory_id <> old.inventory_id then
    raise exception 'Un elemento no se puede mover a otro inventario' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    if (select count(*) from public.inventory_items where inventory_id = v_inv.id) >= 150 then
      raise exception 'El inventario admite como mucho 150 elementos' using errcode = 'check_violation';
    end if;
  else
    new.created_by := old.created_by;
  end if;
  new.area := btrim(new.area);
  new.name := btrim(new.name);
  new.notes := btrim(new.notes);

  foreach v_photo in array new.photos loop
    if v_photo !~ ('^' || v_inv.contract_id::text || '/' || v_inv.id::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$') then
      raise exception 'Foto no válida para este inventario' using errcode = 'check_violation';
    end if;
  end loop;

  update public.contract_inventories
     set landlord_confirmed_at = null, tenant_confirmed_at = null, revision = revision + 1
   where id = v_inv.id;
  return new;
end;
$$;

drop function public.confirm_inventory(uuid);

create function public.confirm_inventory(p_inventory_id uuid, p_revision integer)
returns public.contract_inventories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_inv public.contract_inventories%rowtype;
  v_contract public.contracts%rowtype;
  v_other uuid;
  v_label text;
begin
  select * into v_inv from public.contract_inventories where id = p_inventory_id for update;
  select * into v_contract from public.contracts where id = v_inv.contract_id;
  if v_inv.id is null or v_actor is null or v_actor not in (v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'Inventario no encontrado' using errcode = 'no_data_found';
  end if;
  if v_inv.locked_at is not null then
    raise exception 'El inventario ya está confirmado por las dos partes' using errcode = 'check_violation';
  end if;
  -- Solo se confirma lo que se ha visto: la versión que tenía delante quien
  -- confirma tiene que ser la actual. Si la otra parte cambió algo mientras
  -- tanto, no se guarda la confirmación (P0409) y la app enseña lo nuevo.
  if p_revision is null or p_revision <> v_inv.revision then
    raise exception 'El inventario ha cambiado desde que lo abriste. Revisa los cambios antes de confirmarlo.' using errcode = 'P0409';
  end if;
  if not exists (select 1 from public.inventory_items where inventory_id = v_inv.id) then
    raise exception 'Añade al menos un elemento antes de confirmar' using errcode = 'check_violation';
  end if;

  v_other := case when v_actor = v_contract.landlord_id then v_contract.tenant_id else v_contract.landlord_id end;
  v_label := case when v_inv.stage = 'entry' then 'de entrada' else 'de salida' end;
  if v_actor = v_contract.landlord_id then
    if v_inv.landlord_confirmed_at is not null then
      raise exception 'Ya has confirmado este inventario' using errcode = 'check_violation';
    end if;
    v_inv.landlord_confirmed_at := now();
  else
    if v_inv.tenant_confirmed_at is not null then
      raise exception 'Ya has confirmado este inventario' using errcode = 'check_violation';
    end if;
    v_inv.tenant_confirmed_at := now();
  end if;

  if v_inv.landlord_confirmed_at is not null and v_inv.tenant_confirmed_at is not null then
    v_inv.locked_at := now();
    insert into public.notifications (user_id, kind, title, body, url)
    select u, 'inventory_confirmed', 'Inventario ' || v_label || ' confirmado',
           case when v_inv.stage = 'entry'
                then 'Los dos habéis confirmado el estado de la vivienda. Ya no se puede cambiar.'
                else 'Los dos habéis confirmado el estado de salida. La fianza se devuelve en el plazo de un mes desde la entrega de llaves.' end,
           '/contratos/' || v_contract.id || '/inventario/' || case when v_inv.stage = 'entry' then 'entrada' else 'salida' end
      from unnest(array[v_contract.landlord_id, v_contract.tenant_id]) as u;
  else
    insert into public.notifications (user_id, kind, title, body, url)
    values (v_other, 'inventory_to_confirm', 'Tienes un inventario ' || v_label || ' por revisar',
            'Revisa los elementos y las fotos. Si estás de acuerdo, confírmalo.',
            '/contratos/' || v_contract.id || '/inventario/' || case when v_inv.stage = 'entry' then 'entrada' else 'salida' end);
  end if;

  update public.contract_inventories
     set landlord_confirmed_at = v_inv.landlord_confirmed_at,
         tenant_confirmed_at = v_inv.tenant_confirmed_at,
         locked_at = v_inv.locked_at
   where id = v_inv.id
  returning * into v_inv;
  return v_inv;
end;
$$;

revoke execute on function public.confirm_inventory(uuid, integer) from public, anon;
grant execute on function public.confirm_inventory(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- B2. Importes con el mismo formato en todos lados: «12,50 €», «900 €», «12.345,60 €».
-- -----------------------------------------------------------------------------
create function private.format_eur(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when a is null then null else
           case when a < 0 then '-' else '' end
           || case when trunc(abs(a)) >= 10000
                   then replace(to_char(trunc(abs(a)), 'FM999,999,999,990'), ',', '.')
                   else to_char(trunc(abs(a)), 'FM9999999990') end
           || case when a <> trunc(a)
                   then ',' || lpad(((abs(a) - trunc(abs(a))) * 100)::int::text, 2, '0')
                   else '' end
           || ' €'
         end
    from (select round(p_amount, 2) as a) s;
$$;

create or replace function public.mark_deposit_returned(p_contract_id uuid, p_returned_on date, p_returned_amount numeric default null)
returns public.contract_deposits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.contracts%rowtype;
  v_d public.contract_deposits%rowtype;
begin
  v_c := private.deposit_prepare(p_contract_id);
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda marca la devolución de la fianza' using errcode = 'insufficient_privilege';
  end if;
  select * into v_d from public.contract_deposits where contract_id = p_contract_id for update;
  if v_d.keys_confirmed_at is null then
    raise exception 'La devolución se marca cuando la entrega de llaves está confirmada' using errcode = 'check_violation';
  end if;
  if v_d.status = 'returned' then
    raise exception 'La devolución ya está confirmada' using errcode = 'check_violation';
  end if;
  if v_d.return_marked_at is not null and v_d.return_response is null then
    raise exception 'Ya has marcado la devolución: falta que la confirme el inquilino' using errcode = 'check_violation';
  end if;
  if p_returned_on is null or p_returned_on > private.today_es() or p_returned_on < v_d.keys_declared_on then
    raise exception 'La fecha de devolución no es válida (no puede ser futura ni anterior a la entrega de llaves)'
      using errcode = 'check_violation';
  end if;
  if p_returned_amount is not null and (p_returned_amount < 0 or p_returned_amount > (v_c.terms ->> 'deposit')::numeric) then
    raise exception 'El importe devuelto no puede ser negativo ni superior a la fianza' using errcode = 'check_violation';
  end if;

  update public.contract_deposits
     set return_marked_on = p_returned_on, return_marked_at = now(), return_response = null, return_response_at = null,
         returned_amount = round(p_returned_amount, 2),
         status = case when v_d.deposited_on is not null then 'deposited'::public.deposit_status else 'pending'::public.deposit_status end
   where contract_id = p_contract_id
  returning * into v_d;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (p_contract_id, 'return_marked', v_actor,
          jsonb_build_object('returned_on', p_returned_on, 'returned_amount', v_d.returned_amount));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'deposit_return_marked', 'Tu casero dice que te ha devuelto la fianza',
          'Fecha de devolución: ' || to_char(p_returned_on, 'DD/MM/YYYY')
            || case when v_d.returned_amount is not null then ' · importe indicado: ' || private.format_eur(v_d.returned_amount) else '' end
            || '. Confirma si la has recibido o indica que no.',
          '/contratos/' || p_contract_id);
  return v_d;
end;
$$;

create or replace function public.send_settlement(p_settlement_id uuid)
returns public.contract_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.contract_settlements%rowtype;
  v_c public.contracts%rowtype;
  v_n int;
  v_total numeric;
  v_status public.settlement_status;
begin
  select * into v_s from public.contract_settlements where id = p_settlement_id for update;
  select * into v_c from public.contracts where id = v_s.contract_id;
  if v_s.id is null or v_actor is null or v_actor not in (v_c.landlord_id, v_c.tenant_id) then
    raise exception 'Liquidación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_actor <> v_c.landlord_id then
    raise exception 'Solo quien alquila la vivienda envía la liquidación' using errcode = 'insufficient_privilege';
  end if;
  if v_s.status <> 'draft' then
    raise exception 'La liquidación ya está enviada' using errcode = 'check_violation';
  end if;
  select count(*), coalesce(sum(amount), 0) into v_n, v_total from public.settlement_items where settlement_id = v_s.id;
  -- Sin partidas no hay nada que responder: consta directamente «de acuerdo».
  v_status := case when v_n = 0 then 'agreed'::public.settlement_status else 'sent'::public.settlement_status end;

  update public.contract_settlements
     set status = v_status, sent_at = now(), sent_hash = private.settlement_hash(v_s.id, false),
         responded_at = case when v_n = 0 then now() else null end,
         landlord_confirmed_at = null, tenant_confirmed_at = null
   where id = v_s.id
  returning * into v_s;

  insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
  values (v_c.id, 'settlement_sent', v_actor,
          jsonb_build_object('items', v_n, 'total', v_total, 'deposit_amount', v_s.deposit_amount, 'hash', v_s.sent_hash));
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_c.tenant_id, 'settlement_sent',
          case when v_n = 0 then 'Tu casero propone la liquidación de la fianza, sin descuentos' else 'Tu casero te envía la liquidación de la fianza' end,
          case when v_n = 0 then 'No hay partidas. Revísala y confírmala si estás de acuerdo.'
               else v_n || case when v_n = 1 then ' partida' else ' partidas' end || ' por un total de ' || private.format_eur(v_total)
                 || '. Responde a cada una (acepto / no acepto). Hommie solo deja constancia: no media ni decide.' end,
          '/contratos/' || v_c.id || '/fianza/liquidacion');
  return v_s;
end;
$$;

-- -----------------------------------------------------------------------------
-- I6. Tarea diaria: 7 días de margen desde que se registró la declaración.
-- -----------------------------------------------------------------------------
create or replace function public.deposit_timers_run()
returns table (contract_id uuid, user_id uuid, kind text, party text, keys_on date, due_on date, listing_title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_today date := private.today_es();
  v_title text;
  -- Días desde la declaración en que se manda cada recordatorio al casero.
  v_schedule constant int[] := array[3, 7, 14, 21, 28, 35, 42, 56];
  v_sent int;
begin
  -- 1. Recordatorios al casero mientras no responda a la fecha de llaves declarada.
  for r in
    select d.contract_id as cid, d.keys_declared_on, d.keys_declared_at, c.landlord_id, c.listing_id
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_declared_at is not null and d.keys_confirmed_at is null and d.status <> 'returned'
  loop
    select count(*) into v_sent from public.contract_deposit_events e
     where e.contract_id = r.cid and e.kind = 'keys_reminder' and e.created_at >= r.keys_declared_at;
    if v_sent < array_length(v_schedule, 1) and now() >= r.keys_declared_at + make_interval(days => v_schedule[v_sent + 1]) then
      insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
      values (r.cid, 'keys_reminder', null, jsonb_build_object('n', v_sent + 1, 'keys_on', r.keys_declared_on));
      select l.title into v_title from public.listings l where l.id = r.listing_id;
      insert into public.notifications (user_id, kind, title, body, url)
      values (r.landlord_id, 'deposit_keys_reminder', 'Recordatorio: confirma la entrega de llaves',
              'Tu inquilino declaró el ' || to_char(r.keys_declared_at at time zone 'Europe/Madrid', 'DD/MM/YYYY')
                || ' que entregó las llaves el ' || to_char(r.keys_declared_on, 'DD/MM/YYYY')
                || '. Mientras no lo confirmes, consta como declarada por el inquilino y sin confirmar. Si no coincide, habladlo en la conversación.',
              '/contratos/' || r.cid);
      return query select r.cid, r.landlord_id, 'keys_reminder'::text, 'landlord'::text, r.keys_declared_on, null::date, coalesce(v_title, 'tu alquiler');
    end if;
  end loop;

  -- 2. Pasado un mes desde la fecha declarada y sin confirmar: se puede descargar
  -- el paquete de pruebas (diciendo expresamente que no la confirmó el casero).
  for r in
    select d.contract_id as cid, d.keys_declared_on, c.landlord_id, c.tenant_id, c.listing_id
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_declared_at is not null and d.keys_confirmed_at is null and d.status <> 'returned'
       and v_today > (d.keys_declared_on + interval '1 month')::date
       -- y al menos 7 días desde que el inquilino REGISTRÓ la declaración: el casero
       -- tiene que haber tenido ocasión de verla antes de decir que no la confirmó.
       and now() >= d.keys_declared_at + interval '7 days'
  loop
    begin
      insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
      values (r.cid, 'keys_unconfirmed_due', null,
              jsonb_build_object('keys_on', r.keys_declared_on, 'due_on', (r.keys_declared_on + interval '1 month')::date));
    exception when unique_violation then
      continue; -- ya avisado
    end;
    select l.title into v_title from public.listings l where l.id = r.listing_id;
    v_title := coalesce(v_title, 'tu alquiler');
    insert into public.notifications (user_id, kind, title, body, url)
    values
      (r.landlord_id, 'deposit_keys_unconfirmed_due', 'Ha pasado un mes desde la fecha de llaves declarada',
       'Tu inquilino declaró que entregó las llaves el ' || to_char(r.keys_declared_on, 'DD/MM/YYYY')
         || ' y tú no lo has confirmado. Confírmalo o habladlo en la conversación. Si la fianza sigue sin devolver, tu inquilino podrá descargar un paquete de pruebas que indica que la fecha no está confirmada por ti.',
       '/contratos/' || r.cid),
      (r.tenant_id, 'deposit_keys_unconfirmed_due', 'Ya puedes descargar el paquete de pruebas',
       'Ha pasado un mes desde la fecha de llaves que declaraste (' || to_char(r.keys_declared_on, 'DD/MM/YYYY')
         || '). Ojo: el casero no la ha confirmado y el paquete lo dirá expresamente. Si ya te devolvió la fianza, no hace falta.',
       '/contratos/' || r.cid);
    return query select r.cid, r.landlord_id, 'keys_unconfirmed_due'::text, 'landlord'::text, r.keys_declared_on, (r.keys_declared_on + interval '1 month')::date, v_title;
    return query select r.cid, r.tenant_id, 'keys_unconfirmed_due'::text, 'tenant'::text, r.keys_declared_on, (r.keys_declared_on + interval '1 month')::date, v_title;
  end loop;

  -- 3. Plazo de devolución a punto de vencer (7 días antes) y vencido (solo con la fecha confirmada).
  for r in
    select d.contract_id as cid, d.keys_declared_on, d.return_due_on, c.landlord_id, c.tenant_id, c.listing_id,
           case when v_today > d.return_due_on then 'return_overdue' else 'return_closing' end as due_kind
      from public.contract_deposits d
      join public.contracts c on c.id = d.contract_id
     where d.keys_confirmed_at is not null and d.status <> 'returned'
       and (d.return_marked_at is null or d.return_response = 'not_received')
       and v_today >= d.return_due_on - 7
  loop
    begin
      insert into public.contract_deposit_events (contract_id, kind, actor_id, data)
      values (r.cid, r.due_kind, null, jsonb_build_object('return_due_on', r.return_due_on));
    exception when unique_violation then
      continue; -- ya avisado
    end;
    select l.title into v_title from public.listings l where l.id = r.listing_id;
    v_title := coalesce(v_title, 'tu alquiler');

    insert into public.notifications (user_id, kind, title, body, url)
    values
      (r.landlord_id, 'deposit_' || r.due_kind,
       case when r.due_kind = 'return_overdue' then 'Ha vencido el plazo para devolver la fianza'
            else 'Se acerca el plazo para devolver la fianza' end,
       case when r.due_kind = 'return_overdue'
            then 'El plazo de un mes terminó el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '. Si ya la has devuelto, márcalo en el contrato.'
            else 'Tienes hasta el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || ' para devolver la fianza (un mes desde la entrega de llaves).' end,
       '/contratos/' || r.cid),
      (r.tenant_id, 'deposit_' || r.due_kind,
       case when r.due_kind = 'return_overdue' then 'Ha vencido el plazo para que te devuelvan la fianza'
            else 'Se acerca el plazo para que te devuelvan la fianza' end,
       case when r.due_kind = 'return_overdue'
            then 'El plazo de un mes terminó el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '. Puedes descargar el paquete de pruebas desde el contrato.'
            else 'El plazo de un mes termina el ' || to_char(r.return_due_on, 'DD/MM/YYYY') || '.' end,
       '/contratos/' || r.cid);

    return query select r.cid, r.landlord_id, r.due_kind, 'landlord'::text, r.keys_declared_on, r.return_due_on, v_title;
    return query select r.cid, r.tenant_id, r.due_kind, 'tenant'::text, r.keys_declared_on, r.return_due_on, v_title;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Menor 20. La firma guarda el nombre tal como figura en el contrato, además de
-- lo que tecleó quien firma. (Los contratos ya firmados quedan con nulo: la app
-- usa entonces el nombre de las condiciones, que es el mismo dato.)
-- -----------------------------------------------------------------------------
alter table public.contracts
  add column landlord_signed_name text,
  add column tenant_signed_name text;
comment on column public.contracts.landlord_signed_name is 'Nombre de la parte arrendadora tal como figura en el contrato, en el momento de firmar.';
comment on column public.contracts.tenant_signed_name is 'Nombre de la parte arrendataria tal como figura en el contrato, en el momento de firmar.';

create or replace function public.sign_contract(p_contract_id uuid, p_full_name text, p_document_hash text)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_contract public.contracts%rowtype;
  v_expected text;
  v_stay uuid;
  v_interest public.interests%rowtype;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or v_actor is null or v_actor not in (v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'Contrato no encontrado' using errcode = 'no_data_found';
  end if;
  if v_contract.status <> 'sent' then
    raise exception 'Este contrato no está pendiente de firma' using errcode = 'check_violation';
  end if;
  if p_document_hash is distinct from v_contract.document_hash then
    raise exception 'El texto que has leído no coincide con el contrato enviado. Recarga la página.' using errcode = 'check_violation';
  end if;
  v_expected := case when v_actor = v_contract.landlord_id then v_contract.terms ->> 'landlord_name' else v_contract.terms ->> 'tenant_name' end;
  if lower(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(btrim(v_expected), '\s+', ' ', 'g')) then
    raise exception 'Escribe tu nombre completo tal como aparece en el contrato: %', v_expected using errcode = 'check_violation';
  end if;
  if private.is_blocked_between(v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'No es posible firmar este contrato' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('convivo.contract_rpc', 'on', true);
  if v_actor = v_contract.landlord_id then
    if v_contract.landlord_signed_at is not null then
      raise exception 'Ya has firmado este contrato' using errcode = 'check_violation';
    end if;
    v_contract.landlord_signed_at := now();
    v_contract.landlord_signature := btrim(p_full_name);
    v_contract.landlord_signed_name := btrim(v_expected);
  else
    if v_contract.tenant_signed_at is not null then
      raise exception 'Ya has firmado este contrato' using errcode = 'check_violation';
    end if;
    v_contract.tenant_signed_at := now();
    v_contract.tenant_signature := btrim(p_full_name);
    v_contract.tenant_signed_name := btrim(v_expected);
  end if;

  if v_contract.landlord_signed_at is not null and v_contract.tenant_signed_at is not null then
    -- Firmado por los dos: estancia confirmada por ambas partes.
    select * into v_interest from public.interests where id = v_contract.interest_id;
    select s.id into v_stay from public.stays s
     where s.listing_id = v_contract.listing_id and s.guest_id = v_contract.tenant_id and s.status in ('proposed', 'active')
     limit 1;
    if v_stay is null then
      insert into public.stays (listing_id, interest_id, host_id, guest_id, start_date, end_date)
      values (v_contract.listing_id, v_contract.interest_id, v_contract.landlord_id, v_contract.tenant_id,
              (v_contract.terms ->> 'start_date')::date, nullif(v_contract.terms ->> 'end_date', '')::date)
      returning id into v_stay;
    end if;
    update public.stays
       set host_confirmed_at = coalesce(host_confirmed_at, v_contract.landlord_signed_at),
           guest_confirmed_at = coalesce(guest_confirmed_at, v_contract.tenant_signed_at),
           status = 'active',
           activated_at = coalesce(activated_at, now())
     where id = v_stay;

    v_contract.status := 'signed';
    v_contract.signed_at := now();
    v_contract.stay_id := v_stay;
    insert into public.notifications (user_id, kind, title, body, url)
    select u, 'contract_signed', 'Contrato firmado por las dos partes',
           'Ya tenéis el contrato firmado y la estancia confirmada. Guarda una copia.', '/contratos/' || v_contract.id
      from unnest(array[v_contract.landlord_id, v_contract.tenant_id]) as u;
  end if;

  update public.contracts
     set landlord_signed_at = v_contract.landlord_signed_at,
         landlord_signature = v_contract.landlord_signature,
         landlord_signed_name = v_contract.landlord_signed_name,
         tenant_signed_at = v_contract.tenant_signed_at,
         tenant_signature = v_contract.tenant_signature,
         tenant_signed_name = v_contract.tenant_signed_name,
         status = v_contract.status,
         signed_at = v_contract.signed_at,
         stay_id = v_contract.stay_id
   where id = p_contract_id
  returning * into v_contract;
  return v_contract;
end;
$$;


-- >>> 20261120000100_notifications_inbox.sql
-- =============================================================================
-- Arreglos de la auditoría (2): avisos que se ven, se atienden y no se repiten.
-- Ver docs/AUDITORIA-PRUEBAS-2026-11.md, hallazgo I1.
--
--  * `resolved_at`: el aviso ya está atendido (o lo sustituyó otro más nuevo).
--    Lo pone la base de datos cuando ocurre lo que el aviso pedía (firmar,
--    confirmar el inventario, confirmar las llaves, responder a la devolución o
--    a la liquidación…), no la app.
--  * Un aviso nuevo sustituye a los anteriores iguales o del mismo asunto: no se
--    acumulan tres «Tu casero dice que te ha devuelto la fianza».
--  * `my_notifications()` y `my_notification_count()`: la lista y el contador de
--    la pantalla «Avisos», con una sola definición de qué avisos piden acción.
--
-- Los avisos que ya existían NO se migran: quedan archivados como atendidos.
-- =============================================================================

alter table public.notifications add column resolved_at timestamptz;
comment on column public.notifications.resolved_at is
  'Cuándo quedó atendido (o sustituido por otro más nuevo). Nulo = sigue vigente.';

-- Los anteriores a este cambio no tienen el formato nuevo: se archivan.
update public.notifications set resolved_at = now(), read_at = coalesce(read_at, now()) where resolved_at is null;

create index notifications_pending_idx on public.notifications (user_id, created_at desc) where resolved_at is null;

-- ¿Este tipo de aviso pide que el usuario haga algo? (Los demás son novedades:
-- basta con leerlos.)
create function private.notification_needs_action(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind in (
    'contract_to_sign',
    'inventory_to_confirm',
    'deposit_keys_declared', 'deposit_keys_reminder', 'deposit_keys_unconfirmed_due',
    'deposit_return_closing', 'deposit_return_overdue',
    'deposit_return_marked', 'deposit_return_disputed',
    'settlement_sent', 'settlement_answered', 'settlement_to_confirm'
  );
$$;

-- Marca como atendidos los avisos vigentes de un usuario sobre un asunto (su URL).
create function private.resolve_notifications(p_user uuid, p_url text, p_kinds text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set resolved_at = now()
   where user_id = p_user and resolved_at is null and url = p_url and kind = any (p_kinds);
$$;

-- -----------------------------------------------------------------------------
-- Un aviso nuevo sustituye a los anteriores iguales o del mismo asunto.
-- -----------------------------------------------------------------------------
create function private.notifications_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_same text[];
begin
  v_same := case
    -- Declaración de llaves, sus recordatorios y el aviso del mes: solo vale el último.
    when new.kind in ('deposit_keys_declared', 'deposit_keys_reminder', 'deposit_keys_unconfirmed_due')
      then array['deposit_keys_declared', 'deposit_keys_reminder', 'deposit_keys_unconfirmed_due']
    when new.kind in ('deposit_return_closing', 'deposit_return_overdue')
      then array['deposit_return_closing', 'deposit_return_overdue']
    when new.kind in ('review_window_opened', 'review_window_closing')
      then array['review_window_opened', 'review_window_closing']
    -- Una liquidación reenviada o reabierta deja sin efecto lo anterior sobre ella.
    when new.kind in ('settlement_sent', 'settlement_reopened')
      then array['settlement_sent', 'settlement_reopened', 'settlement_to_confirm']
    else array[new.kind]
  end;
  update public.notifications
     set resolved_at = now()
   where user_id = new.user_id and resolved_at is null
     and url is not distinct from new.url
     and (kind = any (v_same) or (title = new.title and body is not distinct from new.body));
  new.resolved_at := null;
  return new;
end;
$$;
create trigger notifications_before_insert
  before insert on public.notifications
  for each row execute function private.notifications_before_insert();

-- -----------------------------------------------------------------------------
-- Atendidos: cuando ocurre lo que el aviso pedía.
-- -----------------------------------------------------------------------------
create function private.contracts_resolve_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url constant text := '/contratos/' || new.id;
begin
  if new.landlord_signed_at is not null and old.landlord_signed_at is null then
    perform private.resolve_notifications(new.landlord_id, v_url, array['contract_to_sign']);
  end if;
  if new.tenant_signed_at is not null and old.tenant_signed_at is null then
    perform private.resolve_notifications(new.tenant_id, v_url, array['contract_to_sign']);
  end if;
  if new.status in ('signed', 'cancelled') and old.status is distinct from new.status then
    perform private.resolve_notifications(new.landlord_id, v_url, array['contract_to_sign']);
    perform private.resolve_notifications(new.tenant_id, v_url, array['contract_to_sign']);
  end if;
  return null;
end;
$$;
create trigger contracts_resolve_notifications
  after update on public.contracts
  for each row execute function private.contracts_resolve_notifications();

create function private.inventories_resolve_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contracts%rowtype;
  v_url text;
begin
  select * into v_c from public.contracts where id = new.contract_id;
  v_url := '/contratos/' || new.contract_id || '/inventario/' || case when new.stage = 'entry' then 'entrada' else 'salida' end;
  if new.landlord_confirmed_at is not null and old.landlord_confirmed_at is null then
    perform private.resolve_notifications(v_c.landlord_id, v_url, array['inventory_to_confirm']);
  end if;
  if new.tenant_confirmed_at is not null and old.tenant_confirmed_at is null then
    perform private.resolve_notifications(v_c.tenant_id, v_url, array['inventory_to_confirm']);
  end if;
  return null;
end;
$$;
create trigger inventories_resolve_notifications
  after update on public.contract_inventories
  for each row execute function private.inventories_resolve_notifications();

create function private.deposits_resolve_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contracts%rowtype;
  v_url constant text := '/contratos/' || new.contract_id;
  v_keys constant text[] := array['deposit_keys_declared', 'deposit_keys_reminder', 'deposit_keys_unconfirmed_due'];
  v_due constant text[] := array['deposit_return_closing', 'deposit_return_overdue'];
begin
  select * into v_c from public.contracts where id = new.contract_id;
  -- El casero confirma las llaves: ya no hay nada que confirmar ni que recordar.
  if new.keys_confirmed_at is not null and old.keys_confirmed_at is null then
    perform private.resolve_notifications(v_c.landlord_id, v_url, v_keys);
    perform private.resolve_notifications(v_c.tenant_id, v_url, v_keys);
  end if;
  -- El casero marca la devolución: se queda a la espera del inquilino.
  if new.return_marked_at is not null and new.return_marked_at is distinct from old.return_marked_at then
    perform private.resolve_notifications(v_c.landlord_id, v_url, v_due || array['deposit_return_disputed']);
  end if;
  -- El inquilino responde a la devolución.
  if new.return_response is not null and old.return_response is null then
    perform private.resolve_notifications(v_c.tenant_id, v_url, array['deposit_return_marked']);
  end if;
  -- Devuelta y confirmada: no queda nada pendiente sobre la fianza.
  if new.status = 'returned' and old.status is distinct from new.status then
    perform private.resolve_notifications(v_c.landlord_id, v_url, v_keys || v_due || array['deposit_return_disputed', 'deposit_return_marked']);
    perform private.resolve_notifications(v_c.tenant_id, v_url, v_keys || v_due || array['deposit_return_disputed', 'deposit_return_marked']);
  end if;
  return null;
end;
$$;
create trigger deposits_resolve_notifications
  after update on public.contract_deposits
  for each row execute function private.deposits_resolve_notifications();

create function private.settlements_resolve_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contracts%rowtype;
  v_url constant text := '/contratos/' || new.contract_id || '/fianza/liquidacion';
  v_all constant text[] := array['settlement_sent', 'settlement_answered', 'settlement_to_confirm', 'settlement_reopened'];
begin
  select * into v_c from public.contracts where id = new.contract_id;
  -- El inquilino responde a las partidas.
  if new.responded_at is not null and old.responded_at is null then
    perform private.resolve_notifications(v_c.tenant_id, v_url, array['settlement_sent']);
  end if;
  -- Cada parte confirma.
  if new.landlord_confirmed_at is not null and old.landlord_confirmed_at is null then
    perform private.resolve_notifications(v_c.landlord_id, v_url, array['settlement_answered', 'settlement_to_confirm']);
  end if;
  if new.tenant_confirmed_at is not null and old.tenant_confirmed_at is null then
    perform private.resolve_notifications(v_c.tenant_id, v_url, array['settlement_to_confirm']);
  end if;
  -- Reabierta (vuelve a preparación) o cerrada: lo pendiente deja de estarlo.
  if (new.status = 'draft' and old.status <> 'draft') or (new.locked_at is not null and old.locked_at is null) then
    perform private.resolve_notifications(v_c.landlord_id, v_url, v_all);
    perform private.resolve_notifications(v_c.tenant_id, v_url, v_all);
  end if;
  return null;
end;
$$;
create trigger settlements_resolve_notifications
  after update on public.contract_settlements
  for each row execute function private.settlements_resolve_notifications();

-- -----------------------------------------------------------------------------
-- RPC de la pantalla «Avisos»
-- -----------------------------------------------------------------------------
-- Mis avisos, del más nuevo al más antiguo, con `needs_action` y `pending`:
--   pending = vigente y, o pide acción, o todavía no se ha leído.
create function public.my_notifications(p_limit integer default 60)
returns table (
  id uuid, kind text, title text, body text, url text,
  created_at timestamptz, read_at timestamptz, resolved_at timestamptz,
  needs_action boolean, pending boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.title, n.body, n.url, n.created_at, n.read_at, n.resolved_at,
         private.notification_needs_action(n.kind) and n.resolved_at is null as needs_action,
         n.resolved_at is null and (private.notification_needs_action(n.kind) or n.read_at is null) as pending
    from public.notifications n
   where n.user_id = (select auth.uid())
   order by (n.resolved_at is null and (private.notification_needs_action(n.kind) or n.read_at is null)) desc, n.created_at desc
   limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- Cuántos avisos tengo sin atender (el número de la cabecera y de la barra inferior).
create function public.my_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.notifications n
   where n.user_id = (select auth.uid())
     and n.resolved_at is null
     and (private.notification_needs_action(n.kind) or n.read_at is null);
$$;

revoke execute on function public.my_notifications(integer) from public, anon;
revoke execute on function public.my_notification_count() from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;
grant execute on function public.my_notification_count() to authenticated;


-- >>> 20261121000100_password_reset_rate_limit.sql
-- =============================================================================
-- Recuperar la contraseña (auditoría I12): límite de envíos del email.
--
-- Mismo sistema que el enlace mágico (auth_attempts + auth_rate_allowed) y los
-- mismos números: 5 por email y 60 por IP a la hora. Lleva un tipo propio
-- ('password_reset') para que pedir enlaces mágicos no gaste las peticiones de
-- recuperación, ni al revés.
--
-- Solo añade un valor permitido: el código anterior sigue funcionando igual
-- (decisión 79: primero la migración, después el código).
-- =============================================================================

alter table public.auth_attempts drop constraint auth_attempts_kind;
alter table public.auth_attempts
  add constraint auth_attempts_kind
  check (kind in ('login_failed', 'signup', 'magic_link', 'legal_notice', 'password_reset'));

create or replace function private.auth_rate_limits(p_kind text)
returns table (per_ip int, per_email int, win interval)
language sql
immutable
set search_path = ''
as $$
  select l.per_ip, l.per_email, l.win from (values
    ('login_failed',   30, 8, interval '15 minutes'),
    ('signup',         60, 3, interval '1 hour'),
    ('magic_link',     60, 5, interval '1 hour'),
    ('password_reset', 60, 5, interval '1 hour'),
    ('legal_notice',   20, 10, interval '1 day')
  ) as l(kind, per_ip, per_email, win)
  where l.kind = p_kind;
$$;

comment on table public.auth_attempts is
  'Intentos de login fallidos, registros, enlaces mágicos, recuperaciones de contraseña y notificaciones (solo huellas HMAC). Nadie la lee: solo las funciones auth_rate_*.';


-- >>> 20261122000100_review_withdrawal_requests.sql
-- =============================================================================
-- Solicitud de retirada de una reseña propia (auditoría I11)
-- =============================================================================
-- Las reseñas son inmutables: nadie las edita ni las borra por su cuenta.
-- Quien escribió una reseña puede SOLICITAR su retirada con un motivo; la
-- solicitud es una denuncia más (public.reports, motivo 'author_withdrawal')
-- y la decide un admin. Hasta entonces la reseña sigue como estaba.
--
-- Compatible con el código anterior (decisión 79): solo añade un valor al
-- enumerado y cambia funciones; la app antigua nunca borraba reseñas del autor.

-- El valor nuevo solo se usa dentro de funciones plpgsql (y comparando como
-- texto), así que esta migración puede aplicarse en una sola transacción.
alter type public.report_reason add value if not exists 'author_withdrawal';

-- -----------------------------------------------------------------------------
-- Alta: la solicitud solo vale sobre una reseña propia y con motivo.
-- -----------------------------------------------------------------------------
create or replace function private.reports_before_insert()
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
  if new.reason::text = 'author_withdrawal' then
    if new.target_review_id is null or not exists (
      select 1 from public.reviews r
       where r.id = new.target_review_id and r.author_id = new.reporter_id and r.deleted_at is null
    ) then
      raise exception 'Solo puedes solicitar la retirada de una reseña que hayas escrito tú'
        using errcode = 'insufficient_privilege';
    end if;
    if new.details is null or char_length(btrim(new.details)) < 10 then
      raise exception 'Indica el motivo de la solicitud (mínimo 10 caracteres)' using errcode = 'check_violation';
    end if;
    new.details := btrim(new.details);
  end if;
  new.status := 'open';
  new.resolved_at := null;
  new.resolved_by := null;
  new.resolution_note := null;
  new.created_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Borrar una reseña: solo un admin. El autor ya no puede hacerlo por su cuenta.
-- -----------------------------------------------------------------------------
create or replace function public.delete_review(p_review_id uuid, p_reason text)
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
  if not private.is_admin() then
    raise exception 'Las reseñas no se pueden borrar. Puedes solicitar su retirada desde «Mis reseñas».'
      using errcode = 'insufficient_privilege';
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

-- -----------------------------------------------------------------------------
-- Decisión: el autor recibe un aviso propio de su solicitud (no el de «denuncia»).
-- -----------------------------------------------------------------------------
create or replace function private.reports_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('dismissed', 'resolved') then
    perform private.log_moderation(
      case new.status when 'dismissed' then 'report_dismissed' else 'report_resolved' end,
      'report', new.id, new.resolution_note);
    if new.reason::text = 'author_withdrawal' then
      insert into public.notifications (user_id, kind, title, body, url)
      values (new.reporter_id, 'report_decision',
              case new.status when 'dismissed' then 'No hemos retirado tu reseña'
                              else 'Hemos retirado tu reseña, como solicitaste' end,
              left(case new.status
                     when 'dismissed' then 'Hemos revisado tu solicitud de retirada y la reseña sigue como estaba.'
                     else 'Hemos revisado tu solicitud de retirada. Queda constancia de que la reseña existió, sin su texto ni su nota.'
                   end || coalesce(' Motivo: ' || new.resolution_note, ''), 1000),
              '/mis-resenas');
    else
      insert into public.notifications (user_id, kind, title, body, url)
      values (new.reporter_id, 'report_decision',
              case new.status when 'dismissed' then 'Hemos revisado tu denuncia y no retiramos el contenido'
                              else 'Hemos revisado tu denuncia y hemos actuado' end,
              left(coalesce('Motivo: ' || new.resolution_note, 'Gracias por avisarnos.'), 1000),
              null);
    end if;
  end if;
  return null;
end;
$$;

-- Si la reseña se retira a petición de su autor, no se le dice además que se
-- ha «eliminado por moderación»: recibe el aviso de su solicitud (arriba).
create or replace function private.reviews_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and private.is_admin()
     and new.deleted_by is distinct from new.author_id then
    perform private.log_moderation('review_deleted', 'review', new.id, new.deletion_reason);
    if not exists (
      select 1 from public.reports r
       where r.target_review_id = new.id and r.reporter_id = new.author_id
         and r.reason::text = 'author_withdrawal' and r.status = 'open'
    ) then
      insert into public.notifications (user_id, kind, title, body, url)
      values (new.author_id, 'content_removed', 'Hemos eliminado una de tus reseñas',
              left(format('La reseña se ha eliminado por moderación. %s Si no estás de acuerdo, escríbenos al canal de reclamaciones indicado en las condiciones de uso.',
                          coalesce(new.deletion_reason, '')), 1000),
              '/mis-resenas');
    end if;
  end if;
  return null;
end;
$$;
