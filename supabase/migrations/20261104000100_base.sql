-- =============================================================================
-- 01 · Base: esquema privado, enums, utilidades y administradores
-- =============================================================================
-- Convención:
--   * public  -> tablas y funciones RPC expuestas por la API de Supabase.
--   * private -> funciones auxiliares (triggers, comprobaciones de RLS). Este
--                esquema NO se expone por la API REST, así que nadie puede
--                llamarlas directamente aunque tengan permiso de EXECUTE (que
--                necesitan cuando se usan dentro de una política RLS).
--   * Toda función SECURITY DEFINER fija `search_path = ''` y cualifica
--     todos los nombres (public.x, auth.uid()) para evitar secuestros de
--     search_path.

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- Postgres concede EXECUTE a PUBLIC por defecto en funciones nuevas: lo
-- quitamos en ambos esquemas y concedemos explícitamente lo que haga falta.
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.listing_kind as enum ('room', 'flat', 'seeking');
create type public.listing_status as enum ('draft', 'active', 'paused', 'closed');
create type public.interest_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type public.stay_status as enum ('proposed', 'active', 'ended', 'cancelled');
create type public.user_role as enum ('tenant', 'landlord', 'flatmate');
create type public.age_range as enum ('18-24', '25-34', '35-44', '45-54', '55-64', '65+');
create type public.review_subject_type as enum ('listing', 'user');
create type public.review_relationship as enum (
  'tenant_to_listing',    -- inquilino -> inmueble
  'tenant_to_landlord',   -- inquilino -> propietario
  'landlord_to_tenant',   -- propietario -> inquilino
  'flatmate_to_flatmate'  -- compañero <-> compañero
);
create type public.report_reason as enum (
  'spam', 'fraud', 'offensive', 'discrimination', 'personal_data', 'false_information', 'other'
);
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Administradores
-- -----------------------------------------------------------------------------
-- Se da de alta a mano desde el editor SQL:
--   insert into public.admin_users (user_id) values ('<uuid>');
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- Sin políticas y sin privilegios: solo se consulta mediante private.is_admin().
revoke all on public.admin_users from anon, authenticated;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
grant execute on function private.is_admin() to anon, authenticated, service_role;

-- RPC para que la app sepa si mostrar el panel de administración.
create function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;
revoke execute on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
