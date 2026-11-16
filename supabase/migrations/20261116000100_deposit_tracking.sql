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
