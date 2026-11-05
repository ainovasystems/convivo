# Convivo — guía para Claude Code

> "Convivo" es un nombre provisional.

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

- **Rutas:** `/registro`, `/entrar` (contraseña o magic link), `/auth/callback` (destino de los enlaces de email: acepta `?code=` en PKCE y `?token_hash=&type=`), `/perfil` (redirige al tuyo), `/perfil/[id]` (público) y `/perfil/editar`.
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
- **Filtros en la URL** (`src/lib/listings/filters.ts`): `tipo, provincia, ciudad, precio_min, precio_max, desde, amueblado, gastos, mascotas, fumadores, orden, pagina`. `parseFilters` ignora los valores inválidos (nunca rompe), `serializeFilters` genera la URL canónica y `applyListingFilters` construye la consulta (con tests unitarios sobre un builder falso). El formulario es un `<form method="get">`: funciona sin JavaScript. Con `tipo=seeking`, el precio filtra y ordena por `max_budget`. Paginación por páginas de 12, con desempate por `id`.
- **Dirección exacta:** la pide `/anuncios/[id]` sin más; RLS solo devuelve la fila al dueño y a los interesados aceptados. Los demás ven barrio, ciudad y provincia.
- **Estados:** `active ↔ paused`, `active|paused → closed` (definitivo; se puede duplicar). Solo se borran borradores.
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
- `SUPABASE_PROJECT_REF`: solo para `typegen`.
- `NEXT_PUBLIC_SITE_URL`: URL pública para los enlaces de los emails (en local se deduce de la cabecera Host).
- `RESEND_API_KEY`, `EMAIL_FROM`: email transaccional en producción. `MAILPIT_URL`: buzón local (`npx supabase status`).
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
| `profiles` | perfil público (1:1 con `auth.users`, creado por un trigger) | todos | el dueño, solo columnas editables |
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

RPC (`supabase.rpc(...)`): `confirm_stay`, `cancel_stay`, `end_stay`, `add_stay_participant`, `confirm_stay_participation`, `decline_stay_participation`, `get_review_window`, `delete_review`, `profile_review_stats`, `listing_review_stats`, `review_criteria_for`, `am_i_admin`, `mark_conversation_read`, `my_unread_counts`, `record_signal`, `admin_review_flags` (admin), `review_window_notices_due` (solo service_role).

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
9. Rango de edad en lugar de fecha de nacimiento (minimización de datos, RGPD).
10. **Columnas de BD en inglés** (`city`, `monthly_rent`…); los textos de interfaz, en español.
11. **Dirección exacta en una tabla aparte** (`listing_addresses`), porque RLS filtra filas y no columnas.
12. **Hábitos y reglas en jsonb con claves cerradas**, validadas con CHECK: no se pueden guardar ni filtrar criterios discriminatorios.
13. **Borradores incompletos permitidos.** Los CHECK de campos obligatorios por tipo solo se aplican a partir de `status <> 'draft'`.
14. **Estancias retroactivas** (sin interés previo y con inicio en el pasado), con doble confirmación igualmente, para resolver el arranque en frío de la reputación.
15. **Los cambios de estado de las estancias van por RPC** (`confirm_stay`…), nunca con UPDATE directo.
16. **Doble ciego sin cron:** `published_at` guarda la fecha programada de publicación.
17. **Estadísticas mediante funciones `security definer`** con filtro explícito de "publicada", en lugar de vistas (que se saltarían RLS o contarían reseñas pendientes).
18. **Denuncias con claves foráneas reales** por tipo de objetivo y CHECK de "exactamente uno".
19. **Borrado de cuenta en cascada por ahora.** El trigger impide borrar reseñas directamente, pero deja pasar la cascada. TODO (Prompt 6): anonimizar en vez de borrar.
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
