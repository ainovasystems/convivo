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
