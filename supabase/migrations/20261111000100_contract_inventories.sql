-- =============================================================================
-- Contratos, fase 2: inventario de entrada y de salida, con fotos.
--
-- Con el contrato FIRMADO, cualquiera de las dos partes abre el inventario de
-- entrada y va añadiendo elementos (zona, elemento, estado, notas y fotos). Los
-- dos lo revisan y lo confirman. Si alguien cambia algo después de que el otro
-- haya confirmado, las confirmaciones se anulan y hay que volver a confirmar.
-- Confirmado por los dos, queda BLOQUEADO para siempre (para cualquier rol),
-- y sirve de prueba del estado de la vivienda al devolver la fianza.
--
-- El inventario de salida se abre cuando el de entrada está bloqueado.
-- Las fotos van a un bucket PRIVADO (inventory-photos): solo las ven las dos
-- partes del contrato. Ruta: {contract_id}/{inventory_id}/{uuid}.webp
-- =============================================================================

create type public.inventory_stage as enum ('entry', 'exit');
create type public.item_condition as enum ('new', 'good', 'worn', 'damaged');

create table public.contract_inventories (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  stage public.inventory_stage not null,
  created_by uuid references public.profiles (id),
  landlord_confirmed_at timestamptz,
  tenant_confirmed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_inventories_one_per_stage unique (contract_id, stage),
  constraint contract_inventories_locked_complete check (
    locked_at is null or (landlord_confirmed_at is not null and tenant_confirmed_at is not null)
  )
);

create trigger contract_inventories_set_updated_at
  before update on public.contract_inventories
  for each row execute function private.set_updated_at();

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.contract_inventories (id) on delete cascade,
  area text not null constraint inventory_items_area_len check (char_length(btrim(area)) between 1 and 60),
  name text not null constraint inventory_items_name_len check (char_length(btrim(name)) between 1 and 80),
  condition public.item_condition not null,
  notes text not null default '' constraint inventory_items_notes_len check (char_length(notes) <= 500),
  photos text[] not null default '{}' constraint inventory_items_photos_max check (coalesce(array_length(photos, 1), 0) <= 6),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_items_inventory_idx on public.inventory_items (inventory_id, created_at);

create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function private.set_updated_at();

comment on table public.contract_inventories is
  'Inventario de entrada o salida de un contrato firmado; confirmado por las dos partes queda bloqueado.';
comment on table public.inventory_items is
  'Elementos del inventario (zona, elemento, estado, notas y fotos).';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create function private.is_contract_party(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract_id and (select auth.uid()) in (c.landlord_id, c.tenant_id)
  );
$$;

create function private.is_inventory_party(p_inventory_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contract_inventories i
      join public.contracts c on c.id = i.contract_id
     where i.id = p_inventory_id and (select auth.uid()) in (c.landlord_id, c.tenant_id)
  );
$$;

-- Acceso a una foto del bucket por su ruta {contract_id}/{inventory_id}/{fichero}.
-- p_write: además exige que el inventario no esté bloqueado.
create function private.inventory_photo_access(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_name is null or p_name !~ ('^' || v_uuid || '/' || v_uuid || '/' || v_uuid || '\.webp$') then
    return false;
  end if;
  return exists (
    select 1 from public.contract_inventories i
      join public.contracts c on c.id = i.contract_id
     where c.id = split_part(p_name, '/', 1)::uuid
       and i.id = split_part(p_name, '/', 2)::uuid
       and (select auth.uid()) in (c.landlord_id, c.tenant_id)
       and (not p_write or i.locked_at is null)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta del inventario: contrato firmado; salida solo con la entrada bloqueada.
-- -----------------------------------------------------------------------------
create function private.contract_inventories_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
begin
  select * into v_contract from public.contracts where id = new.contract_id;
  if v_contract.id is null
     or ((select auth.uid()) is not null and (select auth.uid()) not in (v_contract.landlord_id, v_contract.tenant_id)) then
    raise exception 'Contrato no encontrado' using errcode = 'no_data_found';
  end if;
  if v_contract.status <> 'signed' then
    raise exception 'El inventario se hace con el contrato ya firmado por las dos partes' using errcode = 'check_violation';
  end if;
  if new.stage = 'exit' and not exists (
    select 1 from public.contract_inventories
     where contract_id = new.contract_id and stage = 'entry' and locked_at is not null
  ) then
    raise exception 'Primero tenéis que confirmar los dos el inventario de entrada' using errcode = 'check_violation';
  end if;
  new.created_by := (select auth.uid());
  new.landlord_confirmed_at := null;
  new.tenant_confirmed_at := null;
  new.locked_at := null;
  return new;
end;
$$;
create trigger contract_inventories_before_insert
  before insert on public.contract_inventories
  for each row execute function private.contract_inventories_before_insert();

-- Bloqueado = inmutable para cualquier rol (también service_role).
create function private.contract_inventories_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked_at is not null then
    raise exception 'El inventario está confirmado por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.contract_id <> old.contract_id or new.stage <> old.stage then
    raise exception 'No se puede cambiar el contrato ni el tipo de inventario' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger contract_inventories_guard
  before update or delete on public.contract_inventories
  for each row execute function private.contract_inventories_guard();

-- -----------------------------------------------------------------------------
-- Elementos: solo con el inventario abierto; las fotos, dentro de su carpeta.
-- Cualquier cambio anula las confirmaciones (hay que volver a revisar).
-- -----------------------------------------------------------------------------
create function private.inventory_items_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.contract_inventories%rowtype;
  v_inventory_id uuid := case when tg_op = 'DELETE' then old.inventory_id else new.inventory_id end;
  v_photo text;
begin
  select * into v_inv from public.contract_inventories where id = v_inventory_id;
  if v_inv.locked_at is not null then
    raise exception 'El inventario está confirmado por las dos partes y no se puede modificar' using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    update public.contract_inventories
       set landlord_confirmed_at = null, tenant_confirmed_at = null
     where id = v_inv.id and (landlord_confirmed_at is not null or tenant_confirmed_at is not null);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.inventory_id <> old.inventory_id then
    raise exception 'Un elemento no se puede mover a otro inventario' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    if (select count(*) from public.inventory_items where inventory_id = v_inv.id) >= 150 then
      raise exception 'El inventario admite como mucho 150 elementos' using errcode = 'check_violation';
    end if;
  else
    new.created_by := old.created_by;
  end if;
  new.area := btrim(new.area);
  new.name := btrim(new.name);
  new.notes := btrim(new.notes);

  foreach v_photo in array new.photos loop
    if v_photo !~ ('^' || v_inv.contract_id::text || '/' || v_inv.id::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$') then
      raise exception 'Foto no válida para este inventario' using errcode = 'check_violation';
    end if;
  end loop;

  update public.contract_inventories
     set landlord_confirmed_at = null, tenant_confirmed_at = null
   where id = v_inv.id and (landlord_confirmed_at is not null or tenant_confirmed_at is not null);
  return new;
end;
$$;
create trigger inventory_items_before_change
  before insert or update or delete on public.inventory_items
  for each row execute function private.inventory_items_before_change();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.contract_inventories enable row level security;
revoke all on public.contract_inventories from anon, authenticated;
grant select on public.contract_inventories to authenticated;
grant insert (contract_id, stage) on public.contract_inventories to authenticated;

create policy contract_inventories_select_party on public.contract_inventories
  for select to authenticated
  using ((select private.is_contract_party(contract_id)) or (select private.is_admin()));

create policy contract_inventories_insert_party on public.contract_inventories
  for insert to authenticated
  with check ((select private.is_contract_party(contract_id)));

alter table public.inventory_items enable row level security;
revoke all on public.inventory_items from anon, authenticated;
grant select, delete on public.inventory_items to authenticated;
grant insert (inventory_id, area, name, condition, notes, photos) on public.inventory_items to authenticated;
grant update (area, name, condition, notes, photos) on public.inventory_items to authenticated;

create policy inventory_items_select_party on public.inventory_items
  for select to authenticated
  using ((select private.is_inventory_party(inventory_id)) or (select private.is_admin()));

create policy inventory_items_insert_party on public.inventory_items
  for insert to authenticated
  with check ((select private.is_inventory_party(inventory_id)));

create policy inventory_items_update_party on public.inventory_items
  for update to authenticated
  using ((select private.is_inventory_party(inventory_id)))
  with check ((select private.is_inventory_party(inventory_id)));

create policy inventory_items_delete_party on public.inventory_items
  for delete to authenticated
  using ((select private.is_inventory_party(inventory_id)));

-- -----------------------------------------------------------------------------
-- Storage: bucket privado para las fotos del inventario.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-photos', 'inventory-photos', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy inventory_photos_select_party on storage.objects
  for select to authenticated
  using (bucket_id = 'inventory-photos' and (select private.inventory_photo_access(name, false)));

create policy inventory_photos_insert_party on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inventory-photos' and (select private.inventory_photo_access(name, true)));

create policy inventory_photos_delete_party on storage.objects
  for delete to authenticated
  using (bucket_id = 'inventory-photos' and (select private.inventory_photo_access(name, true)));

-- -----------------------------------------------------------------------------
-- Avisos in-app
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications
  add constraint notifications_kind check (kind in (
    'review_window_opened', 'review_window_closing', 'report_decision', 'content_removed',
    'contract_to_sign', 'contract_signed', 'contract_cancelled',
    'inventory_to_confirm', 'inventory_confirmed'
  ));

-- -----------------------------------------------------------------------------
-- RPC: confirmar el inventario (la parte que llama).
-- -----------------------------------------------------------------------------
create function public.confirm_inventory(p_inventory_id uuid)
returns public.contract_inventories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_inv public.contract_inventories%rowtype;
  v_contract public.contracts%rowtype;
  v_other uuid;
  v_label text;
begin
  select * into v_inv from public.contract_inventories where id = p_inventory_id for update;
  select * into v_contract from public.contracts where id = v_inv.contract_id;
  if v_inv.id is null or v_actor is null or v_actor not in (v_contract.landlord_id, v_contract.tenant_id) then
    raise exception 'Inventario no encontrado' using errcode = 'no_data_found';
  end if;
  if v_inv.locked_at is not null then
    raise exception 'El inventario ya está confirmado por las dos partes' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.inventory_items where inventory_id = v_inv.id) then
    raise exception 'Añade al menos un elemento antes de confirmar' using errcode = 'check_violation';
  end if;

  v_other := case when v_actor = v_contract.landlord_id then v_contract.tenant_id else v_contract.landlord_id end;
  v_label := case when v_inv.stage = 'entry' then 'de entrada' else 'de salida' end;
  if v_actor = v_contract.landlord_id then
    if v_inv.landlord_confirmed_at is not null then
      raise exception 'Ya has confirmado este inventario' using errcode = 'check_violation';
    end if;
    v_inv.landlord_confirmed_at := now();
  else
    if v_inv.tenant_confirmed_at is not null then
      raise exception 'Ya has confirmado este inventario' using errcode = 'check_violation';
    end if;
    v_inv.tenant_confirmed_at := now();
  end if;

  if v_inv.landlord_confirmed_at is not null and v_inv.tenant_confirmed_at is not null then
    v_inv.locked_at := now();
    insert into public.notifications (user_id, kind, title, body, url)
    select u, 'inventory_confirmed', 'Inventario ' || v_label || ' confirmado',
           case when v_inv.stage = 'entry'
                then 'Los dos habéis confirmado el estado de la vivienda. Ya no se puede cambiar.'
                else 'Los dos habéis confirmado el estado de salida. La fianza se devuelve en el plazo de un mes desde la entrega de llaves.' end,
           '/contratos/' || v_contract.id || '/inventario/' || case when v_inv.stage = 'entry' then 'entrada' else 'salida' end
      from unnest(array[v_contract.landlord_id, v_contract.tenant_id]) as u;
  else
    insert into public.notifications (user_id, kind, title, body, url)
    values (v_other, 'inventory_to_confirm', 'Tienes un inventario ' || v_label || ' por revisar',
            'Revisa los elementos y las fotos. Si estás de acuerdo, confírmalo.',
            '/contratos/' || v_contract.id || '/inventario/' || case when v_inv.stage = 'entry' then 'entrada' else 'salida' end);
  end if;

  update public.contract_inventories
     set landlord_confirmed_at = v_inv.landlord_confirmed_at,
         tenant_confirmed_at = v_inv.tenant_confirmed_at,
         locked_at = v_inv.locked_at
   where id = v_inv.id
  returning * into v_inv;
  return v_inv;
end;
$$;

revoke execute on function public.confirm_inventory(uuid) from public, anon;
grant execute on function public.confirm_inventory(uuid) to authenticated;
