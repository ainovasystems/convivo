-- =============================================================================
-- Límite de intentos en login, registro y enlace mágico (Fase 6).
--
-- Como el resto de límites (decisión 30), vive en la BD y no en la memoria del
-- servidor: vale igual con varias instancias de Vercel. Se cuenta por dos
-- claves, siempre como HMAC con SIGNAL_SECRET (nunca la IP ni el email en
-- claro):
--   - huella de la IP: frena a quien prueba muchas cuentas desde un sitio
--     (en el login cuenta cuentas distintas con fallos, no fallos);
--   - huella del email normalizado: frena a quien ataca una cuenta desde
--     muchas IP.
-- En el login solo cuentan los intentos FALLIDOS (entrar bien no penaliza). En
-- el registro y el enlace mágico cuenta cada petición.
-- Los límites por IP son generosos porque en una residencia o un campus muchos
-- estudiantes comparten la misma IP pública.
-- =============================================================================

create table public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null constraint auth_attempts_kind check (kind in ('login_failed', 'signup', 'magic_link')),
  ip_hash text not null constraint auth_attempts_ip_hash check (ip_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null constraint auth_attempts_email_hash check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index auth_attempts_ip_idx on public.auth_attempts (kind, ip_hash, created_at);
create index auth_attempts_email_idx on public.auth_attempts (kind, email_hash, created_at);
create index auth_attempts_created_idx on public.auth_attempts (created_at);

comment on table public.auth_attempts is
  'Intentos de login fallidos, registros y enlaces mágicos (solo huellas HMAC). Nadie la lee: solo las funciones auth_rate_*.';

alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;
-- Sin políticas: ni anon ni authenticated pueden leer ni escribir directamente.

-- Límites: [intentos, ventana] por IP y por email.
create function private.auth_rate_limits(p_kind text)
returns table (per_ip int, per_email int, win interval)
language sql
immutable
set search_path = ''
as $$
  select l.per_ip, l.per_email, l.win from (values
    ('login_failed', 30, 8, interval '15 minutes'),
    ('signup',       60, 3, interval '1 hour'),
    ('magic_link',   60, 5, interval '1 hour')
  ) as l(kind, per_ip, per_email, win)
  where l.kind = p_kind;
$$;

/**
 * ¿Se permite el intento? Para 'signup' y 'magic_link' además lo registra.
 * Para el login se llama con 'login_failed' ANTES de intentar entrar (solo
 * comprueba) y auth_rate_failed() DESPUÉS si la contraseña era incorrecta.
 */
create function public.auth_rate_allowed(p_kind text, p_ip_hash text, p_email_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit record;
  v_ip int;
  v_email int;
begin
  select * into v_limit from private.auth_rate_limits(p_kind);
  if not found then
    raise exception 'Tipo de intento no válido' using errcode = 'check_violation';
  end if;
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Huella no válida' using errcode = 'check_violation';
  end if;

  -- Limpieza de vez en cuando: no hace falta guardar nada de más de un día.
  if random() < 0.02 then
    delete from public.auth_attempts where created_at < now() - interval '1 day';
  end if;

  -- En el login, por IP se cuentan CUENTAS distintas con fallos: así se frena
  -- a quien prueba una contraseña contra muchas cuentas ("password spraying")
  -- sin castigar a una residencia entera porque alguien se equivoque mucho.
  select case when p_kind = 'login_failed' then count(distinct email_hash) else count(*) end into v_ip
    from public.auth_attempts
   where kind = p_kind and ip_hash = p_ip_hash and created_at > now() - v_limit.win;
  select count(*) into v_email from public.auth_attempts
   where kind = p_kind and email_hash = p_email_hash and created_at > now() - v_limit.win;

  if v_ip >= v_limit.per_ip or v_email >= v_limit.per_email then
    return false;
  end if;

  if p_kind <> 'login_failed' then
    insert into public.auth_attempts (kind, ip_hash, email_hash) values (p_kind, p_ip_hash, p_email_hash);
  end if;
  return true;
end;
$$;

-- Registra un login fallido.
create function public.auth_rate_failed(p_ip_hash text, p_email_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auth_attempts (kind, ip_hash, email_hash) values ('login_failed', p_ip_hash, p_email_hash);
$$;

-- Se llaman antes de iniciar sesión, así que anon tiene que poder ejecutarlas.
-- Solo aceptan huellas (64 hex) y no devuelven nada de nadie.
revoke execute on function public.auth_rate_allowed(text, text, text), public.auth_rate_failed(text, text) from public;
grant execute on function public.auth_rate_allowed(text, text, text), public.auth_rate_failed(text, text)
  to anon, authenticated;
