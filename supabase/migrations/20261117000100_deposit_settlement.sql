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
