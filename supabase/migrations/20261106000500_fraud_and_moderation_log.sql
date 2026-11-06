-- =============================================================================
-- Anti-fraude y registro de auditoría de moderación (Fase 6, bloques 5 y 6).
--
-- 1. listing_flags: marcas automáticas para que un admin revise un anuncio. NO
--    despublican nada ni avisan al anunciante (no queremos dar pistas a quien
--    intenta estafar). Las pone un trigger al publicar o al cambiar un anuncio
--    activo, así que no se saltan llamando a la API directamente:
--      - payment_scam: texto típico de estafa (Western Union, MoneyGram,
--        "paga por adelantado", "estoy en el extranjero", "te mando las llaves"…);
--      - low_price: precio por debajo de la mitad de la mediana de anuncios
--        activos del mismo tipo en la ciudad (mínimo 5 para comparar) o, si no
--        hay bastantes, en la provincia; sin comparables, un umbral absoluto
--        (habitación < 120 €, piso < 250 €).
-- 2. moderation_log: registro append-only de quién hizo qué y cuándo. Nadie
--    lo modifica ni lo borra (tampoco service_role: lo impide un trigger).
--    Se escribe solo desde la BD: al resolver una denuncia, al eliminar una
--    reseña siendo admin y al revisar una marca de fraude.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Texto normalizado (minúsculas, sin tildes ni signos), igual que en la app.
-- -----------------------------------------------------------------------------
create function private.normalize_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Frases de estafa. Para ampliar, añade una alternativa (normalizada) aquí.
create function private.scam_phrase(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (regexp_match(
    private.normalize_text(p_text),
    '(western union|money ?gram|ria money|paysafecard|bitcoin|criptomoneda'
    || '|pag(a|ar|o|ues|ue) (\w+ )?por adelantado|pago adelantado|por adelantado (la|el) (fianza|deposito|primer mes)'
    || '|antes de ver (el|la) (piso|habitacion|casa|vivienda)|sin ver (el|la) (piso|habitacion|casa|vivienda)'
    || '|estoy (en el|fuera del?) (extranjero|pais|espana)|vivo (en el|fuera del?) (extranjero|pais)'
    || '|(te|le|os) (mando|envio|enviare|mandare|haremos llegar) las llaves|envio de (las )?llaves'
    || '|(por|mediante) (correo|mensajeria) las llaves)'))[1];
$$;

-- -----------------------------------------------------------------------------
-- listing_flags
-- -----------------------------------------------------------------------------
create table public.listing_flags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reason text not null constraint listing_flags_reason check (reason in ('payment_scam', 'low_price')),
  details text not null constraint listing_flags_details_len check (char_length(details) <= 500),
  status text not null default 'open' constraint listing_flags_status check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_note text constraint listing_flags_note_len check (char_length(resolution_note) <= 1000)
);
create unique index listing_flags_one_open on public.listing_flags (listing_id, reason) where status = 'open';
create index listing_flags_open_idx on public.listing_flags (created_at desc) where status = 'open';

alter table public.listing_flags enable row level security;
revoke all on public.listing_flags from anon, authenticated;
grant select on public.listing_flags to authenticated;
-- Solo admins las leen. Nadie las escribe directamente (trigger y RPC).
create policy listing_flags_select_admin on public.listing_flags
  for select to authenticated
  using ((select private.is_admin()));

create function private.flag_listing(p_listing public.listings)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phrase text;
  v_median numeric;
  v_scope text;
  v_floor int;
begin
  if p_listing.status <> 'active' then
    return;
  end if;

  v_phrase := private.scam_phrase(p_listing.title || ' ' || p_listing.description);
  if v_phrase is not null
     and not exists (select 1 from public.listing_flags
                      where listing_id = p_listing.id and reason = 'payment_scam' and status = 'open') then
    insert into public.listing_flags (listing_id, reason, details)
    values (p_listing.id, 'payment_scam', format('Texto sospechoso: «%s»', v_phrase));
  end if;

  if p_listing.kind in ('room', 'flat') and p_listing.monthly_rent is not null
     and not exists (select 1 from public.listing_flags
                      where listing_id = p_listing.id and reason = 'low_price' and status = 'open') then
    -- Mediana de la ciudad con al menos 5 comparables; si no, de la provincia.
    select percentile_cont(0.5) within group (order by monthly_rent), 'la ciudad'
      into v_median, v_scope
      from public.listings
     where status = 'active' and kind = p_listing.kind and id <> p_listing.id
       and lower(city) = lower(p_listing.city) and monthly_rent is not null
    having count(*) >= 5;
    if v_median is null then
      select percentile_cont(0.5) within group (order by monthly_rent), 'la provincia'
        into v_median, v_scope
        from public.listings
       where status = 'active' and kind = p_listing.kind and id <> p_listing.id
         and province = p_listing.province and monthly_rent is not null
      having count(*) >= 5;
    end if;

    if v_median is not null and p_listing.monthly_rent < v_median * 0.5 then
      insert into public.listing_flags (listing_id, reason, details)
      values (p_listing.id, 'low_price',
              format('%s €/mes, menos de la mitad de la mediana de %s (%s €/mes)',
                     p_listing.monthly_rent, v_scope, round(v_median)));
    elsif v_median is null then
      v_floor := case p_listing.kind when 'room' then 120 else 250 end;
      if p_listing.monthly_rent < v_floor then
        insert into public.listing_flags (listing_id, reason, details)
        values (p_listing.id, 'low_price',
                format('%s €/mes, por debajo del mínimo razonable (%s €) y sin anuncios con los que comparar',
                       p_listing.monthly_rent, v_floor));
      end if;
    end if;
  end if;
end;
$$;

create function private.listings_after_write_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.flag_listing(new);
  return null;
end;
$$;

create trigger listings_fraud_flags
  after insert or update of status, title, description, monthly_rent, city, province on public.listings
  for each row
  when (new.status = 'active')
  execute function private.listings_after_write_flags();

-- -----------------------------------------------------------------------------
-- moderation_log (append-only)
-- -----------------------------------------------------------------------------
create table public.moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  action text not null constraint moderation_log_action check (action in (
    'report_dismissed', 'report_resolved', 'review_deleted', 'listing_flag_dismissed', 'listing_flag_actioned'
  )),
  target_type text not null constraint moderation_log_target_type check (target_type in ('report', 'review', 'listing_flag')),
  target_id uuid not null,
  note text constraint moderation_log_note_len check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index moderation_log_created_idx on public.moderation_log (created_at desc);

comment on table public.moderation_log is
  'Registro de auditoría de moderación. Solo se inserta (desde triggers y RPC); nadie puede modificarlo ni borrarlo.';

create function private.moderation_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El registro de moderación no se puede modificar ni borrar' using errcode = 'check_violation';
end;
$$;

create trigger moderation_log_no_update
  before update or delete on public.moderation_log
  for each row execute function private.moderation_log_immutable();
create trigger moderation_log_no_truncate
  before truncate on public.moderation_log
  for each statement execute function private.moderation_log_immutable();

alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from anon, authenticated;
grant select on public.moderation_log to authenticated;
create policy moderation_log_select_admin on public.moderation_log
  for select to authenticated
  using ((select private.is_admin()));

create function private.log_moderation(p_action text, p_target_type text, p_target_id uuid, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.moderation_log (actor_id, action, target_type, target_id, note)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, left(p_note, 1000));
$$;

-- Denuncia resuelta o descartada (solo un admin puede cambiar su estado: RLS).
create function private.reports_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('dismissed', 'resolved') then
    perform private.log_moderation(
      case new.status when 'dismissed' then 'report_dismissed' else 'report_resolved' end,
      'report', new.id, new.resolution_note);
  end if;
  return null;
end;
$$;
create trigger reports_moderation_log
  after update of status on public.reports
  for each row execute function private.reports_after_update_log();

-- Reseña eliminada por un admin (el autor borrando la suya no es moderación).
create function private.reviews_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and private.is_admin()
     and new.deleted_by is distinct from new.author_id then
    perform private.log_moderation('review_deleted', 'review', new.id, new.deletion_reason);
  end if;
  return null;
end;
$$;
create trigger reviews_moderation_log
  after update of deleted_at on public.reviews
  for each row execute function private.reviews_after_update_log();

-- Revisar una marca de fraude: descartarla o cerrar el anuncio (definitivo).
create function public.admin_resolve_listing_flag(p_flag_id uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.listing_flags;
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('dismiss', 'close_listing') then
    raise exception 'Acción no válida' using errcode = 'check_violation';
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 5 and 1000 then
    raise exception 'Explica brevemente la decisión (5 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  select * into v_flag from public.listing_flags where id = p_flag_id and status = 'open' for update;
  if not found then
    raise exception 'Marca no encontrada o ya revisada' using errcode = 'no_data_found';
  end if;

  if p_action = 'close_listing' then
    update public.listings set status = 'closed' where id = v_flag.listing_id and status <> 'closed';
    -- Cierra también las demás marcas abiertas del mismo anuncio.
    update public.listing_flags
       set status = 'actioned', resolved_by = (select auth.uid()), resolved_at = now(), resolution_note = btrim(p_note)
     where listing_id = v_flag.listing_id and status = 'open';
    perform private.log_moderation('listing_flag_actioned', 'listing_flag', p_flag_id, btrim(p_note));
  else
    update public.listing_flags
       set status = 'dismissed', resolved_by = (select auth.uid()), resolved_at = now(), resolution_note = btrim(p_note)
     where id = p_flag_id;
    perform private.log_moderation('listing_flag_dismissed', 'listing_flag', p_flag_id, btrim(p_note));
  end if;
end;
$$;
revoke execute on function public.admin_resolve_listing_flag(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_listing_flag(uuid, text, text) to authenticated;
