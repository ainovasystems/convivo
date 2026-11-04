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
