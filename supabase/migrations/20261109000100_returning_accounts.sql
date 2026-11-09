-- =============================================================================
-- Cuentas que se borran y vuelven (para no escapar de las malas reseñas).
--
-- 1. Al borrar una cuenta se guarda una HUELLA cifrada de su email (HMAC con una
--    clave que solo existe en la BD, nunca el email), las huellas de IP y
--    navegador que ya había y cuántas reseñas negativas tenía. Caduca a los 2
--    años (prevención del fraude, interés legítimo).
-- 2. Si alguien se registra con ese mismo email, la cuenta nueva queda enlazada
--    a la antigua (profiles.restored_from): su perfil muestra el historial de
--    reseñas anterior y las medias lo cuentan. Las reseñas no se tocan (siguen
--    siendo inmutables): se leen por la cadena de cuentas.
-- 3. Con otro email: el perfil de una cuenta reciente lleva «Cuenta nueva» (app)
--    y el admin ve las cuentas recientes que comparten IP o navegador con una
--    cuenta borrada que tenía reseñas negativas (indicio, no prueba).
-- =============================================================================

-- Clave del HMAC, generada aquí y legible solo por las funciones del sistema.
create table private.app_secrets (
  name text primary key,
  value bytea not null
);
revoke all on private.app_secrets from public, anon, authenticated;
insert into private.app_secrets (name, value) values ('account_trace', extensions.gen_random_bytes(32));

create function private.email_fingerprint(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(convert_to(lower(btrim(p_email)), 'UTF8'),
                    (select value from private.app_secrets where name = 'account_trace'), 'sha256'),
    'hex');
$$;
revoke execute on function private.email_fingerprint(text) from public, anon, authenticated;

create table private.deleted_account_traces (
  profile_id uuid primary key references public.profiles (id),
  email_hash text not null,
  ip_hashes text[] not null default '{}',
  ua_hashes text[] not null default '{}',
  negative_reviews int not null default 0,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 years',
  restored_by uuid references public.profiles (id)
);
create index deleted_account_traces_email_idx on private.deleted_account_traces (email_hash);
alter table private.deleted_account_traces enable row level security;
revoke all on private.deleted_account_traces from public, anon, authenticated;

-- La cuenta nueva apunta a la anterior. La pone el sistema, nunca el usuario.
alter table public.profiles add column restored_from uuid references public.profiles (id);
comment on column public.profiles.restored_from is
  'Cuenta borrada anterior de la misma persona (mismo email): su historial de reseñas se muestra en esta.';

-- Cadena de cuentas de una persona: ella y sus cuentas anteriores (máx. 10).
create function public.profile_lineage(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain(id, depth) as (
    select p_user_id, 0
    union all
    select p.restored_from, c.depth + 1
      from chain c join public.profiles p on p.id = c.id
     where p.restored_from is not null and c.depth < 10
  )
  select array_agg(id) from chain;
$$;
grant execute on function public.profile_lineage(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Al borrar: guardar la huella antes de anonimizar (que borra user_signals).
-- -----------------------------------------------------------------------------
create or replace function private.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email is not null then
    insert into private.deleted_account_traces (profile_id, email_hash, ip_hashes, ua_hashes, negative_reviews)
    values (
      old.id,
      private.email_fingerprint(old.email),
      coalesce((select array_agg(distinct s.ip_hash) from public.user_signals s where s.user_id = old.id), '{}'),
      coalesce((select array_agg(distinct s.ua_hash) from public.user_signals s where s.user_id = old.id), '{}'),
      (select count(*) from public.reviews r
        where r.deleted_at is null and r.rating <= 2
          and (r.subject_user_id = any(public.profile_lineage(old.id))
               or r.subject_listing_id in (select l.id from public.listings l where l.owner_id = old.id)))
    )
    on conflict (profile_id) do nothing;
  end if;
  perform private.anonymize_user(old.id);
  return old;
end;
$$;

-- -----------------------------------------------------------------------------
-- Al registrarse: si el email coincide con una cuenta borrada, se enlaza.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
  v_previous uuid;
begin
  if char_length(v_name) < 2 then
    v_name := 'Nuevo usuario';
  end if;

  if new.email is not null then
    select t.profile_id into v_previous
      from private.deleted_account_traces t
     where t.email_hash = private.email_fingerprint(new.email)
       and t.restored_by is null
       and t.expires_at > now()
     order by t.deleted_at desc
     limit 1;
  end if;

  insert into public.profiles (id, display_name, email_verified, restored_from)
  values (new.id, v_name, new.email_confirmed_at is not null, v_previous);

  if v_previous is not null then
    update private.deleted_account_traces set restored_by = new.id where profile_id = v_previous;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Las medias de un perfil cuentan también las de sus cuentas anteriores.
-- -----------------------------------------------------------------------------
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
     where r.subject_user_id = any(public.profile_lineage(p_user_id))
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

-- -----------------------------------------------------------------------------
-- Admin: cuentas recientes que comparten IP o navegador con una cuenta borrada
-- que tenía reseñas negativas.
-- -----------------------------------------------------------------------------
create function public.admin_returning_account_flags()
returns table (
  profile_id uuid,
  display_name text,
  created_at timestamptz,
  previous_profile_id uuid,
  previous_deleted_at timestamptz,
  negative_reviews int,
  shared_device boolean
)
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
    select distinct on (p.id, t.profile_id)
           p.id, p.display_name, p.created_at, t.profile_id, t.deleted_at, t.negative_reviews,
           (s.ua_hash = any(t.ua_hashes))
      from public.profiles p
      join public.user_signals s on s.user_id = p.id
      join private.deleted_account_traces t
        on (s.ip_hash = any(t.ip_hashes) or s.ua_hash = any(t.ua_hashes))
     where p.deleted_at is null
       and p.restored_from is null
       and p.created_at > now() - interval '180 days'
       and p.created_at > t.deleted_at
       and t.negative_reviews > 0
       and t.restored_by is null
       and t.expires_at > now()
     order by p.id, t.profile_id, (s.ua_hash = any(t.ua_hashes)) desc;
end;
$$;
revoke execute on function public.admin_returning_account_flags() from public, anon;
grant execute on function public.admin_returning_account_flags() to authenticated;
