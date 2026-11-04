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
tests/unit, tests/e2e
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` / `npm start` | build y servidor de producción |
| `npm run lint` / `npm run typecheck` | ESLint y `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright (hace falta `npm run build` antes; levanta `next start`) |
| `npm run typegen` | genera los tipos desde el proyecto remoto (necesita `SUPABASE_PROJECT_REF` y `supabase login` o `SUPABASE_ACCESS_TOKEN`) |
| `npm run typegen:local` | lo mismo contra el Supabase local (necesita Docker) |
| `npm run db:push` | aplica las migraciones al proyecto enlazado (`supabase link --project-ref …` antes) |

Antes de cada commit: `npm run lint && npm run typecheck && npm test && npm run build`.

## Variables de entorno

Plantilla en `.env.example`. Los valores reales van en `.env.local` (ignorado por git) o en los ajustes del entorno de la nube o de Vercel. **Nunca** en el chat ni en el repo.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: públicas, llegan al navegador.
- `SUPABASE_SERVICE_ROLE_KEY`: **solo servidor**. Nunca con prefijo `NEXT_PUBLIC_`.
- `SUPABASE_PROJECT_REF`: solo para `typegen`.

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
