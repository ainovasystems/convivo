-- Control previo de datos personales en reseñas y respuestas públicas (respaldo en BD).
--
-- La app ya lo comprueba al escribir y al guardar (src/lib/moderation/personal-data.ts).
-- Como las reseñas son inmutables (no se pueden corregir una vez publicadas) y la
-- API se puede llamar directamente, la BD repite aquí SOLO los patrones más claros:
-- teléfono, email, DNI/NIE e IBAN español. Las direcciones, los canales de contacto
-- y las tarjetas se quedan solo en la app: tienen más riesgo de falso positivo y,
-- si algo se escapa, el canal de denuncias (personal_data oculta la reseña) lo cubre.
--
-- Solo afecta a altas nuevas hechas por un usuario (auth.uid() no nulo). No toca
-- lo ya publicado, ni las inserciones de sistema (seed, service_role).
-- Si cambias un patrón de teléfono, email, DNI/NIE o IBAN en personal-data.ts,
-- revisa esta función.

create function private.contains_personal_data(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := translate(lower(coalesce(p_text, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc');
  v_run text;
  v_digits text;
begin
  -- Email: nombre@dominio.com · nombre arroba dominio · nombre (at) dominio
  if v_text ~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+'
     or v_text ~ '[a-z0-9._-]{2,}\s*(arroba|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*[a-z0-9-]{2,}' then
    return 'email';
  end if;

  -- Teléfono: 9 cifras que empiezan por 6-9 (con o sin 34 / 0034), con espacios, puntos o guiones.
  for v_run in select (regexp_matches(v_text, '\d(?:[ .\-]?\d)*', 'g'))[1] loop
    v_digits := regexp_replace(v_run, '\D', '', 'g');
    if v_digits ~ '^(?:0034|34)?[6-9][0-9]{8}$' then
      return 'phone';
    end if;
  end loop;

  -- DNI y NIE
  if v_text ~ '(^|[^a-z0-9])\d{2}[. ]?\d{3}[. ]?\d{3}[ -]?[trwagmyfpdxbnjzsqvhlcke]($|[^a-z0-9])'
     or v_text ~ '(^|[^a-z0-9])[xyz][ .-]?\d{7}[ .-]?[a-z]($|[^a-z0-9])' then
    return 'id';
  end if;

  -- IBAN español
  if v_text ~ '(^|[^a-z0-9])es\d{2}([ -]?\d){20}($|[^0-9])' then
    return 'payment';
  end if;

  return null;
end;
$$;

create function private.reviews_personal_data_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and private.contains_personal_data(new.body) is not null then
    raise exception 'El texto no puede incluir teléfonos, emails, DNI/NIE ni IBAN. Las reseñas son públicas y no se pueden editar: quita el dato personal y vuelve a enviarla.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger reviews_personal_data
  before insert on public.reviews
  for each row execute function private.reviews_personal_data_guard();

create trigger review_responses_personal_data
  before insert on public.review_responses
  for each row execute function private.reviews_personal_data_guard();
