-- -----------------------------------------------------------------------------
-- Quita la preferencia «solo chicas / solo chicos» (listings.cohabitation).
-- Motivo: riesgo con la Ley 15/2022 (igualdad de trato y no discriminación).
-- Revoca la decisión 41. Al borrar la columna se limpian los anuncios que ya la
-- tenían rellena. Lo que cada anunciante escriba en su descripción sigue siendo
-- libre (el filtro anti-discriminación del texto no se toca).
-- -----------------------------------------------------------------------------
alter table public.listings drop constraint if exists listings_cohabitation_shared;
alter table public.listings drop column if exists cohabitation;
drop type if exists public.cohabitation_preference;
