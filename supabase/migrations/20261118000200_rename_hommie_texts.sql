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
