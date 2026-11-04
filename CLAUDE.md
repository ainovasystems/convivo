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

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: públicas, llegan al navegador.
- `SUPABASE_SERVICE_ROLE_KEY`: **solo servidor**. Nunca con prefijo `NEXT_PUBLIC_`.
- `SUPABASE_PROJECT_REF`: solo para `typegen`.
- `NEXT_PUBLIC_SITE_URL`: URL pública para los enlaces de los emails (en local se deduce de la cabecera Host).

## Base de datos

### Aplicar las migraciones a tu proyecto de Supabase

**Opción A, CLI (recomendada):**

```bash
npx supabase login                      # una vez; abre el navegador
npx supabase link --project-ref <ref>   # <ref> = la parte xxxx de https://xxxx.supabase.co
npm run db:push                         # aplica supabase/migrations/ en orden
SUPABASE_PROJECT_REF=<ref> npm run typegen
```

**Opción B, editor SQL del panel:** pega y ejecuta cada fichero de `supabase/migrations/` **en orden** (por el nombre). No mezcles A y B en el mismo proyecto: la CLI lleva un registro de las migraciones aplicadas y no sabría de las pegadas a mano.

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
| `reports` | denuncias | quien denuncia y admins | quien denuncia (alta); admin (resolver) |
| `admin_users` | administradores | nadie (vía `private.is_admin()`) | SQL a mano |

RPC (`supabase.rpc(...)`): `confirm_stay`, `cancel_stay`, `end_stay`, `add_stay_participant`, `confirm_stay_participation`, `decline_stay_participation`, `get_review_window`, `delete_review`, `profile_review_stats`, `listing_review_stats`, `review_criteria_for`, `am_i_admin`.

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
5. **Tipografía del sistema** en vez de `next/font/google`: no depende de la red en el build y carga más rápido.
6. Los tokens de diseño (`brand`, `muted`, `border`…) están en `globals.css` y tienen modo oscuro automático.
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
