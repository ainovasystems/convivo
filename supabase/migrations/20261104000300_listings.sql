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
