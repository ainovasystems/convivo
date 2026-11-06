-- =============================================================================
-- Canal público de denuncias de contenido ilícito (DSA, arts. 16 y 17).
--
-- Cualquiera, tenga cuenta o no (p. ej. un casero reseñado que no usa
-- Convivo), puede notificar un anuncio, un perfil o una reseña. La plataforma:
--   - acusa recibo (referencia en pantalla y email a quien notifica);
--   - se marca un objetivo interno de respuesta de 72 h (due_at);
--   - decide un admin y la decisión queda motivada y registrada
--     (moderation_log). Si se retira contenido, se avisa a la persona afectada
--     con la motivación (art. 17) y a quien notificó con el resultado.
-- Las denuncias internas (botón «Denunciar» de las reseñas) también avisan ya
-- a quien denunció y, si se elimina la reseña, a su autor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Límite de notificaciones por IP y email (reutiliza auth_attempts).
-- -----------------------------------------------------------------------------
alter table public.auth_attempts drop constraint auth_attempts_kind;
alter table public.auth_attempts
  add constraint auth_attempts_kind check (kind in ('login_failed', 'signup', 'magic_link', 'legal_notice'));

create or replace function private.auth_rate_limits(p_kind text)
returns table (per_ip int, per_email int, win interval)
language sql
immutable
set search_path = ''
as $$
  select l.per_ip, l.per_email, l.win from (values
    ('login_failed', 30, 8, interval '15 minutes'),
    ('signup',       60, 3, interval '1 hour'),
    ('magic_link',   60, 5, interval '1 hour'),
    ('legal_notice', 20, 10, interval '1 day')
  ) as l(kind, per_ip, per_email, win)
  where l.kind = p_kind;
$$;

-- -----------------------------------------------------------------------------
-- legal_notices
-- -----------------------------------------------------------------------------
create table public.legal_notices (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  target_type text not null constraint legal_notices_target_type check (target_type in ('listing', 'profile', 'review', 'other')),
  target_id uuid,
  target_url text not null constraint legal_notices_url_len check (char_length(target_url) between 5 and 500),
  reason text not null constraint legal_notices_reason check (reason in (
    'defamation', 'personal_data', 'discrimination', 'fraud', 'minor', 'intellectual_property', 'threat', 'other_illegal'
  )),
  explanation text not null constraint legal_notices_explanation_len check (char_length(btrim(explanation)) between 30 and 3000),
  notifier_name text not null constraint legal_notices_name_len check (char_length(btrim(notifier_name)) between 2 and 120),
  notifier_email text not null constraint legal_notices_email check (notifier_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(notifier_email) <= 200),
  notifier_user_id uuid references public.profiles (id),
  good_faith boolean not null constraint legal_notices_good_faith check (good_faith),
  status text not null default 'received' constraint legal_notices_status check (status in ('received', 'actioned', 'rejected')),
  decision_note text constraint legal_notices_decision_len check (char_length(decision_note) <= 2000),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  -- Objetivo interno de respuesta (el DSA pide diligencia, sin plazo fijo).
  due_at timestamptz not null default now() + interval '72 hours',
  constraint legal_notices_target_id check ((target_type = 'other') = (target_id is null))
);
create index legal_notices_open_idx on public.legal_notices (due_at) where status = 'received';

comment on table public.legal_notices is
  'Notificaciones de contenido ilícito (DSA art. 16), también de personas sin cuenta. Solo las leen los admins.';

alter table public.legal_notices enable row level security;
revoke all on public.legal_notices from anon, authenticated;
grant select on public.legal_notices to authenticated;
create policy legal_notices_select_admin on public.legal_notices
  for select to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Nuevos tipos de aviso in-app y de acciones en el registro de moderación.
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications
  add constraint notifications_kind check (kind in (
    'review_window_opened', 'review_window_closing', 'report_decision', 'content_removed'
  ));

alter table public.moderation_log drop constraint moderation_log_action;
alter table public.moderation_log
  add constraint moderation_log_action check (action in (
    'report_dismissed', 'report_resolved', 'review_deleted', 'listing_flag_dismissed', 'listing_flag_actioned',
    'notice_actioned', 'notice_rejected', 'listing_closed'
  ));
alter table public.moderation_log drop constraint moderation_log_target_type;
alter table public.moderation_log
  add constraint moderation_log_target_type check (target_type in ('report', 'review', 'listing_flag', 'notice', 'listing'));

-- -----------------------------------------------------------------------------
-- Alta de una notificación (anon incluido). Devuelve la referencia.
-- -----------------------------------------------------------------------------
create function public.submit_legal_notice(
  p_target_type text,
  p_target_id uuid,
  p_target_url text,
  p_reason text,
  p_explanation text,
  p_notifier_name text,
  p_notifier_email text,
  p_good_faith boolean,
  p_ip_hash text,
  p_email_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
begin
  if not public.auth_rate_allowed('legal_notice', p_ip_hash, p_email_hash) then
    raise exception 'Has enviado muchas notificaciones. Inténtalo de nuevo mañana.' using errcode = 'P0429';
  end if;
  -- El objetivo tiene que existir (si se indica).
  if p_target_type = 'listing' and not exists (select 1 from public.listings where id = p_target_id)
     or p_target_type = 'profile' and not exists (select 1 from public.profiles where id = p_target_id)
     or p_target_type = 'review' and not exists (select 1 from public.reviews where id = p_target_id) then
    raise exception 'No encontramos el contenido que quieres notificar' using errcode = 'no_data_found';
  end if;

  insert into public.legal_notices (target_type, target_id, target_url, reason, explanation,
                                    notifier_name, notifier_email, notifier_user_id, good_faith)
  values (p_target_type, p_target_id, btrim(p_target_url), p_reason, btrim(p_explanation),
          btrim(p_notifier_name), lower(btrim(p_notifier_email)), (select auth.uid()), coalesce(p_good_faith, false))
  returning reference into v_ref;
  return v_ref;
end;
$$;
revoke execute on function public.submit_legal_notice(text, uuid, text, text, text, text, text, boolean, text, text) from public;
grant execute on function public.submit_legal_notice(text, uuid, text, text, text, text, text, boolean, text, text)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Acciones de moderación sobre el contenido notificado.
-- -----------------------------------------------------------------------------

-- Cerrar un anuncio por moderación (definitivo), con aviso motivado al dueño.
create function public.admin_close_listing(p_listing_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 5 and 1000 then
    raise exception 'Explica brevemente la decisión (5 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  update public.listings set status = 'closed'
   where id = p_listing_id and status <> 'closed'
   returning owner_id, title into v_owner, v_title;
  if v_owner is null then
    raise exception 'Anuncio no encontrado o ya cerrado' using errcode = 'no_data_found';
  end if;
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_owner, 'content_removed', 'Hemos cerrado uno de tus anuncios',
          format('«%s» se ha cerrado por moderación. Motivo: %s. Si no estás de acuerdo, responde al email que te hemos enviado.',
                 left(v_title, 80), left(btrim(p_note), 500)),
          '/mis-anuncios');
  perform private.log_moderation('listing_closed', 'listing', p_listing_id, btrim(p_note));
end;
$$;
revoke execute on function public.admin_close_listing(uuid, text) from public, anon;
grant execute on function public.admin_close_listing(uuid, text) to authenticated;

-- Decidir una notificación: 'actioned' (se retiró el contenido) o 'rejected'.
create function public.admin_decide_legal_notice(p_notice_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo administradores' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('actioned', 'rejected') then
    raise exception 'Decisión no válida' using errcode = 'check_violation';
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 10 and 2000 then
    raise exception 'Motiva la decisión (10 a 2000 caracteres): se le enviará a quien notificó' using errcode = 'check_violation';
  end if;
  update public.legal_notices
     set status = p_decision, decision_note = btrim(p_note), decided_by = (select auth.uid()), decided_at = now()
   where id = p_notice_id and status = 'received';
  if not found then
    raise exception 'Notificación no encontrada o ya decidida' using errcode = 'no_data_found';
  end if;
  perform private.log_moderation(
    case p_decision when 'actioned' then 'notice_actioned' else 'notice_rejected' end, 'notice', p_notice_id, btrim(p_note));
end;
$$;
revoke execute on function public.admin_decide_legal_notice(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_legal_notice(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Motivación también en las denuncias internas (art. 17).
-- -----------------------------------------------------------------------------
create or replace function private.reports_after_update_log()
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
    insert into public.notifications (user_id, kind, title, body, url)
    values (new.reporter_id, 'report_decision',
            case new.status when 'dismissed' then 'Hemos revisado tu denuncia y no retiramos el contenido'
                            else 'Hemos revisado tu denuncia y hemos actuado' end,
            left(coalesce('Motivo: ' || new.resolution_note, 'Gracias por avisarnos.'), 1000),
            null);
  end if;
  return null;
end;
$$;

create or replace function private.reviews_after_update_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and private.is_admin()
     and new.deleted_by is distinct from new.author_id then
    perform private.log_moderation('review_deleted', 'review', new.id, new.deletion_reason);
    insert into public.notifications (user_id, kind, title, body, url)
    values (new.author_id, 'content_removed', 'Hemos eliminado una de tus reseñas',
            left(format('La reseña se ha eliminado por moderación. %s Si no estás de acuerdo, escríbenos al canal de reclamaciones indicado en las condiciones de uso.',
                        coalesce(new.deletion_reason, '')), 1000),
            '/mis-resenas');
  end if;
  return null;
end;
$$;
