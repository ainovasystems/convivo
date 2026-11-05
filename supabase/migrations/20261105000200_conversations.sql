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
