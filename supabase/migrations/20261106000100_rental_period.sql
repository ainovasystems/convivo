-- =============================================================================
-- Periodo de alquiler de un anuncio.
--   indefinite    : sin fecha de fin (lo habitual en pisos).
--   academic_year : un curso universitario (normalmente de septiembre a junio).
--   fixed         : fechas concretas (por ejemplo, un verano o unas prácticas).
-- available_until es el último día del periodo: obligatorio para publicar si no
-- es indefinido, y siempre posterior a la fecha de entrada. Sirve para los tres
-- tipos (en "busco", es hasta cuándo necesita el piso).
-- =============================================================================

create type public.rental_term as enum ('indefinite', 'academic_year', 'fixed');

alter table public.listings
  add column rental_term public.rental_term not null default 'indefinite',
  add column available_until date;

alter table public.listings
  add constraint listings_until_only_with_term
    check (rental_term <> 'indefinite' or available_until is null),
  add constraint listings_until_required
    check (status = 'draft' or rental_term = 'indefinite' or available_until is not null),
  add constraint listings_until_after_start
    check (available_until is null or available_until > coalesce(available_from, move_in_date));

comment on column public.listings.rental_term is 'Periodo de alquiler: indefinido, curso universitario o fechas concretas.';
comment on column public.listings.available_until is 'Último día del periodo (null si es indefinido).';

create index listings_active_term_idx on public.listings (rental_term) where status = 'active';
