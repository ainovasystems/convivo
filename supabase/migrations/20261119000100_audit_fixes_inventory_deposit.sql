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
