-- =============================================================================
-- Solicitud de retirada: avisos de la decisión (ajuste tras la revisión)
-- =============================================================================
-- 1. Cada decisión lleva en la URL la reseña a la que se refiere: así la
--    decisión sobre una reseña no da por atendido el aviso de otra (la URL del
--    aviso es su «asunto», ver private.notifications_before_insert).
-- 2. El texto de la retirada no afirma «como solicitaste»: la reseña puede
--    haberse retirado por otra denuncia mientras la solicitud estaba abierta.

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
                              else 'Hemos retirado tu reseña' end,
              left(case new.status
                     when 'dismissed' then 'Hemos revisado tu solicitud de retirada y la reseña sigue como estaba.'
                     else 'Habías solicitado su retirada. Queda constancia de que la reseña existió, sin su texto ni su nota.'
                   end || coalesce(' Motivo: ' || new.resolution_note, ''), 1000),
              '/mis-resenas?retirada=' || new.target_review_id);
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
