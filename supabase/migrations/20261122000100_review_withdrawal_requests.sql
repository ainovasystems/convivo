-- =============================================================================
-- Solicitud de retirada de una reseña propia (auditoría I11)
-- =============================================================================
-- Las reseñas son inmutables: nadie las edita ni las borra por su cuenta.
-- Quien escribió una reseña puede SOLICITAR su retirada con un motivo; la
-- solicitud es una denuncia más (public.reports, motivo 'author_withdrawal')
-- y la decide un admin. Hasta entonces la reseña sigue como estaba.
--
-- Compatible con el código anterior (decisión 79): solo añade un valor al
-- enumerado y cambia funciones; la app antigua nunca borraba reseñas del autor.

-- El valor nuevo solo se usa dentro de funciones plpgsql (y comparando como
-- texto), así que esta migración puede aplicarse en una sola transacción.
alter type public.report_reason add value if not exists 'author_withdrawal';

-- -----------------------------------------------------------------------------
-- Alta: la solicitud solo vale sobre una reseña propia y con motivo.
-- -----------------------------------------------------------------------------
create or replace function private.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_message_id is not null then
    if not exists (
      select 1
        from public.messages m
        join public.interests i on i.id = m.interest_id
        join public.listings l on l.id = i.listing_id
       where m.id = new.target_message_id
         and new.reporter_id in (i.from_user, l.owner_id)
    ) then
      raise exception 'No puedes denunciar este mensaje' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.reason::text = 'author_withdrawal' then
    if new.target_review_id is null or not exists (
      select 1 from public.reviews r
       where r.id = new.target_review_id and r.author_id = new.reporter_id and r.deleted_at is null
    ) then
      raise exception 'Solo puedes solicitar la retirada de una reseña que hayas escrito tú'
        using errcode = 'insufficient_privilege';
    end if;
    if new.details is null or char_length(btrim(new.details)) < 10 then
      raise exception 'Indica el motivo de la solicitud (mínimo 10 caracteres)' using errcode = 'check_violation';
    end if;
    new.details := btrim(new.details);
  end if;
  new.status := 'open';
  new.resolved_at := null;
  new.resolved_by := null;
  new.resolution_note := null;
  new.created_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Borrar una reseña: solo un admin. El autor ya no puede hacerlo por su cuenta.
-- -----------------------------------------------------------------------------
create or replace function public.delete_review(p_review_id uuid, p_reason text)
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
  if not private.is_admin() then
    raise exception 'Las reseñas no se pueden borrar. Puedes solicitar su retirada desde «Mis reseñas».'
      using errcode = 'insufficient_privilege';
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

-- -----------------------------------------------------------------------------
-- Decisión: el autor recibe un aviso propio de su solicitud (no el de «denuncia»).
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
    if new.reason::text = 'author_withdrawal' then
      insert into public.notifications (user_id, kind, title, body, url)
      values (new.reporter_id, 'report_decision',
              case new.status when 'dismissed' then 'No hemos retirado tu reseña'
                              else 'Hemos retirado tu reseña, como solicitaste' end,
              left(case new.status
                     when 'dismissed' then 'Hemos revisado tu solicitud de retirada y la reseña sigue como estaba.'
                     else 'Hemos revisado tu solicitud de retirada. Queda constancia de que la reseña existió, sin su texto ni su nota.'
                   end || coalesce(' Motivo: ' || new.resolution_note, ''), 1000),
              '/mis-resenas');
    else
      insert into public.notifications (user_id, kind, title, body, url)
      values (new.reporter_id, 'report_decision',
              case new.status when 'dismissed' then 'Hemos revisado tu denuncia y no retiramos el contenido'
                              else 'Hemos revisado tu denuncia y hemos actuado' end,
              left(coalesce('Motivo: ' || new.resolution_note, 'Gracias por avisarnos.'), 1000),
              null);
    end if;
  end if;
  return null;
end;
$$;

-- Si la reseña se retira a petición de su autor, no se le dice además que se
-- ha «eliminado por moderación»: recibe el aviso de su solicitud (arriba).
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
    if not exists (
      select 1 from public.reports r
       where r.target_review_id = new.id and r.reporter_id = new.author_id
         and r.reason::text = 'author_withdrawal' and r.status = 'open'
    ) then
      insert into public.notifications (user_id, kind, title, body, url)
      values (new.author_id, 'content_removed', 'Hemos eliminado una de tus reseñas',
              left(format('La reseña se ha eliminado por moderación. %s Si no estás de acuerdo, escríbenos al canal de reclamaciones indicado en las condiciones de uso.',
                          coalesce(new.deletion_reason, '')), 1000),
              '/mis-resenas');
    end if;
  end if;
  return null;
end;
$$;
