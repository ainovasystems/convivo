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
