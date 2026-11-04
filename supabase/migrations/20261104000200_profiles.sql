-- =============================================================================
-- 02 · Perfiles y bloqueos
-- =============================================================================

-- Hábitos de convivencia: lista CERRADA de claves. No se admite ninguna clave
-- libre, para que nadie pueda guardar ni filtrar por origen, religión, etc.
--   smoker      boolean
--   pets        boolean
--   schedule    'early' | 'standard' | 'night' | 'shifts'
--   cleanliness 1..5
--   noise       1..5   (1 = muy tranquilo, 5 = muy animado)
--   guests      'rarely' | 'sometimes' | 'often'
create function private.valid_habits(h jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if h is null or jsonb_typeof(h) <> 'object' then
    return false;
  end if;
  if (h - array['smoker', 'pets', 'schedule', 'cleanliness', 'noise', 'guests']) <> '{}'::jsonb then
    return false;
  end if;
  if h ? 'smoker' and jsonb_typeof(h -> 'smoker') <> 'boolean' then return false; end if;
  if h ? 'pets' and jsonb_typeof(h -> 'pets') <> 'boolean' then return false; end if;
  if h ? 'schedule' and coalesce(h ->> 'schedule', '') not in ('early', 'standard', 'night', 'shifts') then
    return false;
  end if;
  if h ? 'guests' and coalesce(h ->> 'guests', '') not in ('rarely', 'sometimes', 'often') then
    return false;
  end if;
  if h ? 'cleanliness' and not private.is_score(h -> 'cleanliness') then return false; end if;
  if h ? 'noise' and not private.is_score(h -> 'noise') then return false; end if;
  return true;
end;
$$;

-- Entero JSON entre 1 y 5.
create function private.is_score(v jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if v is null or jsonb_typeof(v) <> 'number' then
    return false;
  end if;
  return (v::text)::numeric in (1, 2, 3, 4, 5);
end;
$$;

grant execute on function private.valid_habits(jsonb), private.is_score(jsonb)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_len check (char_length(btrim(display_name)) between 2 and 60),
  bio text constraint profiles_bio_len check (char_length(bio) <= 1000),
  avatar_url text constraint profiles_avatar_url_len check (char_length(avatar_url) <= 500),
  city text constraint profiles_city_len check (char_length(city) <= 80),
  occupation text constraint profiles_occupation_len check (char_length(occupation) <= 80),
  age_range public.age_range,
  languages text[] not null default '{}'
    constraint profiles_languages_max check (cardinality(languages) <= 10),
  habits jsonb not null default '{}'::jsonb
    constraint profiles_habits_valid check (private.valid_habits(habits)),
  roles public.user_role[] not null default '{}',
  email_verified boolean not null default false,
  -- TODO(Prompt 2+): verificación de teléfono. El número irá en una tabla
  -- privada aparte, nunca en profiles (que es de lectura pública).
  phone_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil público de cada usuario. Todo lo que hay aquí lo puede leer cualquiera: no guardes datos privados.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

-- Privilegios mínimos: lectura para todos, actualización solo de columnas
-- editables. Insert y delete solo los hace el sistema (trigger / cascada).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_url, city, occupation, age_range, languages, habits, roles)
  on public.profiles to authenticated;

create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Creación automática del perfil al registrarse
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
begin
  if char_length(v_name) < 2 then
    v_name := 'Nuevo usuario';
  end if;

  insert into public.profiles (id, display_name, email_verified)
  values (new.id, v_name, new.email_confirmed_at is not null);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- email_verified se sincroniza desde Supabase Auth; el usuario no puede tocarlo.
create function private.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email_verified = new.email_confirmed_at is not null
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_email_confirmed();

-- -----------------------------------------------------------------------------
-- blocks: A bloquea a B
-- -----------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- Solo ves a quién has bloqueado tú (no quién te ha bloqueado).
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ¿Hay bloqueo en cualquier dirección? SECURITY DEFINER porque el usuario no
-- puede ver los bloqueos que otros le han hecho a él.
create function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated, service_role;
