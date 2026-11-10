# Convivo — guía para Claude Code

> "Convivo" es un nombre provisional.

## Cómo trabajamos (leer primero)

- Se trabaja **por bloques**. El bloque actual lo marca `docs/HOJA-DE-RUTA.md` («SIGUIENTE») o el ENCARGO que pegue el usuario. **No hagas trabajo fuera del encargo:** lo que surja va a «Ideas aparcadas» de la hoja de ruta.
- Si aparece una decisión de producto, pregunta; no la inventes. No reabras las decisiones ya tomadas.
- **Al cerrar cada bloque**, siempre:
  1. pasa las comprobaciones y sube los cambios;
  2. aplica las migraciones solo a «Convivo pruebas»;
  3. actualiza este fichero, `docs/HOJA-DE-RUTA.md` y `docs/CONTEXTO-PROYECTO.md`;
  4. responde con el **PARTE DE CIERRE** de `docs/COMO-TRABAJAMOS.md`.
- El usuario no es técnico: respuestas en castellano claro y breve.

## Producto

Plataforma web en español (España) para la oferta y la demanda de vivienda compartida, un "LinkedIn de la vivienda compartida".

- **Tres tipos de anuncio** (`listings.kind`): `room` (habitación en piso compartido), `flat` (piso entero en alquiler) y `seeking` (busco compañero o piso).
- **Perfiles** de usuario al estilo LinkedIn: bio, ciudad, ocupación, hábitos de convivencia, verificaciones y reputación.
- **Reseñas bidireccionales**: inquilino → inmueble, inquilino → propietario, propietario → inquilino y compañero ↔ compañero.

### Regla de negocio central (no negociable)

Una reseña **solo** se puede escribir tras una **estancia (`stay`) confirmada por ambas partes**, y el autor tiene que formar parte de esa estancia (host, guest o compañero registrado). Además:

1. **Doble ciego**: una reseña no la ven terceros hasta que la contraparte también ha reseñado o han pasado 14 días desde que se abrió la ventana. El autor siempre ve la suya.
2. **Inmutables**: una reseña publicada no se puede editar. Solo se puede borrar indicando un motivo, y queda constancia (motivo y fecha, sin el texto).
3. Estas reglas las impone **la base de datos** (RLS, constraints, funciones), no solo la app.

## Stack

- Next.js 15 (App Router, TypeScript estricto, `src/`, alias `@/*`)
- Tailwind CSS v4 (los tokens van en `src/app/globals.css` con `@theme`, porque v4 no usa `tailwind.config`)
- Supabase: Postgres, Auth, Storage y RLS, mediante `@supabase/ssr` y `@supabase/supabase-js`
- Zod v4 para validar
- Vitest (unitarios, `tests/unit/`) y Playwright (e2e, `tests/e2e/`)
- Despliegue en Vercel

## Estructura

```
src/
  app/                    rutas (App Router)
  components/             componentes de UI compartidos
  lib/env.ts              variables de entorno validadas con Zod
  lib/supabase/
    client.ts             cliente de navegador (Client Components)
    server.ts             cliente de servidor (RSC, Server Actions, Route Handlers)
    middleware.ts         refresco de sesión y protección de rutas
    admin.ts              cliente service_role (SOLO servidor, se salta RLS)
  middleware.ts           engancha updateSession en cada petición
  types/database.types.ts tipos generados (npm run typegen)
supabase/
  config.toml
  migrations/             migraciones SQL (orden por timestamp)
  seed.sql                datos de ejemplo SOLO para desarrollo
tests/
  unit/                   Vitest puro
  db/                     Vitest + PGlite: migraciones, RLS y reglas de negocio
    supabase-shim.sql     roles/auth/storage mínimos de Supabase para los tests
  e2e/                    Playwright
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` / `npm start` | build y servidor de producción |
| `npm run lint` / `npm run typecheck` | ESLint y `tsc --noEmit` |
| `npm test` | Vitest (unitarios + tests de base de datos) |
| `npm run test:db` | solo los tests de base de datos (PGlite, sin Docker) |
| `npm run test:e2e` | Playwright (hace falta `npm run build` antes; levanta `next start`) |
| `npm run typegen` | genera los tipos desde el proyecto remoto (necesita `SUPABASE_PROJECT_REF` y `supabase login` o `SUPABASE_ACCESS_TOKEN`) |
| `npm run typegen:local` | lo mismo contra el Supabase local (necesita Docker) |
| `npm run typegen:db` | lo mismo contra cualquier Postgres con las migraciones aplicadas (`SUPABASE_DB_URL`, añade `?sslmode=disable` si es local) |
| `npm run db:bundle` | regenera `supabase/instalar-base-de-datos.sql` (todas las migraciones en un fichero) |
| `npm run db:push` | aplica las migraciones al proyecto enlazado (`supabase link --project-ref …` antes) |

Antes de cada commit: `npm run lint && npm run typecheck && npm test && npm run build`.

## Auth y perfiles

- **Rutas públicas de SEO:** `/habitaciones/[ciudad]`, `/pisos/[ciudad]`, `/robots.txt`, `/sitemap.xml` y `/og/…` (tarjetas para compartir). Ver «SEO técnico e indexación».
- **Rutas:** `/cuenta` (descargar mis datos y borrar la cuenta), `/registro`, `/entrar` (contraseña o magic link), `/auth/callback` (destino de los enlaces de email: acepta `?code=` en PKCE y `?token_hash=&type=`), `/perfil` (redirige al tuyo), `/perfil/[id]` (público) y `/perfil/editar`.
- **Server Actions:** `src/app/(auth)/actions.ts` y `src/app/perfil/editar/actions.ts`. Siempre: validar con Zod y devolver un `FormState` (`src/lib/forms.ts`) con errores por campo.
- **Validación doble:** los esquemas de `src/lib/validation/*` se usan en cliente (`useClientValidation`, para dar respuesta inmediata) y en servidor (la que manda).
- **Identidad en servidor:** `getCurrentUser()` (`src/lib/auth.ts`, usa `getClaims()` y se cachea por petición).
- **Redirecciones:** `next` siempre pasa por `safeNextPath()` (evita redirecciones abiertas). Si un usuario con sesión entra en `/entrar` o `/registro`, el middleware lo redirige.
- **Errores de auth genéricos** ("Email o contraseña incorrectos"; el magic link responde igual exista o no la cuenta) para no permitir enumerar usuarios.
- **Avatares:** se suben por Server Action. Zod comprueba tamaño (≤ 2 MB) y tipo declarado, y además se mira el tipo real por *magic bytes* (`sniffImageType`). El bucket `avatars` vuelve a imponer 2 MB y el tipo MIME. En BD se guarda `avatar_path` (ruta dentro del bucket, atada por CHECK a la carpeta del usuario), nunca una URL libre.
- **Verificación:** email verificado se sincroniza desde Auth con un trigger. **Teléfono: TODO**, el campo `phone_verified` existe pero no hay flujo, y el número irá en una tabla privada aparte. **Nunca se pide ni se guarda el DNI.**
- **Configuración de Auth en producción** (panel de Supabase → Authentication): activar "Confirm email", Site URL = dominio real, Redirect URLs = `https://<dominio>/auth/callback`, y SMTP propio (el de Supabase tiene un límite muy bajo). En local, `supabase/config.toml` lleva las confirmaciones desactivadas.

## Anuncios

- **Rutas:** `/publicar` (paso 1: tipo; crea el borrador), `/publicar/[id]?paso=datos|fotos|revision` (asistente; sirve también para editar), `/anuncios` (búsqueda), `/anuncios/[id]` (ficha) y `/mis-anuncios` (editar, pausar, reactivar, cerrar, duplicar y borrar borradores).
- **Esquemas** en `src/lib/listings/schema.ts`: `listingDraftSchema` (todo opcional, para el autoguardado) y `publishErrors()` (lo obligatorio para publicar según el tipo, igual que el CHECK de la BD). `toListingRow()` pone a `null` los campos que no aplican al tipo.
- **Autoguardado** solo en borradores (1 s después de dejar de escribir). Un anuncio publicado o pausado se guarda a mano y exige los datos completos.
- **Fotos:** se comprimen en el navegador (lado mayor ≤ 1600 px, WebP, sin EXIF/GPS) y se suben directamente a Storage con el cliente del navegador. RLS limita la escritura a `{user_id}/…` y la ruta usada es `{user_id}/{listing_id}/{uuid}.webp`. El orden se guarda con `updatePhotos()`, que comprueba que cada ruta pertenezca a ese anuncio y borra del bucket las fotos quitadas. Máximo 8.
- **Ciudad → provincia** (`src/lib/listings/cities.ts`): lista de municipios conocidos (capitales, ciudades universitarias y grandes, con nombres alternativos como «La Coruña» u «Orense»). Si la ciudad está en la lista, la provincia se rellena sola y no se puede cambiar, y `toListingRow()` guarda el nombre oficial y su provincia. Si no está, el usuario elige la provincia.
- **Periodo de alquiler** (`rental_term` + `available_until`): `indefinite` (sin fecha de fin), `academic_year` (curso, propone 1 sep – 30 jun) o `fixed` (fechas concretas). Si no es indefinido, hace falta la fecha de fin para publicar y debe ser posterior a la entrada (CHECK en la BD y `publishErrors()`). Vale para los tres tipos.
- **Filtros en la URL** (`src/lib/listings/filters.ts`): `tipo, provincia, ciudad, precio_min, precio_max, desde, periodo (curso|fechas|indefinido), convivencia (chicas|chicos), amueblado, gastos, mascotas, fumadores, orden, pagina`. Una ciudad conocida corrige una provincia incoherente. `parseFilters` ignora los valores inválidos (nunca rompe), `serializeFilters` genera la URL canónica y `applyListingFilters` construye la consulta (con tests unitarios sobre un builder falso). El formulario es un `<form method="get">`: funciona sin JavaScript. Con `tipo=seeking`, el precio filtra y ordena por `max_budget`. Paginación por páginas de 12, con desempate por `id`.
- **Dirección exacta:** la pide `/anuncios/[id]` sin más; RLS solo devuelve la fila al dueño y a los interesados aceptados. Los demás ven barrio, ciudad y provincia.
- **Estados:** `draft → active|paused`, `active ↔ paused`, `active|paused → closed` (definitivo; se puede duplicar). Solo se borran borradores. Lo impone `private.listings_guard` en la BD: un publicado no vuelve a borrador (evita borrarlo y arrastrar conversaciones ajenas) y un cerrado ya no se modifica.
- **Rutas de fotos atadas a su carpeta:** CHECK `listings_photos_own_folder` (`{owner_id}/{listing_id}/…`), para que nadie enlace fotos de otro ni URLs externas.
- **Duplicar** copia los datos, la dirección y las fotos (copia física en Storage) a un borrador nuevo.

## Interés, mensajes y estancias

- **Flujo:** «Me interesa» en la ficha (mensaje de 20 a 500 caracteres) → conversación en `/mensajes/[id]` → el anunciante acepta o rechaza (aceptar desbloquea la dirección por RLS) → cualquiera de los dos propone la estancia → la otra parte la confirma → `active`. En habitaciones, host o guest pueden añadir compañeros (pegando el enlace a su perfil), que confirman en `/mis-estancias`.
- **Máquinas de estados** (la BD manda; `src/lib/conversations/state.ts` es un espejo solo para decidir qué botones mostrar):
  - interest: `pending → accepted | declined` (anunciante), `pending | accepted → withdrawn` (interesado). Trigger `private.interests_before_update`.
  - stay: `proposed → active` (cuando confirman ambos, `confirm_stay`), `proposed → cancelled` (`cancel_stay`, cualquiera), `active → ended` (`end_stay`). Sin UPDATE directo.
- **No leídos:** tabla `conversation_reads` + RPC `mark_conversation_read` y `my_unread_counts`. Quien envía un mensaje lo marca como leído (trigger). Contador en la cabecera.
- **Anti-spam en BD:** 60 mensajes y 15 intereses por usuario y hora (trigger `private.enforce_rate_limit`, código `P0429`).
- **Realtime:** `messages` e `interests` están en la publicación `supabase_realtime`, y Realtime aplica RLS a cada suscriptor. **Importante:** en el navegador hay que llamar a `supabase.realtime.setAuth(token)` antes de suscribirse; si no, el canal se une como anónimo y no llega nada (ver `chat-thread.tsx`).
- **Emails** (`src/lib/email/`): interfaz `Mailer` con `ResendMailer` (`RESEND_API_KEY` + `EMAIL_FROM`), `MailpitMailer` (`MAILPIT_URL`, en local y en los e2e) y `ConsoleMailer` (sin configurar). Plantillas en español con HTML escapado: nuevo interés, interés aceptado y estancia propuesta. `emailUser()` nunca lanza: un fallo de email no deshace la acción.
- **Uso de service_role (1 de 2; el otro es la tarea de avisos de reseña):** `src/lib/email/notify.ts` lee el email del destinatario con `auth.admin.getUserById`, porque los emails viven en `auth.users`, que ningún usuario puede leer. No se devuelve nunca al cliente.

## Contratos (fase 1: contrato y firma)

- **Rutas:** `/contratos` (mis contratos) y `/contratos/[id]` (editor del borrador para el casero, lectura y firma, registro de firmas, «Descargar o imprimir (PDF)» con `window.print()`; al imprimir se ocultan cabecera, pie y barra inferior). En la conversación, con el interés aceptado, el casero tiene «Preparar contrato» (acción `createContractDraft`, que rellena el borrador desde el anuncio y su dirección con `buildDraftFromInterest`).
- **Tabla `contracts`** (`20261110000100_contracts.sql`) con la máquina de estados `draft → sent → signed`, o `draft|sent → cancelled`:
  - solo el dueño del anuncio lo crea, para un interés **aceptado** y con quien mostró el interés (trigger); un contrato vivo por conversación;
  - en borrador el casero edita `kind` y `terms` (permisos por columna);
  - `send_contract(id, texto)` guarda el texto exacto y su SHA-256. Desde ahí el texto es inmutable, y firmado es inmutable el contrato entero, para cualquier rol, también service_role. Las RPC usan la variable de sesión `convivo.contract_rpc`;
  - `sign_contract(id, nombre, hash)` exige el hash del texto leído y el nombre tal como figura en el contrato (sin distinguir mayúsculas ni espacios). Cuando firman los dos, crea la estancia, o confirma la propuesta del chat, con las dos confirmaciones: **firmar el contrato abre las reseñas verificadas**;
  - `cancel_contract(id)` lo cancela cualquiera de las partes antes de la firma final. Avisos in-app `contract_to_sign`, `contract_signed` y `contract_cancelled`, y emails `contractToSignEmail` y `contractSignedEmail`.
- **Plantillas** (`src/lib/contracts/templates.ts`, **BORRADOR pendiente de revisión legal**, con el aviso dentro del propio texto): habitación en vivienda compartida (Código Civil), vivienda habitual (LAU, título II) y temporada (LAU, título III; exige motivo y fecha de fin). El texto lo genera el servidor al enviar (`renderContract` → `contractToText`, determinista). **Si cambias el texto, cambia `TEMPLATE_VERSION`.** Condiciones con Zod en `src/lib/contracts/schema.ts`, con avisos si la fianza supera la legal.
- **Sin DNI:** las partes se identifican por nombre completo y su identificador de Convivo (pendiente de validar con el abogado).
- **Firma electrónica simple** (eIDAS): quién, cuándo y huella del texto. Una firma avanzada con proveedor (Signaturit, DocuSign…) queda para una fase posterior.
- **Borrado de cuenta:** los contratos firmados se conservan (documento entre las partes; el anuncio y la conversación quedan a `null`), los borradores se borran y los pendientes se cancelan.

## Contratos (fase 2: inventario y fianza)

- **Inventario con fotos** (`20261111000100_contract_inventories.sql`, rutas `/contratos/[id]/inventario/entrada|salida`): con el contrato **firmado**, cualquiera de las dos partes lo abre y añade elementos (zona, elemento, estado `new|good|worn|damaged`, notas y hasta 6 fotos). Tablas `contract_inventories` (una por contrato y etapa) e `inventory_items`.
  - Las dos partes lo confirman con `confirm_inventory(id)`. **Cualquier cambio anula las confirmaciones** (trigger), así que nadie confirma algo que no ha visto. Confirmado por los dos queda **bloqueado** (`locked_at`): inmutable para cualquier rol, también service_role, y ya no se suben ni se borran sus fotos.
  - La salida solo se abre con la entrada bloqueada. «Copiar los elementos del inventario de entrada» (`copyEntryItems`) y la comparación marcan solo los **daños nuevos**: el desgaste por el uso normal no se descuenta de la fianza (`compareWithEntry`).
  - **Fotos en un bucket PRIVADO** `inventory-photos` (5 MB, solo webp), con la ruta `{contract_id}/{inventory_id}/{uuid}.webp`. Se comprimen en el navegador (sin GPS) y se suben con el cliente del navegador. RLS de Storage (`private.inventory_photo_access`) deja leerlas solo a las partes y subirlas o borrarlas solo con el inventario abierto. Se muestran con URL firmada de 1 h. Las fotos que se suben y no se guardan se borran (`discardInventoryPhotos`).
  - Avisos `inventory_to_confirm` e `inventory_confirmed`, y email `inventoryToConfirmEmail`. Al borrar la cuenta de una parte, el inventario se conserva, como el contrato firmado.
- **Guía de la fianza** (`src/lib/contracts/deposits.ts`, componente `deposit-guide.tsx`): por provincia del anuncio → comunidad autónoma → organismo, plazo, cómo se hace, si alcanza a las habitaciones, norma y enlace. **ORIENTATIVA y pendiente de verificar**: se recopiló en noviembre de 2026 desde buscadores, sin poder abrir las webs oficiales. Revísala al menos una vez al año (Andalucía suprimió el depósito en 2026, Navarra lo crea desde 2027 y Cataluña lo extendió a las habitaciones en 2026). Se muestra en el contrato enviado y en el firmado, junto con el plazo de devolución (un mes desde la entrega de llaves, art. 36.4 LAU).
- **Mis datos** incluye los contratos, los inventarios y sus elementos.

## Reseñas (interfaz y moderación)

- **Rutas:** `/mis-resenas` (avisos, pendientes con fecha límite, enviadas con su estado), `/resenas/nueva?estancia=…&sujeto=…` (formulario según la relación) y `/admin` (solo admins; a los demás les devuelve 404).
- **Qué puede reseñar cada uno:** `reviewTargets()` en `src/lib/reviews/targets.ts`, espejo del trigger. `getMyReviewTasks()` lo cruza con `get_review_window` y con las reseñas ya escritas.
- **Formulario:** criterios de 1 a 5 según la relación (`CRITERIA_BY_RELATIONSHIP`, iguales que en la BD), valoración general y texto de 50 a 1500 caracteres. El mismo esquema Zod se usa en cliente y servidor. Tras enviar: «Se publicará cuando la otra parte opine o el [fecha]», o «ya es pública» si la contraparte ya había reseñado.
- **Respuesta pública:** tabla `review_responses`, una por reseña y sin UPDATE ni DELETE. Responde el reseñado (o el propietario si la reseña es del inmueble), y solo sobre reseñas publicadas.
- **Denuncias:** botón en cada reseña. El motivo `personal_data` **oculta la reseña cautelarmente** (RLS + `private.review_is_hidden`, que también la saca de las medias) hasta que un admin la revisa. El resto de motivos no ocultan nada. Hay un límite de 10 denuncias al día por usuario y una denuncia abierta por persona y reseña.
- **Moderación (`/admin`):** descartar la denuncia, o eliminar la reseña (`delete_review`: queda la constancia con motivo y fecha, sin el texto) y cerrar sus denuncias. También muestra las señales de posible autorreseña.
- **Señales anti-abuso:** HMAC-SHA256 de la IP y del navegador (`SIGNAL_SECRET`), nunca en claro. Se registran al entrar, al registrarse y al reseñar (`record_signal`). `admin_review_flags()` lista las reseñas en las que autor y sujeto comparten IP o navegador. Es un indicio, no una prueba: puede tratarse de compañeros que comparten wifi.
- **Avisos de ventana:** `GET /api/cron/review-windows` (Vercel Cron, diario a las 08:17 UTC, en `vercel.json`, protegido con `Authorization: Bearer CRON_SECRET`). Avisa por email y en la app cuando se abre la ventana y 3 días antes de que se cierre. Es idempotente gracias a `review_window_notices`. **Segundo uso acotado de service_role.**
- **Patrón de UI tras Server Actions en la misma página:** devolver el resultado y hacer `router.refresh()` en el cliente, mostrando ya lo confirmado por el servidor (respuesta publicada, cambio de estado recibido por Realtime). Revalidar la propia página desde la acción podía dejar el formulario «pendiente» para siempre.

## SEO técnico e indexación (fase 7a)

- **Una sola variable de indexación: `INDEXING_ENABLED`** (alias `indexing`, que manda si existe y no está vacío; `src/lib/seo/indexing.ts`). **Apagada por defecto** y con cualquier valor que no sea `true`, `1` o `si`.
  - **Apagada (web de pruebas):** TODAS las respuestas llevan `X-Robots-Tag: noindex, nofollow` (lo pone `src/middleware.ts`, también en robots.txt, sitemap e imágenes) y `<meta name="robots">` desde el layout; `robots.txt` es `Disallow: /` y no anuncia el sitemap; `sitemap.xml` sale vacío.
  - **Encendida:** se indexa lo público. Siguen con `noindex` (función `robotsTagFor`): perfiles de personas (`/perfil…`), zonas con sesión, acceso, `/estado`, `/denunciar`, `/api`, `/og` y la **búsqueda con filtros** (`/anuncios?…` → `noindex, follow`; la canónica es `/anuncios`). `robots.txt` cierra lo mismo y apunta a `<URL pública>/sitemap.xml`.
  - **Cómo se enciende el día del lanzamiento:** (1) en Vercel, `siteurl` = `https://<dominio definitivo>` (sin ella, las URL absolutas salen de la cabecera Host: solo vale en pruebas); (2) añadir `INDEXING_ENABLED=true` en el entorno de **producción** (nunca en el de pruebas); (3) volver a desplegar; (4) comprobar `/robots.txt`, `/sitemap.xml` y que `/habitaciones/lugo` ya no lleva `noindex`; (5) dar de alta el sitemap en Google Search Console. Para apagarlo, quitar la variable. `robots.ts` y `sitemap.ts` son `force-dynamic` a propósito: leen la variable en cada petición.
  - Cuidado al tocar metadatos: una página que ponga `robots: undefined` en su `metadata` **tapa** el `noindex` del layout. Solo hay que incluir la clave `robots` si hay algo que decir (ver `pageMetadata`).
- **URL absoluta siempre de la variable pública** (`getBaseUrl()` en `src/lib/seo/site.ts`, que usa `getSiteUrl()`): sitemap, robots, canonical, Open Graph y JSON-LD. Ninguna URL escrita a mano; `metadataBase` del layout sale de ahí.
- **Páginas de ciudad:** `/habitaciones/[ciudad]` (tipo `room`) y `/pisos/[ciudad]` (tipo `flat`), con la lista de `SEO_CITIES` en `src/lib/seo/cities.ts` (Lugo, A Coruña, Madrid y Barcelona; para añadir una, su nombre oficial de `cities.ts`: slug y provincia salen solos, y entra en el sitemap y en los enlaces). Una ciudad fuera de la lista, 404. Hasta 24 anuncios (`getCityPageData`); con 0, mensaje útil con enlaces a `/publicar` y a «busco». Título, descripción y H1 por tipo en `cityPageCopy` (lleva «habitaciones en alquiler», «pisos compartidos» y la ciudad). La portada enlaza a estas páginas desde las ciudades del piloto.
- **Metadatos** (`src/lib/seo/metadata.ts`, `pageMetadata`): título, descripción, canonical, Open Graph y tarjeta de Twitter. El `openGraph` de una página **reemplaza** al del layout, por eso se rellena entero. La ficha lleva el **precio al principio de la descripción** (es lo que ve WhatsApp).
- **Tarjetas para compartir:** con foto, `og:image` es la foto servida por el optimizador de Next (`/_next/image?…&w=1200`, **JPEG** para los rastreadores: WhatsApp y otros no siempre leen WebP). Sin foto, o en las ciudades y la portada: `/og/anuncios/[id]`, `/og/ciudad/[segmento]/[slug]` y `/og/inicio` (`ImageResponse`, 1200×630, marrón de marca con título y precio, `force-dynamic`). El texto no admite WebP en `ImageResponse`: por eso no se pinta la foto dentro de la tarjeta.
- **Datos estructurados (JSON-LD)** (`src/lib/seo/json-ld.ts`, funciones puras; `src/components/seo/json-ld.tsx` pone el `nonce`): ficha = `["Product","Room"|"Apartment"]` con `Offer` (precio mensual), `aggregateRating` si hay reseñas, imágenes y `BreadcrumbList`; ciudad = `CollectionPage` + `ItemList` + migas. **Nunca dirección exacta, código postal, piso/puerta ni coordenadas**: `address` lleva solo localidad, región y país, y las funciones ni reciben la dirección (hay test). Los «busco» no llevan JSON-LD. Un bloque `application/ld+json` es un dato y la CSP no lo bloquea; lleva el nonce igualmente, y `<` va escapado.
- **Los «busco» y los perfiles no se indexan ni entran en el sitemap** (son personas): decisión conservadora de esta fase. El sitemap (`src/app/sitemap.ts`) lleva portada, `/anuncios`, las 8 páginas de ciudad y los anuncios activos de habitación y piso (hasta 5.000). Las páginas legales siguen con `noindex` mientras sean borradores.
- **Metadatos en el `<head>`:** `htmlLimitedBots: /.*/` en `next.config.ts`. Sin ello, Next envía el título y la descripción dentro del `<body>` a quien no sea un buscador conocido (Lighthouse bajaba el SEO a 91 y WhatsApp o rastreadores nuevos podrían no leerlos).
- **Auditoría** (`docs/REVISION-FASE-7.md`, capturas en `docs/capturas-fase-7/`): `scripts/auditoria/lighthouse.sh` (Lighthouse móvil; instalar `lighthouse@12` fuera del proyecto), `pantallas.mjs` (capturas 375 px y axe de 52 pantallas, con un circuito de contrato en la BD **local**) y `fotos-de-ejemplo.mjs` (sube fotos de ejemplo a la BD local para medir con portadas reales). Los tres se niegan a funcionar contra algo que no sea local. `axe-core` y `lighthouse` no son dependencias del proyecto.
- **Tests:** `tests/unit/seo.test.ts` y `tests/e2e/seo.spec.ts`. El e2e levanta **dos servidores** (`playwright.config.ts`): el normal (puerto 3000, indexación apagada) y otro en el 3100 con `INDEXING_ENABLED=true` y `NEXT_PUBLIC_SITE_URL=https://convivo.example.test`.

## Diagnóstico y errores

- **`/estado`**: página de diagnóstico para quien despliega. Dice si existen las variables (nunca su valor), si la base de datos responde, si la instalación SQL está completa (comprueba objetos de la última migración) y si funciona el login. Tiene `noindex`.
- **`error.tsx`, `global-error.tsx` y `not-found.tsx`**: pantallas de error con la marca, botón de reintentar y el código del error (digest), que sirve para buscarlo en los logs de Vercel.

## Seguridad y RGPD

- **Cabeceras** (`src/lib/security/headers.ts`): CSP con un **nonce por petición**, que pone `src/middleware.ts` en la respuesta y en la petición para que Next.js firme sus `<script>`. Así `script-src` no lleva `'unsafe-inline'` (`'strict-dynamic'` deja cargar los trozos que pide Next). Funciona porque todas las páginas se generan en cada petición; **una página estática nueva no tendría nonce** y sus scripts se bloquearían. `style-src` sí lleva `'unsafe-inline'` por los atributos `style` de React y `next/image`. `connect-src` e `img-src` permiten el host de Supabase (https y wss para Realtime). Las fijas (HSTS, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options, COOP) van en `next.config.ts`.
- **Límite de intentos de acceso** (`auth_attempts`, RPC `auth_rate_allowed` y `auth_rate_failed`, `src/lib/security/rate-limit.ts`): por huella HMAC de la IP y del email normalizado (`SIGNAL_SECRET`). Login: 8 fallos por cuenta o fallos con 30 cuentas distintas por IP en 15 min (solo cuentan los fallos). Registro: 3 por email y 60 por IP a la hora. Enlace mágico: 5 por email y 60 por IP a la hora. El mensaje es el mismo exista o no la cuenta. Sin `SIGNAL_SECRET`, o si la BD falla, deja pasar (sigue el límite propio de Supabase Auth). En local, `npx supabase db reset` vacía los contadores.
- **Mis datos** (`GET /api/mis-datos`, `src/lib/account/export.ts`): JSON descargable con perfil, anuncios con su dirección, intereses, mis mensajes, estancias, reseñas escritas y recibidas ya publicadas, avisos, bloqueos y denuncias hechas. Se lee con la sesión del usuario: RLS garantiza que no sale nada ajeno. Sin sesión, 401.
- **Borrar mi cuenta** (`/cuenta`, acción `deleteAccount`): pide escribir BORRAR (Zod y la BD lo comprueban), borra con la sesión del usuario sus ficheros de `avatars` y `listing-photos` y llama a `delete_my_account('BORRAR')`, que borra la fila de `auth.users`. El trigger `on_auth_user_deleted` → `private.anonymize_user()` hace el resto, **también si se borra el usuario desde el panel de Supabase**:
  - el perfil queda como «Usuario eliminado», sin datos y con `deleted_at`. Ya no cuelga en cascada de `auth.users`;
  - las reseñas escritas y recibidas se conservan intactas (siguen siendo inmutables) y las medias no cambian;
  - se borran conversaciones (intereses y mensajes en ambos papeles), avisos, bloqueos, lecturas, señales y participaciones sin confirmar;
  - los anuncios sin estancias se borran; los que tienen estancias se cierran sin dirección, fotos ni descripción (la variable de sesión `convivo.anonymizing` deja al guardián tocar un anuncio cerrado solo en ese momento);
  - las denuncias hechas se conservan sin su texto libre.
- **Cuentas que se borran y vuelven** (`20261109000100_returning_accounts.sql`):
  - Al borrar, `private.handle_user_deleted` guarda en `private.deleted_account_traces`, durante 2 años, una huella HMAC del email (`private.email_fingerprint`, clave generada en la BD en `private.app_secrets`; nunca el email), las huellas de IP y navegador de `user_signals` y el número de reseñas negativas (nota ≤ 2).
  - Si alguien se registra con el mismo email (sin distinguir mayúsculas ni espacios), `private.handle_new_user` enlaza la cuenta nueva con la anterior (`profiles.restored_from`, no editable por el usuario).
  - `profile_lineage(id)` devuelve la cadena de cuentas. `profile_review_stats` y `getReceivedReviews` la usan, así que el historial vuelve sin tocar ninguna reseña (siguen siendo inmutables). El perfil muestra «Volvió a Convivo con el mismo email».
  - Las cuentas de menos de 90 días llevan «Cuenta nueva» en el perfil.
  - `admin_returning_account_flags()` (solo admin) lista las cuentas de los últimos 6 meses que comparten IP o navegador con una cuenta borrada que tenía reseñas negativas. Es un indicio, no una prueba. Sale en `/admin`, en «Posibles cuentas reabiertas».
- **Textos legales** (`/privacidad`, `/terminos`, `src/components/legal/legal-page.tsx`): BORRADORES con el aviso «Borrador pendiente de revisión legal» y huecos `[POR COMPLETAR]`. Enlazados desde el registro y el pie (el pie se ve también en móvil, con hueco para la barra de pestañas).
- **Cookies:** solo las de sesión de Supabase (`sb-…`), que son técnicas e imprescindibles; por eso **no hay banner de cookies**. Un e2e lo comprueba. Si algún día se añade analítica o publicidad, hará falta banner y consentimiento previo.
- **Anti-discriminación en anuncios** (`src/lib/listings/discrimination.ts`, único fichero con la lista): se rechazan en título, descripción y zonas las **exclusiones** por origen, nacionalidad, etnia, religión u orientación sexual («solo españoles», «no extranjeros», «abstenerse gitanos», «nacionalidad española»…). El texto se normaliza (minúsculas, sin tildes, signos ni espacios dobles) y se busca la exclusión, no la palabra suelta: «hablamos español» o «barrio chino» pasan. Va en `listingTextSchema` (Zod), que usa `publishErrors()`: el asistente lo marca en vivo y el servidor lo vuelve a comprobar al guardar o publicar. Para ampliarla, añade palabras a `ONLY_GROUPS`, `EXCLUDED_GROUPS` o `FORBIDDEN_PHRASES` y un caso en `tests/unit/discrimination.test.ts`.
- **Sexo («solo chicas/chicos»):** **permitido** por decisión de producto: quien comparte casa elige con quién convive. Se admite en el texto y como campo cerrado `listings.cohabitation` (`any|women|men`), solo en habitaciones y «busco»; en piso entero el CHECK `listings_cohabitation_shared` lo deja en `any`. Filtro `convivencia=chicas|chicos` (incluye los indiferentes). Riesgo legal pendiente (Ley 15/2022).
- **Anti-fraude** (`listing_flags`, trigger `listings_fraud_flags` → `private.flag_listing`): al publicar o cambiar un anuncio activo se marca para revisión si su texto parece una estafa (`private.scam_phrase`: Western Union, MoneyGram, «paga por adelantado», «estoy en el extranjero», «te mando las llaves»…) o si el precio es menor que la mitad de la mediana de anuncios activos del mismo tipo en la ciudad (mínimo 5 comparables), o en la provincia, o, sin comparables, menor de 120 € (habitación) o 250 € (piso). **No despublica ni avisa al anunciante.** Solo los admins ven las marcas (`/admin`, «Anuncios marcados») y las resuelven con `admin_resolve_listing_flag(id, 'dismiss' | 'close_listing', nota)`.
- **Aviso en el chat:** «Nunca pagues antes de ver el piso», fijo en cada conversación (`chat-thread.tsx`).
- **Registro de moderación** (`moderation_log`): append-only. Un trigger impide UPDATE, DELETE y TRUNCATE a cualquier rol, también service_role, igual que con las reseñas. Lo escriben solo la BD: los triggers de `reports` (denuncia descartada o resuelta) y de `reviews` (reseña eliminada por un admin; que el autor borre la suya no es moderación) y la RPC de las marcas de fraude. Guarda quién (`auth.uid()`), qué, sobre qué y cuándo. Solo lo leen los admins (`/admin`, últimas 50 acciones).
- **Mayoría de edad y aceptación:** el registro exige marcar «Tengo 18 años o más» (`isAdult`) y aceptar las condiciones. Se guardan en `raw_user_meta_data` `terms_version` (`TERMS_VERSION` en `src/lib/validation/auth.ts`, cámbiala al modificar las condiciones), `terms_accepted_at` y `adult_declared_at`, como constancia. Nunca se pide DNI.
- **Edad:** el perfil guarda `profiles.birth_year` y muestra la edad (`ageFromBirthYear`, puede ir un año por delante hasta el cumpleaños). No se guarda la fecha completa porque el perfil es público. El trigger `private.profiles_check_age` exige 18 años o más (un CHECK no puede usar la fecha actual).
- **Canal público de denuncias (DSA arts. 16-18)** (`/denunciar`, `legal_notices`, `src/lib/moderation/notices.ts`):
  - Cualquiera, **también sin cuenta**, notifica un anuncio, un perfil o una reseña con su enlace, el motivo, la explicación (≥ 30 caracteres), nombre, email y declaración de buena fe. Hay enlaces desde el pie, cada ficha, cada perfil y cada reseña (para quien no ha iniciado sesión).
  - `submit_legal_notice()` (anon incluido) valida que el contenido exista, limita a 10 por email y 20 por IP al día (`auth_attempts`, tipo `legal_notice`) y devuelve una referencia. Se envía un **acuse por email** (`noticeReceivedEmail`).
  - Objetivo interno de **72 h** (`due_at`): en `/admin`, las vencidas salen en rojo. Hay un recordatorio del art. 18: avisar a las autoridades si hay peligro para alguien.
  - El admin decide con **motivo obligatorio** (`admin_decide_legal_notice`) y, si acepta, puede retirar el contenido en el mismo paso: cerrar el anuncio (`admin_close_listing`) o eliminar la reseña (`delete_review`). Todo queda en `moderation_log`.
  - **Motivación (art. 17):** email con la decisión a quien notificó (`noticeDecisionEmail`) y, si se retira contenido, a quien lo publicó (`contentRemovedEmail`, por `emailUser`, el uso 1 de service_role) más un aviso in-app (`content_removed`). En las denuncias internas, quien denunció recibe la decisión (`report_decision`) y el autor de una reseña eliminada por un admin, el motivo.
  - Para perfiles y otros contenidos la retirada se hace a mano (todavía no hay suspensión de cuentas).
- **Documentos legales en borrador** (`docs/legal/`): `ponderacion-interes-legitimo.md`, `eipd-ligera.md` y `conservacion.md`, con la tabla de conservación y la cuestión pendiente del bloqueo del art. 32 LOPDGDD.
- **Formularios de acceso:** devuelven `values` (nunca la contraseña) para volver a rellenar el email, porque React 19 vacía el formulario al terminar la acción.

## Desarrollo local con Supabase

```bash
npx supabase start            # Postgres 17 + Auth + Storage + Mailpit; aplica migraciones y seed
npx supabase status -o env    # claves para .env.local (API_URL, ANON_KEY, SERVICE_ROLE_KEY)
npx supabase db reset         # recrea la BD desde cero (migraciones + seed)
```

Si la descarga de imágenes desde `public.ecr.aws` está bloqueada (sesiones en la nube), usa `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start -x studio,imgproxy,vector,logflare,edge-runtime,supavisor,postgres-meta`.
Los e2e que tocan datos (`tests/e2e/*`) se saltan solos si no hay `NEXT_PUBLIC_SUPABASE_URL`. Playwright carga `.env.local`. Haz `npm run build` antes de `npm run test:e2e`.

## Variables de entorno

Plantilla en `.env.example`. Los valores reales van en `.env.local` (ignorado por git) o en los ajustes del entorno de la nube o de Vercel. **Nunca** en el chat ni en el repo.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: públicas, llegan al navegador. La segunda admite la *publishable key* nueva (`sb_publishable_…`) o la «anon» clásica; las dos están probadas con toda la suite e2e.
- `SUPABASE_SERVICE_ROLE_KEY`: **solo servidor**. Nunca con prefijo `NEXT_PUBLIC_`. Admite la *secret key* nueva (`sb_secret_…`) o la «service_role» clásica.
- **Nombres alternativos aceptados** (el proyecto de Vercel los usa): `projecturl` = `NEXT_PUBLIC_SUPABASE_URL`, `publickey` = `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `secretkey` = `SUPABASE_SERVICE_ROLE_KEY`, `cronsecret` = `CRON_SECRET`, `signalsecret` = `SIGNAL_SECRET`, `siteurl` = `NEXT_PUBLIC_SITE_URL`, `resendkey` = `RESEND_API_KEY`, `emailfrom` = `EMAIL_FROM`, `indexing` = `INDEXING_ENABLED`. Las dos públicas se copian a `NEXT_PUBLIC_*` en `next.config.ts` (`env`), así que llegan al navegador. **Si existen, los nombres en minúscula tienen prioridad** sobre los estándar, para que una integración de Vercel que cree `NEXT_PUBLIC_SUPABASE_URL` apuntando a otro proyecto no pise la configuración manual. Ojo: Vercel Cron solo envía el secreto si la variable se llama exactamente `CRON_SECRET`.
- `SUPABASE_PROJECT_REF`: solo para `typegen`.
- `NEXT_PUBLIC_SITE_URL`: URL pública para los enlaces de los emails (en local se deduce de la cabecera Host).
- `RESEND_API_KEY`, `EMAIL_FROM`: email transaccional en producción. `MAILPIT_URL`: buzón local (`npx supabase status`).
- `INDEXING_ENABLED` (alias `indexing`): `true` permite que los buscadores indexen la web. **Apagada por defecto**; solo se enciende en producción el día del lanzamiento (ver «SEO técnico e indexación»). Con ella apagada la web de pruebas lleva `noindex` en todo.
- `CRON_SECRET`: protege la tarea programada (Vercel lo envía como Bearer). `SIGNAL_SECRET`: clave del HMAC de las señales anti-abuso. Valores aleatorios largos; **no los cambies** una vez en producción, porque los hashes antiguos dejarían de coincidir.

## Base de datos

### Aplicar las migraciones a tu proyecto de Supabase

**Opción A, CLI (recomendada):**

```bash
npx supabase login                      # una vez; abre el navegador
npx supabase link --project-ref <ref>   # <ref> = la parte xxxx de https://xxxx.supabase.co
npm run db:push                         # aplica supabase/migrations/ en orden
SUPABASE_PROJECT_REF=<ref> npm run typegen
```

**Opción B, editor SQL del panel (proyecto nuevo):** pega y ejecuta `supabase/instalar-base-de-datos.sql`, que son todas las migraciones en un solo fichero. Se regenera con `npm run db:bundle`, y un test avisa si se queda desfasado. Guía para no técnicos en `docs/VER-EN-EL-MOVIL.md`. No mezcles A y B en el mismo proyecto: la CLI lleva un registro de las migraciones aplicadas y no sabría de las pegadas a mano.

**Datos de ejemplo (solo desarrollo o staging, NUNCA producción):** pega `supabase/seed.sql` en el editor SQL. Crea 8 usuarios `@convivo.test` con la contraseña `convivo-dev-1234`.

**Nombrar a un admin:** `insert into public.admin_users (user_id) values ('<uuid del usuario>');`

### Mapa del esquema

| Tabla | Para qué | Quién lee | Quién escribe |
|---|---|---|---|
| `profiles` | perfil público (1:1 con `auth.users`, creado por un trigger; al borrar la cuenta queda anonimizado con `deleted_at`) | todos | el dueño, solo columnas editables |
| `blocks` | A bloquea a B | quien bloquea | quien bloquea |
| `listings` | anuncios room/flat/seeking | todos si `active`; el dueño, todos los suyos | el dueño (solo borra borradores) |
| `listing_addresses` | dirección exacta | el dueño e interesados `accepted` | el dueño |
| `interests` | "me interesa" + máquina de estados | las dos partes | interesado (alta/retirar), anunciante (aceptar/rechazar) |
| `messages` | chat por interés | las dos partes | las dos partes, si `pending` o `accepted`; no se editan |
| `stays` | estancia host + guest | miembros | alta directa; cambios solo por RPC |
| `stay_participants` | compañeros de la estancia | miembros | solo por RPC |
| `reviews` | reseñas | publicadas: todos; el autor, la suya | alta por el autor; inmutables |
| `review_responses` | respuesta pública única a una reseña | todos, si la reseña es pública | el reseñado; inmutable |
| `notifications` | avisos in-app | el propio usuario | sistema (service_role); el usuario solo marca leída |
| `review_window_notices` | registro de avisos enviados (idempotencia) | nadie | service_role |
| `user_signals` | hashes de IP y navegador | nadie (admins vía RPC) | `record_signal()` |
| `conversation_reads` | última lectura de cada conversación | el propio usuario | solo por RPC/trigger |
| `reports` | denuncias | quien denuncia y admins | quien denuncia (alta); admin (resolver) |
| `admin_users` | administradores | nadie (vía `private.is_admin()`) | SQL a mano |
| `auth_attempts` | huellas de intentos de acceso (límite) | nadie | `auth_rate_allowed()` / `auth_rate_failed()` |
| `listing_flags` | marcas anti-fraude para revisar | admins | trigger al publicar; resuelve un admin por RPC |
| `moderation_log` | registro de auditoría de moderación (append-only) | admins | solo triggers y RPC; nadie modifica ni borra |
| `legal_notices` | notificaciones de contenido ilegal (DSA), también de personas sin cuenta | admins | `submit_legal_notice()` (anon incluido); decide un admin por RPC |
| `contracts` | contratos de alquiler con firma en Convivo | las dos partes (y admins) | el casero en borrador; después, solo `send_contract`, `sign_contract` y `cancel_contract` |
| `contract_inventories` | inventario de entrada o salida de un contrato firmado | las dos partes (y admins) | alta por una parte; confirmación solo por `confirm_inventory`; bloqueado, inmutable |
| `inventory_items` | elementos del inventario (zona, estado, notas, fotos) | las dos partes (y admins) | las dos partes, mientras el inventario no esté bloqueado |

RPC (`supabase.rpc(...)`): `confirm_stay`, `cancel_stay`, `end_stay`, `add_stay_participant`, `confirm_stay_participation`, `decline_stay_participation`, `get_review_window`, `delete_review`, `profile_review_stats`, `listing_review_stats`, `review_criteria_for`, `am_i_admin`, `mark_conversation_read`, `my_unread_counts`, `record_signal`, `admin_review_flags` (admin), `review_window_notices_due` (solo service_role), `auth_rate_allowed` y `auth_rate_failed` (anon incluido: se usan antes de entrar), `delete_my_account`, `admin_resolve_listing_flag`, `admin_close_listing` y `admin_decide_legal_notice` (admin), `submit_legal_notice` (anon incluido), `profile_lineage` (anon incluido), `admin_returning_account_flags` (admin), `send_contract`, `sign_contract`, `cancel_contract`, `confirm_inventory`.

### Reglas de reseñas tal como están implementadas

- **Elegibilidad (a):** trigger `private.reviews_before_insert`. Exige una estancia `active` o `ended` con las dos confirmaciones y un autor que sea host, guest o compañero confirmado. Relaciones válidas: guest→inmueble, guest→host, host→guest y guest/compañero↔guest/compañero. La columna `relationship` la calcula el trigger, no el cliente.
- **Ventana:** hay hasta dos aperturas. La primera llega a los 30 días de `start_date` y la segunda al llegar `end_date`; ninguna es anterior a la doble confirmación. Cada ventana dura 30 días. Como solo hay una reseña por estancia y sujeto, quien reseña en la primera ya no lo hace en la segunda. Las inserciones de sistema (sin JWT: seed o service_role) se saltan la comprobación de ventana.
- **Doble ciego (b):** `published_at` es la fecha **programada** de publicación: apertura de la ventana + 14 días, o `now()` para las dos reseñas en cuanto la contraparte reseña. Los pares se cuentan por personas: la reseña del guest sobre el inmueble cuenta como dirigida al host. Para leer: `published_at <= now()`. No hay cron.
- **Inmutabilidad (c):** sin `UPDATE`/`DELETE` para usuarios, y un trigger que bloquea la edición del contenido para cualquier rol, también service_role. El borrado es `delete_review(id, motivo)`: deja fecha, motivo y autor del borrado, y vacía nota, criterios y texto. Las reseñas borradas siguen apareciendo como constancia.
- **Criterios** (todos de 1 a 5 y obligatorios, consultables con `review_criteria_for`):
  - inmueble: `cleanliness`, `accuracy`, `area`, `condition`, `value`
  - propietario: `communication`, `treatment`, `compliance`, `deposit`
  - inquilino: `payment_punctuality`, `home_care`, `coexistence`, `communication`
  - compañero: `coexistence`, `cleanliness`, `noise`, `respect`

### Tests de base de datos

**Auditoría de seguridad:** `tests/db/security-*.test.ts` son ataques de un usuario normal o anónimo que deben fallar (direcciones, conversaciones ajenas, reseñas, escrituras cruzadas, tablas internas, RPC restringidas y Storage). Incluye dos comprobaciones globales: todas las tablas de `public` tienen RLS y anon solo puede ejecutar las funciones de la lista blanca. Si añades una tabla o una función pública, ese test te obligará a decidir sus permisos.

`tests/db/` levanta un Postgres en memoria (PGlite, WASM) con `supabase-shim.sql` y aplica las migraciones reales. Simula usuarios con `SET ROLE authenticated` y claims JWT, como hace la API. Ver `as()` en `tests/db/helpers.ts`. **Toda regla nueva de RLS o de negocio lleva su test aquí.** Limitación: PGlite es Postgres 18 y Supabase usa 15 o 17, así que no hay que usar sintaxis exclusiva de la 18. Las migraciones también se verificaron aplicándolas sobre un Postgres 16 real.

### Convenciones SQL

- `public`: tablas y RPC expuestas por la API. `private`: helpers de triggers y RLS, no expuestos por la API.
- Toda función `security definer` lleva `set search_path = ''` y nombres cualificados (`public.x`, `auth.uid()`).
- RLS activada en todas las tablas, con `revoke all` y después `grant` mínimo, incluidos permisos por columna.
- En las políticas se usa `(select auth.uid())`, que se evalúa una sola vez por consulta y no por fila.
- Mensajes de error de los triggers en español: la app puede mostrarlos tal cual.

## Convenciones

- **TypeScript estricto**. Nada de `any` sin justificar en un comentario.
- **Validación Zod en toda entrada**: formularios (en cliente y en servidor), Server Actions, Route Handlers, parámetros de URL y variables de entorno.
- **Nada de service_role en el cliente**. `src/lib/supabase/admin.ts` importa `server-only`, y su uso se limita a casos muy acotados que se documentan aquí.
- La seguridad real está en **RLS**: toda tabla nueva lleva RLS activada y políticas explícitas por operación.
- Usa `supabase.auth.getClaims()` o `getUser()` para fiarte de la identidad en el servidor, nunca `getSession()`.
- **Textos de interfaz en español** (España), con un tono neutro y cercano. Los identificadores de código y las columnas de BD van en inglés, salvo los campos de dominio que ya estén en español en el esquema.
- Mobile first. Accesibilidad básica: labels, foco visible, contraste y `lang="es"`.
- **Commits pequeños, en castellano**, en imperativo y con prefijo convencional (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- No se guardan DNI, nacionalidad, origen, religión ni datos de salud.

## Decisiones tomadas

1. **Next.js 15.5** (no 16) con middleware clásico (`src/middleware.ts`): es el patrón documentado de `@supabase/ssr` y es estable en Vercel.
2. **Tres clientes de Supabase** (navegador, servidor y middleware) más un cuarto `admin` aislado con `server-only` para service_role.
3. El middleware **no rompe** si faltan las variables de Supabase: deja pasar la petición para que la parte pública funcione en local sin configurar.
4. Las rutas privadas (`/perfil/editar`, `/publicar`, `/mis-*`) redirigen a `/entrar?next=…` desde el middleware. La lista está en `src/lib/supabase/middleware.ts`.
5. **Tipografía Plus Jakarta Sans autoalojada** (`@fontsource-variable/plus-jakarta-sans`, importada en `layout.tsx`): estilo de startup moderna, sin depender de Google Fonts en el build.
6. **Identidad marrón y blanco** (tokens en `globals.css`): blanco `background`, crema `surface`, marrón nogal `brand` (#7b4b2a) con `brand-strong` y `brand-soft`, y acento miel `accent` (#f4b740) para precios y llamadas a la acción. Botones en píldora (`rounded-full`), tarjetas `rounded-2xl/3xl` con `shadow-[var(--shadow-card)]`. **Modo oscuro desactivado**: la variante `dark:` solo se activaría con la clase `.dark`.
7. La CLI de Supabase va como devDependency (`npx supabase …`), no hace falta instalarla global.
8. `@playwright/test` está fijado a 1.63.0 para que coincida con el Chromium preinstalado en la sesión en la nube. En local: `npx playwright install chromium`.
9. **Año de nacimiento, no fecha completa** (minimización, RGPD): se muestra la edad exacta, que pidió producto en lugar de los rangos iniciales.
10. **Columnas de BD en inglés** (`city`, `monthly_rent`…); los textos de interfaz, en español.
11. **Dirección exacta en una tabla aparte** (`listing_addresses`), porque RLS filtra filas y no columnas.
12. **Hábitos y reglas en jsonb con claves cerradas**, validadas con CHECK: no se pueden guardar ni filtrar criterios discriminatorios.
13. **Borradores incompletos permitidos.** Los CHECK de campos obligatorios por tipo solo se aplican a partir de `status <> 'draft'`.
14. **Estancias retroactivas** (sin interés previo y con inicio en el pasado), con doble confirmación igualmente, para resolver el arranque en frío de la reputación.
15. **Los cambios de estado de las estancias van por RPC** (`confirm_stay`…), nunca con UPDATE directo.
16. **Doble ciego sin cron:** `published_at` guarda la fecha programada de publicación.
17. **Estadísticas mediante funciones `security definer`** con filtro explícito de "publicada", en lugar de vistas (que se saltarían RLS o contarían reseñas pendientes).
18. **Denuncias con claves foráneas reales** por tipo de objetivo y CHECK de "exactamente uno".
19. **Borrar la cuenta anonimiza, no borra en cascada** (resuelto en la Fase 6): el perfil queda como «Usuario eliminado» y las reseñas se conservan, para no destruir reputación ajena ni falsear medias. Ver «Seguridad y RGPD».
20. Bucket `listing-photos` público (máximo 5 MB, jpeg/png/webp), con escritura solo en `{user_id}/…`.
21. **Avatar como ruta (`avatar_path`), no como URL**, con un CHECK que la ata a la carpeta del usuario.
22. **Magic link solo para cuentas existentes** (`shouldCreateUser: false`). El registro siempre pasa por `/registro`, con nombre y aceptación de condiciones.
23. **Next.js 15 limita el cuerpo de las Server Actions a 1 MB**: se sube a 3 MB en `next.config.ts` para los avatares.
24. Componentes de formulario accesibles en `src/components/ui/` (label, `aria-invalid`, `aria-describedby`, avisos con `role=alert/status`).
25. **Asistente de publicación en una sola página de cliente**, con el paso en `?paso=`: recarga y Atrás funcionan, y el borrador vive en la BD (no en el navegador).
26. **Subida directa de fotos a Storage desde el navegador** (no por Server Action): evita el límite de cuerpo de Next y la doble transferencia. La seguridad la ponen RLS de Storage y la validación de rutas en `updatePhotos`.
27. **Mapa: no se muestra** de momento. Solo texto de barrio/zona, para no revelar la ubicación exacta ni depender de un proveedor de mapas.
28. **El mensaje del interés es también el primer mensaje del chat**, para que la conversación tenga todo el contexto.
29. **Los compañeros se añaden pegando el enlace a su perfil.** No hay buscador de usuarios, para no permitir enumerar perfiles.
30. **Límites de frecuencia en la BD**, no en memoria del servidor: funcionan igual con varias instancias en Vercel y no se pueden saltar llamando a la API directamente.
31. **Navegación tipo app:** en móvil, barra de pestañas inferior fija (`bottom-nav.tsx`: Buscar, Mensajes, Publicar, Reseñas, Perfil); en escritorio, cabecera con enlaces y botón «Publicar anuncio». `manifest.ts` + iconos permiten «Añadir a pantalla de inicio».
32. **Respuesta pública única y no editable**, en una tabla aparte (`review_responses`): la reseña sigue siendo inmutable.
33. **Ocultación cautelar solo por datos personales.** Es el único caso en que dejar visible la reseña mientras se revisa causa un daño difícil de reparar. Para que no se use como censura hay un límite de 10 denuncias al día, un admin la revisa y, si la descarta, la reseña vuelve a verse.
34. **Avisos de ventana con Vercel Cron + route handler**, y no con pg_cron: el envío de email vive en la app (interfaz `Mailer`) y así no hay que dar a Postgres acceso a internet.
35. **Señales anti-abuso solo como hashes con secreto (HMAC)**: minimización de datos (RGPD). No se puede recuperar la IP.
36. **Región europea:** las funciones de Vercel se ejecutan en París (`"regions": ["cdg1"]` en `vercel.json`) y Supabase debe crearse también en Europa (París `eu-west-3` o Frankfurt `eu-central-1`). Así cada consulta no cruza el Atlántico.
37. **CSP con nonce y no con `'unsafe-inline'`** en los scripts: todas las páginas ya eran dinámicas, así que el nonce no cuesta rendimiento.
38. **Límite de acceso por fallos y por cuentas distintas**, no por intentos: en residencias y campus muchos estudiantes comparten IP, y entrar bien nunca debe penalizar.
39. **El borrado de cuenta vive en la BD (trigger en `auth.users`), no en la app:** funciona igual si se borra desde el panel de Supabase, y no hace falta service_role (el usuario borra sus ficheros con su sesión y su fila con una RPC).
40. **Sin banner de cookies** mientras solo haya cookies técnicas de sesión.
41. **«Solo chicas/chicos» permitido** (decisión de producto, en contra de la recomendación prudente de esperar al abogado): en texto y como campo cerrado filtrable para habitaciones y «busco». Si el abogado lo limita, el campo cerrado permite restringirlo sin tocar anuncios uno a uno.
42. **Las marcas de fraude no despublican ni avisan**: un falso positivo no perjudica a un anunciante honrado y un estafador no aprende a esquivar el filtro. Decide un admin.
43. **El registro de moderación se escribe desde la BD**, no desde la app: no se puede moderar sin dejar rastro, ni llamando a la API directamente.
44. **El canal de denuncias está abierto a personas sin cuenta** (DSA art. 16): el caso típico es el de un casero reseñado que no usa Convivo. Se frena el abuso con un límite por IP y email y con la declaración de buena fe.
45. **Al borrar la cuenta se dice «desvincular», no «anonimizar»:** quien convivió con el autor puede deducir quién escribió la reseña por la estancia, así que es seudonimización. Queda pendiente decidir si se corta también el enlace con la estancia.
46. **Borrar la cuenta no sirve para escapar de las reseñas:** con el mismo email se recupera el historial (huella HMAC con clave guardada solo en la BD, 2 años). Con otro email, «Cuenta nueva» y el aviso al admin por conexión compartida. Sin pedir DNI ni teléfono no se puede impedir del todo.
47. **El contrato firmado es la estancia confirmada:** firmar en Convivo crea o confirma la estancia, de modo que cada contrato da reseñas verificadas. Es lo que diferencia a Convivo de una inmobiliaria.
48. **Se firma el texto exacto, no las condiciones:** al enviar se guarda el texto completo y su SHA-256; firmar exige ese hash. Así lo que se firma es lo que se leyó, aunque cambien las plantillas después.
49. **Firma electrónica simple en la fase 1**, sin proveedor externo ni DNI. La avanzada (Signaturit, DocuSign…) llegará cuando haya volumen o cuando lo pida el abogado.
50. **Inventario confirmado por los dos y bloqueado**, con fotos en un bucket privado: es la prueba del estado de la vivienda para devolver la fianza. Si alguien cambia algo, las confirmaciones se anulan.
51. **Guía de la fianza como datos en el código** y no en la BD: cambia poco, se revisa con el abogado y lleva tests que obligan a rellenar organismo y plazo cuando el depósito es obligatorio.
52. **La web de pruebas no se indexa, y se controla con UNA variable** (`INDEXING_ENABLED`, apagada por defecto): `noindex` en cabecera y `<meta>`, y `robots.txt` que bloquea todo. El día del lanzamiento solo cambia una variable en producción.
53. **Ninguna URL absoluta escrita a mano:** sitemap, canonical, Open Graph y JSON-LD salen de la variable pública (`siteurl`); cuando haya dominio, solo cambia ella.
54. **Páginas de ciudad solo para el piloto** (Lugo, A Coruña, Madrid, Barcelona), en `/habitaciones/…` y `/pisos/…`; una ciudad sin anuncios muestra un mensaje útil, no una página vacía. Los perfiles y los anuncios «busco» no se indexan (son personas).
55. **Los datos estructurados nunca llevan dirección exacta ni coordenadas** (decisión 3), y funcionan con la CSP con nonce y páginas dinámicas (decisión 37): ninguna página estática nueva.
