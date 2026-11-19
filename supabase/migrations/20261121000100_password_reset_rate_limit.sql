-- =============================================================================
-- Recuperar la contraseña (auditoría I12): límite de envíos del email.
--
-- Mismo sistema que el enlace mágico (auth_attempts + auth_rate_allowed) y los
-- mismos números: 5 por email y 60 por IP a la hora. Lleva un tipo propio
-- ('password_reset') para que pedir enlaces mágicos no gaste las peticiones de
-- recuperación, ni al revés.
--
-- Solo añade un valor permitido: el código anterior sigue funcionando igual
-- (decisión 79: primero la migración, después el código).
-- =============================================================================

alter table public.auth_attempts drop constraint auth_attempts_kind;
alter table public.auth_attempts
  add constraint auth_attempts_kind
  check (kind in ('login_failed', 'signup', 'magic_link', 'legal_notice', 'password_reset'));

create or replace function private.auth_rate_limits(p_kind text)
returns table (per_ip int, per_email int, win interval)
language sql
immutable
set search_path = ''
as $$
  select l.per_ip, l.per_email, l.win from (values
    ('login_failed',   30, 8, interval '15 minutes'),
    ('signup',         60, 3, interval '1 hour'),
    ('magic_link',     60, 5, interval '1 hour'),
    ('password_reset', 60, 5, interval '1 hour'),
    ('legal_notice',   20, 10, interval '1 day')
  ) as l(kind, per_ip, per_email, win)
  where l.kind = p_kind;
$$;

comment on table public.auth_attempts is
  'Intentos de login fallidos, registros, enlaces mágicos, recuperaciones de contraseña y notificaciones (solo huellas HMAC). Nadie la lee: solo las funciones auth_rate_*.';
