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
