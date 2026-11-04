-- =============================================================================
-- 07 · Denuncias (reports)
-- =============================================================================
-- Claves foráneas reales para cada tipo de objetivo (en vez de un target_id
-- genérico sin integridad) y CHECK de "exactamente uno".

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_listing_id uuid references public.listings (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete cascade,
  target_review_id uuid references public.reviews (id) on delete cascade,
  target_message_id uuid references public.messages (id) on delete cascade,
  reason public.report_reason not null,
  details text constraint reports_details_len check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text constraint reports_resolution_note_len check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint reports_one_target check (
    num_nonnulls(target_listing_id, target_user_id, target_review_id, target_message_id) = 1
  ),
  constraint reports_not_self check (target_user_id is null or target_user_id <> reporter_id),
  constraint reports_resolution_shape check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status <> 'open' and resolved_at is not null)
  )
);

create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_listing_idx on public.reports (target_listing_id) where target_listing_id is not null;
create index reports_user_idx on public.reports (target_user_id) where target_user_id is not null;
create index reports_review_idx on public.reports (target_review_id) where target_review_id is not null;
create index reports_message_idx on public.reports (target_message_id) where target_message_id is not null;

-- Un mensaje solo lo puede denunciar quien participa en esa conversación.
create function private.reports_before_insert()
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
  new.status := 'open';
  new.resolved_at := null;
  new.resolved_by := null;
  new.resolution_note := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function private.reports_before_insert();

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_id, target_listing_id, target_user_id, target_review_id, target_message_id, reason, details)
  on public.reports to authenticated;
grant update (status, resolved_by, resolved_at, resolution_note) on public.reports to authenticated;

create policy reports_select_own_or_admin on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- Solo administradores resuelven denuncias.
create policy reports_update_admin on public.reports
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()) and resolved_by = (select auth.uid()));
