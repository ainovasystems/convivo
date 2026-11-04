-- =============================================================================
-- 06 · Reseñas: elegibilidad, doble ciego, inmutabilidad y estadísticas
-- =============================================================================
-- Reglas que impone la base de datos (no solo la app):
--  a) Solo se reseña con una estancia confirmada por ambas partes
--     (status active/ended) y siendo host, guest o compañero confirmado.
--  b) Doble ciego: `published_at` guarda CUÁNDO se hace visible. Al crear la
--     reseña vale "apertura de la ventana + 14 días"; si la contraparte ya
--     había reseñado, ambas pasan a `now()`. La visibilidad pública es
--     `published_at <= now()`, así que no hace falta ningún cron.
--  c) Inmutables: nadie (ni service_role) puede editar texto, nota ni
--     criterios. Solo se "borran" con motivo mediante delete_review(): queda
--     constancia (fecha, motivo, quién) pero no el contenido.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.stays (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  subject_type public.review_subject_type not null,
  subject_listing_id uuid references public.listings (id) on delete cascade,
  subject_user_id uuid references public.profiles (id) on delete cascade,
  relationship public.review_relationship not null,
  rating smallint constraint reviews_rating_range check (rating between 1 and 5),
  criteria jsonb,
  body text,
  created_at timestamptz not null default now(),
  published_at timestamptz not null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_reason text,

  constraint reviews_subject_shape check (
    (subject_type = 'listing' and subject_listing_id is not null and subject_user_id is null)
    or (subject_type = 'user' and subject_user_id is not null and subject_listing_id is null)
  ),
  constraint reviews_not_self check (subject_user_id is null or subject_user_id <> author_id),
  constraint reviews_content_or_deleted check (
    (deleted_at is null and rating is not null and criteria is not null
      and body is not null and char_length(btrim(body)) between 50 and 1500
      and deletion_reason is null)
    or
    (deleted_at is not null and rating is null and criteria is null and body is null
      and char_length(btrim(deletion_reason)) between 10 and 500)
  )
);

-- Una reseña por (estancia, autor, sujeto).
create unique index reviews_unique_listing on public.reviews (stay_id, author_id, subject_listing_id)
  where subject_type = 'listing';
create unique index reviews_unique_user on public.reviews (stay_id, author_id, subject_user_id)
  where subject_type = 'user';

create index reviews_subject_user_idx on public.reviews (subject_user_id, published_at desc)
  where subject_type = 'user';
create index reviews_subject_listing_idx on public.reviews (subject_listing_id, published_at desc)
  where subject_type = 'listing';
create index reviews_author_idx on public.reviews (author_id);

-- Criterios (1..5) obligatorios según la relación. Lista cerrada.
create function private.review_criteria_keys(p_relationship public.review_relationship)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_relationship
    when 'tenant_to_listing'    then array['cleanliness', 'accuracy', 'area', 'condition', 'value']
    when 'tenant_to_landlord'   then array['communication', 'treatment', 'compliance', 'deposit']
    when 'landlord_to_tenant'   then array['payment_punctuality', 'home_care', 'coexistence', 'communication']
    when 'flatmate_to_flatmate' then array['coexistence', 'cleanliness', 'noise', 'respect']
  end;
$$;

create function private.valid_review_criteria(p_criteria jsonb, p_relationship public.review_relationship)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[] := private.review_criteria_keys(p_relationship);
  k text;
begin
  if p_criteria is null or jsonb_typeof(p_criteria) <> 'object' then
    return false;
  end if;
  if (p_criteria - v_keys) <> '{}'::jsonb then
    return false;
  end if;
  foreach k in array v_keys loop
    if not private.is_score(p_criteria -> k) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

grant execute on function
  private.review_criteria_keys(public.review_relationship),
  private.valid_review_criteria(jsonb, public.review_relationship)
  to authenticated, service_role;

-- Exponemos las claves para que la app no las duplique a mano.
create function public.review_criteria_for(p_relationship public.review_relationship)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select private.review_criteria_keys(p_relationship);
$$;
grant execute on function public.review_criteria_for(public.review_relationship) to anon, authenticated;

-- "La otra parte" de una reseña: el usuario reseñado o, si es un inmueble, su
-- anfitrión en esa estancia.
create function private.review_counterparty(p_review public.reviews, p_host_id uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_review.subject_user_id, p_host_id);
$$;

-- -----------------------------------------------------------------------------
-- Alta de reseña: reglas a) y b)
-- -----------------------------------------------------------------------------
create function private.reviews_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_stay public.stays%rowtype;
  v_author_role text;
  v_subject_role text;
  v_other uuid;
  v_opens timestamptz;
  v_counterpart_exists boolean;
begin
  if v_actor is not null and new.author_id is distinct from v_actor then
    raise exception 'Solo puedes publicar reseñas en tu nombre' using errcode = 'insufficient_privilege';
  end if;

  select * into v_stay from public.stays where id = new.stay_id;

  -- a) estancia confirmada por ambas partes
  if v_stay.id is null
     or v_stay.status not in ('active', 'ended')
     or v_stay.host_confirmed_at is null
     or v_stay.guest_confirmed_at is null then
    raise exception 'Solo se puede reseñar una estancia confirmada por ambas partes'
      using errcode = 'check_violation';
  end if;

  -- a) el autor forma parte de la estancia
  v_author_role := case
    when new.author_id = v_stay.host_id then 'host'
    when new.author_id = v_stay.guest_id then 'guest'
    when exists (
      select 1 from public.stay_participants
       where stay_id = v_stay.id and user_id = new.author_id and confirmed_at is not null
    ) then 'flatmate'
  end;
  if v_author_role is null then
    raise exception 'No formas parte de esta estancia' using errcode = 'insufficient_privilege';
  end if;

  -- Relación permitida
  if new.subject_type = 'listing' then
    if v_author_role <> 'guest' or new.subject_listing_id is distinct from v_stay.listing_id then
      raise exception 'Solo el inquilino puede reseñar el inmueble de su estancia' using errcode = 'check_violation';
    end if;
    new.relationship := 'tenant_to_listing';
    v_other := v_stay.host_id;
  else
    v_subject_role := case
      when new.subject_user_id = v_stay.host_id then 'host'
      when new.subject_user_id = v_stay.guest_id then 'guest'
      when exists (
        select 1 from public.stay_participants
         where stay_id = v_stay.id and user_id = new.subject_user_id and confirmed_at is not null
      ) then 'flatmate'
    end;

    new.relationship := case
      when v_author_role = 'guest' and v_subject_role = 'host' then 'tenant_to_landlord'
      when v_author_role = 'host' and v_subject_role = 'guest' then 'landlord_to_tenant'
      when v_author_role in ('guest', 'flatmate') and v_subject_role in ('guest', 'flatmate')
           and new.author_id <> new.subject_user_id then 'flatmate_to_flatmate'
    end::public.review_relationship;

    if new.relationship is null then
      raise exception 'Esa relación no se puede reseñar en esta estancia' using errcode = 'check_violation';
    end if;
    v_other := new.subject_user_id;
  end if;

  if private.is_blocked_between(new.author_id, v_other) then
    raise exception 'No puedes reseñar a este usuario' using errcode = 'insufficient_privilege';
  end if;

  if not private.valid_review_criteria(new.criteria, new.relationship) then
    raise exception 'Criterios no válidos: se esperan %', private.review_criteria_keys(new.relationship)
      using errcode = 'check_violation';
  end if;

  -- Ventana de reseña (las inserciones de sistema, sin JWT, la omiten: seed o
  -- importaciones de estancias antiguas hechas por un admin).
  v_opens := private.review_window_opens_at(v_stay);
  if v_actor is not null and (now() < v_opens or now() >= v_opens + interval '30 days') then
    raise exception 'La ventana para reseñar esta estancia no está abierta' using errcode = 'check_violation';
  end if;

  -- b) Doble ciego
  select exists (
    select 1 from public.reviews r
     where r.stay_id = new.stay_id
       and r.author_id = v_other
       and r.deleted_at is null
       and private.review_counterparty(r, v_stay.host_id) = new.author_id
  ) into v_counterpart_exists;

  new.created_at := now();
  new.deleted_at := null;
  new.deleted_by := null;
  new.deletion_reason := null;

  if v_counterpart_exists then
    new.published_at := now();
    -- Publica también lo que la contraparte (y el propio autor) hubiera escrito
    -- dentro de este par en esta estancia.
    update public.reviews r
       set published_at = now()
     where r.stay_id = new.stay_id
       and r.deleted_at is null
       and r.published_at > now()
       and (
         (r.author_id = v_other and private.review_counterparty(r, v_stay.host_id) = new.author_id)
         or (r.author_id = new.author_id and private.review_counterparty(r, v_stay.host_id) = v_other)
       );
  else
    new.published_at := v_opens + interval '14 days';
  end if;

  return new;
end;
$$;

create trigger reviews_before_insert
  before insert on public.reviews
  for each row execute function private.reviews_before_insert();

-- -----------------------------------------------------------------------------
-- Inmutabilidad: regla c) — se aplica a TODOS los roles
-- -----------------------------------------------------------------------------
create function private.reviews_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.stay_id <> old.stay_id or new.author_id <> old.author_id
     or new.subject_type <> old.subject_type
     or new.subject_listing_id is distinct from old.subject_listing_id
     or new.subject_user_id is distinct from old.subject_user_id
     or new.relationship <> old.relationship
     or new.created_at <> old.created_at then
    raise exception 'Las reseñas no se pueden modificar' using errcode = 'check_violation';
  end if;

  if old.deleted_at is not null then
    raise exception 'Esta reseña ya fue eliminada' using errcode = 'check_violation';
  end if;

  -- Caso 1: borrado con motivo (se vacía el contenido).
  if new.deleted_at is not null then
    if new.body is not null or new.criteria is not null or new.rating is not null then
      raise exception 'Al eliminar una reseña se descarta su contenido' using errcode = 'check_violation';
    end if;
    new.published_at := old.published_at;
    return new;
  end if;

  -- Caso 2: adelantar la publicación (doble ciego). Nunca retrasarla.
  if new.rating is distinct from old.rating
     or new.criteria is distinct from old.criteria
     or new.body is distinct from old.body
     or new.deletion_reason is distinct from old.deletion_reason
     or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Las reseñas no se pueden editar' using errcode = 'check_violation';
  end if;
  if new.published_at > old.published_at then
    raise exception 'No se puede retrasar la publicación de una reseña' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger reviews_before_update
  before update on public.reviews
  for each row execute function private.reviews_before_update();

-- Prohíbe el borrado físico directo. Solo se permite en cascada (al borrar la
-- cuenta o la estancia), que llega con profundidad de trigger > 1.
-- TODO(Prompt 6): al borrar la cuenta, anonimizar en vez de borrar.
create function private.reviews_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'Las reseñas no se borran: usa delete_review(id, motivo)' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger reviews_before_delete
  before delete on public.reviews
  for each row execute function private.reviews_before_delete();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (stay_id, author_id, subject_type, subject_listing_id, subject_user_id, rating, criteria, body)
  on public.reviews to authenticated;
-- Sin UPDATE ni DELETE para usuarios.

-- Terceros (y el reseñado) solo ven lo publicado. Las eliminadas siguen
-- visibles como constancia, pero ya sin contenido.
create policy reviews_select_published on public.reviews
  for select to anon, authenticated
  using (published_at <= now());

-- El autor siempre ve la suya.
create policy reviews_select_own on public.reviews
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy reviews_select_admin on public.reviews
  for select to authenticated
  using ((select private.is_admin()));

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (author_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------

-- Borrado con motivo (autor o admin). Deja constancia sin el contenido.
create function public.delete_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_author uuid;
begin
  select author_id into v_author from public.reviews where id = p_review_id and deleted_at is null;
  if v_author is null or v_actor is null or (v_actor <> v_author and not private.is_admin()) then
    raise exception 'Reseña no encontrada' using errcode = 'no_data_found';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'Indica un motivo (entre 10 y 500 caracteres)' using errcode = 'check_violation';
  end if;

  update public.reviews
     set deleted_at = now(),
         deleted_by = v_actor,
         deletion_reason = btrim(p_reason),
         body = null,
         criteria = null,
         rating = null
   where id = p_review_id;
end;
$$;
revoke execute on function public.delete_review(uuid, text) from public, anon;
grant execute on function public.delete_review(uuid, text) to authenticated;

-- Estadísticas de un perfil por relación. SECURITY DEFINER con filtro
-- explícito de "publicada y no eliminada": así el autor no ve su propia reseña
-- pendiente contada en la media.
--   tenant_to_landlord   -> valoraciones "como propietario"
--   landlord_to_tenant   -> valoraciones "como inquilino"
--   flatmate_to_flatmate -> valoraciones "como compañero"
create function public.profile_review_stats(p_user_id uuid)
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

create function public.listing_review_stats(p_listing_id uuid)
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

grant execute on function public.profile_review_stats(uuid), public.listing_review_stats(uuid)
  to anon, authenticated;
