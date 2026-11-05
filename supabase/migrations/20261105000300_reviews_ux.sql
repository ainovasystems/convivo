-- =============================================================================
-- 11 · Reseñas: respuestas públicas, moderación, avisos y señales anti-abuso
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ocultación cautelar: una reseña denunciada por contener DATOS PERSONALES se
-- oculta al público hasta que un admin la revise. El resto de denuncias no
-- ocultan nada (la reseña sigue visible mientras se revisa).
-- -----------------------------------------------------------------------------
create function private.review_is_hidden(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports
     where target_review_id = p_review_id
       and reason = 'personal_data'
       and status = 'open'
  );
$$;
grant execute on function private.review_is_hidden(uuid) to anon, authenticated, service_role;

drop policy reviews_select_published on public.reviews;
create policy reviews_select_published on public.reviews
  for select to anon, authenticated
  using (published_at <= now() and not (select private.review_is_hidden(id)));

-- Las estadísticas tampoco cuentan reseñas ocultas.
create or replace function public.profile_review_stats(p_user_id uuid)
returns table (
  relationship public.review_relationship,
  review_count bigint,
  avg_rating numeric,
  criteria_avg jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select r.relationship, r.rating, r.criteria
      from public.reviews r
     where r.subject_user_id = p_user_id
       and r.deleted_at is null
       and r.published_at <= now()
       and not private.review_is_hidden(r.id)
  ),
  crit as (
    select pub.relationship, c.key, round(avg(c.value::numeric), 2) as avg_value
      from pub, jsonb_each_text(pub.criteria) c
     group by pub.relationship, c.key
  )
  select p.relationship,
         count(*),
         round(avg(p.rating), 2),
         coalesce(
           (select jsonb_object_agg(crit.key, crit.avg_value) from crit where crit.relationship = p.relationship),
           '{}'::jsonb
         )
    from pub p
   group by p.relationship;
$$;

create or replace function public.listing_review_stats(p_listing_id uuid)
returns table (review_count bigint, avg_rating numeric, criteria_avg jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select r.rating, r.criteria
      from public.reviews r
     where r.subject_listing_id = p_listing_id
       and r.deleted_at is null
       and r.published_at <= now()
       and not private.review_is_hidden(r.id)
  )
  select count(*),
         round(avg(pub.rating), 2),
         coalesce(
           (select jsonb_object_agg(x.key, x.avg_value)
              from (select c.key, round(avg(c.value::numeric), 2) as avg_value
                      from pub, jsonb_each_text(pub.criteria) c
                     group by c.key) x),
           '{}'::jsonb
         )
    from pub;
$$;

-- Límite de denuncias: 10 al día por usuario (evita usar las denuncias por
-- datos personales para ocultar reseñas en masa).
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);

create function private.reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    select count(*) from public.reports
     where reporter_id = new.reporter_id and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'Has enviado demasiadas denuncias hoy. Inténtalo mañana.' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function private.reports_rate_limit();

-- Una sola denuncia abierta por persona y reseña.
create unique index reports_one_open_per_review on public.reports (reporter_id, target_review_id)
  where target_review_id is not null and status = 'open';

-- -----------------------------------------------------------------------------
-- Respuesta pública del reseñado: una por reseña, no editable
-- -----------------------------------------------------------------------------
create table public.review_responses (
  review_id uuid primary key references public.reviews (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null constraint review_responses_body_len check (char_length(btrim(body)) between 10 and 1000),
  created_at timestamptz not null default now()
);

create function private.review_responses_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews%rowtype;
  v_respondent uuid;
begin
  select * into v_review from public.reviews where id = new.review_id;
  if v_review.id is null or v_review.deleted_at is not null or v_review.published_at > now()
     or private.review_is_hidden(v_review.id) then
    raise exception 'Solo se puede responder a una reseña publicada' using errcode = 'check_violation';
  end if;

  -- Responde la persona reseñada; si es un inmueble, su propietario.
  if v_review.subject_type = 'user' then
    v_respondent := v_review.subject_user_id;
  else
    select owner_id into v_respondent from public.listings where id = v_review.subject_listing_id;
  end if;

  if (select auth.uid()) is not null and new.author_id is distinct from (select auth.uid()) then
    raise exception 'Solo puedes responder en tu nombre' using errcode = 'insufficient_privilege';
  end if;
  if new.author_id is distinct from v_respondent then
    raise exception 'Solo la persona reseñada puede responder' using errcode = 'insufficient_privilege';
  end if;

  new.created_at := now();
  return new;
end;
$$;

create trigger review_responses_before_insert
  before insert on public.review_responses
  for each row execute function private.review_responses_before_insert();

create function private.review_is_public(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reviews
     where id = p_review_id and deleted_at is null and published_at <= now()
       and not private.review_is_hidden(id)
  );
$$;
grant execute on function private.review_is_public(uuid) to anon, authenticated, service_role;

alter table public.review_responses enable row level security;
revoke all on public.review_responses from anon, authenticated;
grant select on public.review_responses to anon, authenticated;
grant insert (review_id, author_id, body) on public.review_responses to authenticated;

create policy review_responses_select_public on public.review_responses
  for select to anon, authenticated
  using ((select private.review_is_public(review_id)) or author_id = (select auth.uid()));

create policy review_responses_insert_own on public.review_responses
  for insert to authenticated
  with check (author_id = (select auth.uid()));
-- Sin UPDATE ni DELETE: la respuesta es única y no editable.

-- -----------------------------------------------------------------------------
-- Notificaciones in-app
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null constraint notifications_kind check (kind in ('review_window_opened', 'review_window_closing')),
  title text not null constraint notifications_title_len check (char_length(title) <= 200),
  body text constraint notifications_body_len check (char_length(body) <= 1000),
  url text constraint notifications_url_internal check (url ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Las crea el sistema (tarea programada con service_role).

-- -----------------------------------------------------------------------------
-- Avisos de ventana de reseña (idempotencia de la tarea programada)
-- -----------------------------------------------------------------------------
create table public.review_window_notices (
  stay_id uuid not null references public.stays (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null constraint review_window_notices_kind check (kind in ('opened', 'closing')),
  opens_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (stay_id, user_id, kind, opens_at)
);
alter table public.review_window_notices enable row level security;
revoke all on public.review_window_notices from anon, authenticated;
-- Sin políticas: solo service_role.

-- Avisos pendientes de enviar. Solo para la tarea programada (service_role).
create function public.review_window_notices_due()
returns table (
  stay_id uuid,
  user_id uuid,
  kind text,
  opens_at timestamptz,
  closes_at timestamptz,
  listing_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select s.id, s.host_id, s.guest_id, l.title, private.review_window_opens_at(s) as opens_at
      from public.stays s
      join public.listings l on l.id = s.listing_id
     where s.status in ('active', 'ended')
  ),
  members as (
    select w.id as stay_id, m.user_id, w.opens_at, w.title
      from w
      cross join lateral (
        select w.host_id as user_id
        union select w.guest_id
        union select p.user_id from public.stay_participants p where p.stay_id = w.id and p.confirmed_at is not null
      ) m
     where w.opens_at is not null
  ),
  due as (
    select m.*, 'opened'::text as kind from members m
     where now() >= m.opens_at and now() < m.opens_at + interval '30 days'
    union all
    select m.*, 'closing'::text from members m
     where now() >= m.opens_at + interval '27 days' and now() < m.opens_at + interval '30 days'
  )
  select d.stay_id, d.user_id, d.kind, d.opens_at, d.opens_at + interval '30 days', d.title
    from due d
   where not exists (
     select 1 from public.review_window_notices n
      where n.stay_id = d.stay_id and n.user_id = d.user_id and n.kind = d.kind and n.opens_at = d.opens_at
   );
$$;
revoke execute on function public.review_window_notices_due() from public, anon, authenticated;
grant execute on function public.review_window_notices_due() to service_role;

-- -----------------------------------------------------------------------------
-- Señales anti-abuso: hashes de IP y de navegador (nunca en claro)
-- -----------------------------------------------------------------------------
create table public.user_signals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip_hash text not null constraint user_signals_ip_hash_len check (char_length(ip_hash) = 64),
  ua_hash text not null constraint user_signals_ua_hash_len check (char_length(ua_hash) = 64),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, ip_hash, ua_hash)
);
create index user_signals_ip_idx on public.user_signals (ip_hash);
alter table public.user_signals enable row level security;
revoke all on public.user_signals from anon, authenticated;
-- Sin políticas: solo se escribe con record_signal() y lo leen los admins vía RPC.

create function public.record_signal(p_ip_hash text, p_ua_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  insert into public.user_signals (user_id, ip_hash, ua_hash)
  values ((select auth.uid()), p_ip_hash, p_ua_hash)
  on conflict (user_id, ip_hash, ua_hash) do update set last_seen_at = now();
end;
$$;
revoke execute on function public.record_signal(text, text) from public, anon;
grant execute on function public.record_signal(text, text) to authenticated;

-- Reseñas cuyo autor y sujeto comparten IP o navegador (posible autorreseña o
-- reseña cruzada pactada). Solo para administradores.
create function public.admin_review_flags()
returns table (review_id uuid, author_id uuid, subject_user_id uuid, shared_ip boolean, shared_device boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.id, r.author_id, coalesce(r.subject_user_id, l.owner_id),
           exists (select 1 from public.user_signals a join public.user_signals b on a.ip_hash = b.ip_hash
                    where a.user_id = r.author_id and b.user_id = coalesce(r.subject_user_id, l.owner_id)),
           exists (select 1 from public.user_signals a join public.user_signals b
                       on a.ip_hash = b.ip_hash and a.ua_hash = b.ua_hash
                    where a.user_id = r.author_id and b.user_id = coalesce(r.subject_user_id, l.owner_id))
      from public.reviews r
      left join public.listings l on l.id = r.subject_listing_id
     where r.deleted_at is null
       and exists (select 1 from public.user_signals a join public.user_signals b on a.ip_hash = b.ip_hash
                    where a.user_id = r.author_id and b.user_id = coalesce(r.subject_user_id, l.owner_id));
end;
$$;
revoke execute on function public.admin_review_flags() from public, anon;
grant execute on function public.admin_review_flags() to authenticated;
