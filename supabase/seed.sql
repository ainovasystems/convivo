-- =============================================================================
-- Datos de ejemplo para DESARROLLO. ¡NO ejecutar en producción!
-- =============================================================================
-- Usuarios (todos con la contraseña: convivo-dev-1234)
--   ana@convivo.test     Ana Varela      propietaria en Lugo
--   brais@convivo.test   Brais Lorenzo   inquilino (Lugo), estudiante USC
--   carla@convivo.test   Carla Méndez    compañera de piso en Lugo
--   diego@convivo.test   Diego Fernández propietario en A Coruña
--   elena@convivo.test   Elena Ruiz      inquilina en A Coruña / busca en Madrid
--   farid@convivo.test   Farid Benali    propietario en Madrid
--   gemma@convivo.test   Gemma Puig      propietaria en Barcelona
--   hugo@convivo.test    Hugo Martín     busca habitación en Barcelona
--
-- Las fechas son relativas a current_date para que el seed siga siendo
-- coherente lo ejecutes cuando lo ejecutes.

-- -----------------------------------------------------------------------------
-- Usuarios (el trigger on_auth_user_created crea los perfiles)
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('convivo-dev-1234', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object('display_name', u.name),
  now() - interval '400 days', now(),
  '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'ana@convivo.test',   'Ana Varela'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'brais@convivo.test', 'Brais Lorenzo'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'carla@convivo.test', 'Carla Méndez'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'diego@convivo.test', 'Diego Fernández'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'elena@convivo.test', 'Elena Ruiz'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, 'farid@convivo.test', 'Farid Benali'),
  ('a0000000-0000-4000-8000-000000000007'::uuid, 'gemma@convivo.test', 'Gemma Puig'),
  ('a0000000-0000-4000-8000-000000000008'::uuid, 'hugo@convivo.test',  'Hugo Martín')
) as u (id, email, name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.email like '%@convivo.test';

-- -----------------------------------------------------------------------------
-- Perfiles
-- -----------------------------------------------------------------------------
update public.profiles p set
  bio = v.bio, city = v.city, occupation = v.occupation, age_range = v.age_range::public.age_range,
  languages = v.languages::text[], habits = v.habits::jsonb, roles = v.roles::public.user_role[]
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid,
   'Profesora jubilada. Alquilo habitaciones en mi piso del centro de Lugo desde hace años; me gusta que la casa sea tranquila y cuidada.',
   'Lugo', 'Profesora jubilada', '55-64', '{es,gl}', '{"smoker": false, "pets": true, "schedule": "early", "cleanliness": 5, "noise": 1}', '{landlord}'),
  ('a0000000-0000-4000-8000-000000000002'::uuid,
   'Estudiante de Veterinaria en el campus de Lugo. Ordenado, cocino bastante y salgo a correr por el Miño.',
   'Lugo', 'Estudiante de Veterinaria', '18-24', '{es,gl,en}', '{"smoker": false, "pets": false, "schedule": "standard", "cleanliness": 4, "noise": 2, "guests": "sometimes"}', '{tenant,flatmate}'),
  ('a0000000-0000-4000-8000-000000000003'::uuid,
   'Enfermera en el HULA con turnos rotativos. Busco convivencia tranquila y respeto los descansos de los demás.',
   'Lugo', 'Enfermera', '25-34', '{es,gl}', '{"smoker": false, "pets": false, "schedule": "shifts", "cleanliness": 4, "noise": 1, "guests": "rarely"}', '{flatmate}'),
  ('a0000000-0000-4000-8000-000000000004'::uuid,
   'Tengo dos pisos en A Coruña que alquilo a estudiantes y profesionales. Respondo rápido y arreglo las cosas a tiempo.',
   'A Coruña', 'Autónomo', '45-54', '{es,gl,pt}', '{"smoker": false, "cleanliness": 4}', '{landlord}'),
  ('a0000000-0000-4000-8000-000000000005'::uuid,
   'Desarrolladora web. Viví dos años en A Coruña y ahora me mudo a Madrid por trabajo.',
   'Madrid', 'Desarrolladora web', '25-34', '{es,en}', '{"smoker": false, "pets": true, "schedule": "standard", "cleanliness": 4, "noise": 2, "guests": "sometimes"}', '{tenant}'),
  ('a0000000-0000-4000-8000-000000000006'::uuid,
   'Alquilo un piso entero en Lavapiés y una habitación en Chamberí. Contratos claros y fianza depositada en el organismo autonómico.',
   'Madrid', 'Ingeniero de caminos', '35-44', '{es,fr,ar}', '{"smoker": false, "cleanliness": 4}', '{landlord}'),
  ('a0000000-0000-4000-8000-000000000007'::uuid,
   'Diseñadora gráfica. Comparto mi piso de Gràcia con una habitación libre; ambiente creativo y tranquilo.',
   'Barcelona', 'Diseñadora gráfica', '35-44', '{ca,es,en}', '{"smoker": false, "pets": true, "schedule": "standard", "cleanliness": 4, "noise": 2}', '{landlord,flatmate}'),
  ('a0000000-0000-4000-8000-000000000008'::uuid,
   'Investigador predoctoral en la UPF. Busco habitación cerca de Ciutadella o Poblenou.',
   'Barcelona', 'Investigador predoctoral', '25-34', '{es,en,it}', '{"smoker": false, "pets": false, "schedule": "night", "cleanliness": 3, "noise": 2, "guests": "rarely"}', '{tenant}')
) as v (id, bio, city, occupation, age_range, languages, habits, roles)
where p.id = v.id;

-- -----------------------------------------------------------------------------
-- Anuncios
-- -----------------------------------------------------------------------------
insert into public.listings (
  id, owner_id, kind, status, title, description, city, province, neighborhood,
  monthly_rent, deposit, available_from, min_stay_months, bills_included, furnished,
  rules, size_m2, bedrooms, bathrooms, current_flatmates,
  max_budget, zones, move_in_date, created_at
) values
  -- Lugo
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'room', 'active',
   'Habitación exterior junto a la Muralla',
   'Habitación amplia y luminosa en piso reformado a dos minutos de la Muralla. Calefacción central, cocina equipada y salón compartido. Ideal para estudiantes o profesionales tranquilos.',
   'Lugo', 'Lugo', 'Centro histórico', 290, 290, current_date + 15, 5, true, true,
   '{"pets": true, "smoking": false, "visitors": true, "couples": false}', 110, 4, 2, 2,
   null, '{}', null, now() - interval '20 days'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'room', 'active',
   'Habitación con baño propio cerca del campus',
   'Habitación con baño privado en piso compartido a 10 minutos andando del campus de Lugo. Gastos de luz y agua incluidos, internet de fibra.',
   'Lugo', 'Lugo', 'Campus', 320, 320, current_date + 30, 9, true, true,
   '{"pets": false, "smoking": false, "visitors": true}', 95, 3, 2, 1,
   null, '{}', null, now() - interval '12 days'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'seeking', 'active',
   'Enfermera busca piso compartido tranquilo en Lugo',
   'Trabajo a turnos en el HULA y busco habitación en piso tranquilo, preferiblemente cerca del hospital o con buen bus. Muy respetuosa con los descansos.',
   'Lugo', 'Lugo', null, null, null, null, null, null, null,
   '{}', null, null, null, null,
   340, '{"As Gándaras","Residencia","Centro"}', current_date + 45, now() - interval '5 days'),
  -- A Coruña
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'flat', 'active',
   'Piso de 2 habitaciones con vistas a Riazor',
   'Piso entero de dos habitaciones, salón con vistas al mar y cocina independiente. Totalmente amueblado. A un paso de la playa y del paseo marítimo.',
   'A Coruña', 'A Coruña', 'Riazor', 950, 1900, current_date + 20, 12, false, true,
   '{"pets": false, "smoking": false}', 75, 2, 1, null,
   null, '{}', null, now() - interval '9 days'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000004', 'room', 'active',
   'Habitación en piso de estudiantes en Elviña',
   'Habitación en piso de cuatro, a cinco minutos de la Facultad de Informática. Ambiente de estudio, limpieza por turnos y buena convivencia.',
   'A Coruña', 'A Coruña', 'Elviña', 330, 330, current_date + 10, 9, false, true,
   '{"pets": false, "smoking": false, "visitors": true}', 100, 4, 2, 3,
   null, '{}', null, now() - interval '3 days'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004', 'room', 'closed',
   'Habitación en Monte Alto (alquilada)',
   'Habitación en piso compartido en Monte Alto, cerca de la Torre de Hércules. Anuncio cerrado tras alquilarse.',
   'A Coruña', 'A Coruña', 'Monte Alto', 310, 310, current_date - 420, 6, true, true,
   '{"pets": true, "smoking": false}', 85, 3, 1, 2,
   null, '{}', null, now() - interval '430 days'),
  -- Madrid
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000006', 'flat', 'active',
   'Estudio reformado en Lavapiés',
   'Estudio de 35 m² completamente reformado, con aire acondicionado y cocina americana. Metro Lavapiés a 3 minutos. Perfecto para una persona.',
   'Madrid', 'Madrid', 'Lavapiés', 890, 1780, current_date + 25, 12, false, true,
   '{"pets": false, "smoking": false}', 35, 0, 1, null,
   null, '{}', null, now() - interval '7 days'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000006', 'room', 'active',
   'Habitación doble en Chamberí con balcón',
   'Habitación doble con balcón a la calle en piso clásico de Chamberí. Dos compañeros, ambos trabajando. Limpieza quincenal incluida.',
   'Madrid', 'Madrid', 'Chamberí', 650, 650, current_date + 5, 6, true, true,
   '{"pets": false, "smoking": false, "visitors": true, "couples": true}', 120, 3, 2, 2,
   null, '{}', null, now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000005', 'seeking', 'active',
   'Desarrolladora busca habitación en Madrid centro',
   'Me mudo a Madrid por trabajo (remoto parcial). Busco habitación en piso tranquilo con buena conexión a internet. Tengo un gato muy tranquilo.',
   'Madrid', 'Madrid', null, null, null, null, null, null, null,
   '{}', null, null, null, null,
   700, '{"Chamberí","Malasaña","Arganzuela"}', current_date + 30, now() - interval '1 day'),
  -- Barcelona
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000007', 'room', 'active',
   'Habitación tranquila en Gràcia',
   'Habitación individual en piso con terraza en el corazón de Gràcia. Convivirás conmigo y con mi perra, muy tranquila. Buen ambiente y respeto mutuo.',
   'Barcelona', 'Barcelona', 'Gràcia', 600, 1200, current_date + 14, 6, true, true,
   '{"pets": true, "smoking": false, "visitors": true}', 90, 3, 1, 1,
   null, '{}', null, now() - interval '6 days'),
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000008', 'seeking', 'active',
   'Investigador busca habitación cerca de la UPF',
   'Predoc en la UPF, horario de tarde-noche. Busco habitación en Poblenou, Vila Olímpica o cerca de Ciutadella.',
   'Barcelona', 'Barcelona', null, null, null, null, null, null, null,
   '{}', null, null, null, null,
   650, '{"Poblenou","Vila Olímpica","El Born"}', current_date + 20, now() - interval '4 days'),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000007', 'flat', 'draft',
   'Piso en Sants (borrador)', '', 'Barcelona', 'Barcelona', 'Sants',
   null, null, null, null, null, null,
   '{}', null, null, null, null,
   null, '{}', null, now());

-- Dos habitaciones de estudiantes se alquilan por curso (unos 9 meses).
update public.listings
   set rental_term = 'academic_year', available_until = available_from + interval '9 months' - interval '1 day'
 where id in ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005');

insert into public.listing_addresses (listing_id, address_line, floor_door, postal_code) values
  ('b0000000-0000-4000-8000-000000000001', 'Rúa da Raíña 14', '2º izq.', '27001'),
  ('b0000000-0000-4000-8000-000000000002', 'Rúa Montero Ríos 31', '4º B', '27002'),
  ('b0000000-0000-4000-8000-000000000004', 'Rúa Manuel Murguía 8', '6º A', '15011'),
  ('b0000000-0000-4000-8000-000000000005', 'Rúa da Fraga 3', '1º D', '15008'),
  ('b0000000-0000-4000-8000-000000000006', 'Rúa San Roque 22', '3º', '15002'),
  ('b0000000-0000-4000-8000-000000000007', 'Calle del Ave María 40', 'Bajo C', '28012'),
  ('b0000000-0000-4000-8000-000000000008', 'Calle de Ponzano 17', '3º dcha.', '28010'),
  ('b0000000-0000-4000-8000-000000000010', 'Carrer de Verdi 52', '2n 1a', '08012');

-- -----------------------------------------------------------------------------
-- Intereses y mensajes
-- -----------------------------------------------------------------------------
insert into public.interests (id, listing_id, from_user, message) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'Hola Ana, soy estudiante de Veterinaria y me encaja mucho la habitación. ¿Podría verla esta semana?'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000005',
   'Hola Farid, me mudo a Madrid en un mes por trabajo. ¿Se admitiría un gato pequeño y tranquilo?'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000008',
   'Hola Gemma, la habitación me parece genial. Trabajo en la UPF y soy muy tranquilo. ¿Cuándo podría visitarla?');

update public.interests set status = 'accepted' where id = 'c0000000-0000-4000-8000-000000000001';

insert into public.messages (interest_id, sender_id, body, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '¿Te viene bien el jueves por la tarde?', now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Perfecto, el jueves a las 18:00. Te paso la dirección por aquí.', now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000006', 'Hola Elena, en principio no hay problema con un gato. ¿Quieres hacer una videollamada?', now() - interval '1 day');

-- -----------------------------------------------------------------------------
-- Estancias
-- -----------------------------------------------------------------------------
-- s1: Brais vivió en el piso de Ana (Lugo) con Carla de compañera. Terminó
--     hace 40 días -> ventana cerrada, reseñas cruzadas publicadas.
-- s2: Elena vivió en el piso de Monte Alto de Diego (A Coruña), estancia
--     retroactiva terminada hace 5 días -> ventana abierta; solo Elena ha
--     reseñado: su reseña está oculta (doble ciego) hasta que Diego opine o
--     pasen 14 días.
-- s3: propuesta pendiente de confirmar (Gemma -> Hugo en Gràcia).
insert into public.stays (id, listing_id, host_id, guest_id, proposed_by, start_date, end_date,
  is_retroactive, host_confirmed_at, guest_confirmed_at, status, activated_at, ended_at, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   current_date - 300, current_date - 40, true,
   now() - interval '300 days', now() - interval '299 days', 'ended', now() - interval '299 days', now() - interval '40 days',
   now() - interval '300 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000006',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005',
   current_date - 400, current_date - 5, true,
   now() - interval '30 days', now() - interval '31 days', 'ended', now() - interval '30 days', now() - interval '5 days',
   now() - interval '31 days');

insert into public.stays (id, listing_id, interest_id, host_id, guest_id, proposed_by, start_date,
  host_confirmed_at, status) values
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000010', null,
   'a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000007',
   current_date - 1, now(), 'proposed');

insert into public.stay_participants (stay_id, user_id, added_by, confirmed_at) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', now() - interval '298 days');

-- -----------------------------------------------------------------------------
-- Reseñas (como sistema: el trigger calcula relación y publicación)
-- -----------------------------------------------------------------------------
insert into public.reviews (stay_id, author_id, subject_type, subject_listing_id, subject_user_id, rating, criteria, body) values
  -- s1: Brais -> inmueble
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'listing',
   'b0000000-0000-4000-8000-000000000001', null, 5,
   '{"cleanliness": 5, "accuracy": 5, "area": 5, "condition": 4, "value": 5}',
   'El piso es exactamente como en las fotos: luminoso, caliente en invierno y en una zona inmejorable. La habitación es amplia y la cocina está muy bien equipada.'),
  -- s1: Brais -> Ana
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'user',
   null, 'a0000000-0000-4000-8000-000000000001', 5,
   '{"communication": 5, "treatment": 5, "compliance": 5, "deposit": 5}',
   'Ana es una casera de diez: responde enseguida, arregló la caldera en un día y me devolvió la fianza completa al irme. Muy recomendable.'),
  -- s1: Ana -> Brais
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'user',
   null, 'a0000000-0000-4000-8000-000000000002', 5,
   '{"payment_punctuality": 5, "home_care": 4, "coexistence": 5, "communication": 5}',
   'Brais pagó siempre puntual y cuidó la habitación. Muy educado con sus compañeras y siempre dispuesto a ayudar con las tareas comunes.'),
  -- s1: Carla <-> Brais
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'user',
   null, 'a0000000-0000-4000-8000-000000000002', 4,
   '{"coexistence": 5, "cleanliness": 4, "noise": 4, "respect": 5}',
   'Buen compañero. Respetaba mis horarios de turno de noche y la cocina siempre quedaba recogida. Algún fin de semana un poco de ruido, nada grave.'),
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'user',
   null, 'a0000000-0000-4000-8000-000000000003', 5,
   '{"coexistence": 5, "cleanliness": 5, "noise": 5, "respect": 5}',
   'Carla es la compañera ideal: limpia, tranquila y muy maja. Organizamos el cuadrante de limpieza juntos y funcionó genial todo el año.'),
  -- s2: Elena -> Diego (pendiente: doble ciego)
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005', 'user',
   null, 'a0000000-0000-4000-8000-000000000004', 4,
   '{"communication": 4, "treatment": 5, "compliance": 4, "deposit": 4}',
   'Diego fue correcto y resolutivo durante el año y pico que viví en Monte Alto. La devolución de la fianza tardó algo más de lo esperado, pero llegó completa.');
