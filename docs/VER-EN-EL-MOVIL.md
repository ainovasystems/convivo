# Ver Convivo en tu móvil, paso a paso

Vas a publicar Convivo en internet con dos servicios gratuitos:

- **Supabase**: guarda los datos (usuarios, anuncios, mensajes, reseñas).
- **Vercel**: publica la web y te da una dirección `https://…` que abres en el móvil.

Tiempo: unos 20-30 minutos. No hace falta instalar nada en tu ordenador.

> Los nombres de los botones pueden cambiar un poco con el tiempo. Si alguno no coincide, busca uno parecido.

---

## Parte A · Supabase (la base de datos)

1. Entra en **https://supabase.com** y pulsa **Start your project**. Regístrate con tu cuenta de **GitHub**, es lo más cómodo.
2. Pulsa **New project** y rellena:
   - **Name:** `convivo-pruebas`
   - **Database Password:** pulsa *Generate a password* y **guárdala** en un sitio seguro.
   - **Region:** una de Europa (por ejemplo, *West EU (Ireland)* o *Central EU (Frankfurt)*).
   - Pulsa **Create new project** y espera 1 o 2 minutos a que termine.
3. **Instala la base de datos** (una sola vez):
   1. En GitHub abre el repositorio `ainovasystems/convivo` y entra en el archivo `supabase/instalar-base-de-datos.sql`.
   2. Pulsa el botón de **copiar** (icono de dos hojas, arriba a la derecha del archivo).
   3. En Supabase, en el menú de la izquierda, entra en **SQL Editor** y pulsa **New query**.
   4. Pega todo el contenido y pulsa **Run**. Debe salir **Success**.
4. **Carga los datos de ejemplo** (opcional, pero recomendado para ver la app con contenido). Repite el paso anterior con el archivo `supabase/seed.sql`: New query, pegar y Run.
   - Crea 8 usuarios de prueba. Todos tienen la contraseña `convivo-dev-1234`, por ejemplo `ana@convivo.test` o `brais@convivo.test`.
   - ⚠️ Úsalo solo en este proyecto de pruebas, nunca en el definitivo.
5. **Permite registrarse sin confirmar el email** (solo mientras pruebas):
   - Ve a **Authentication → Sign In / Providers** (en algunas versiones, *Sign In / Up*).
   - En el apartado **User Signups**, desactiva **Confirm email** y deja **activado** *Allow new users to sign up*. Guarda.
   - Si no aparece ahí, pulsa el proveedor **Email** en la lista de proveedores: el mismo interruptor está en ese panel.
   - ⚠️ No lo busques en **Authentication → Emails**: esa página solo tiene las plantillas de los correos.
   - Así puedes crear cuentas al momento. Antes de abrir la app al público lo volverás a activar.
6. **Copia las claves.** Ve a **Project Settings → API** (o *API Keys*) y apunta en una nota estos tres valores:
   - **Project URL**: algo como `https://abcd1234.supabase.co`.
   - **anon public**: una clave larga. Es pública y no pasa nada si alguien la ve.
   - **service_role**: otra clave larga. **Es secreta**: no la compartas con nadie ni la pegues en un chat.

## Parte B · Vercel (publicar la web)

1. Entra en **https://vercel.com** → **Sign Up** y elige el plan **Hobby** (gratis). Continúa con **GitHub** y acepta los permisos.
2. Pulsa **Add New… → Project**.
   - En la lista de repositorios busca **convivo** y pulsa **Import**.
   - Si no aparece, pulsa **Adjust GitHub App Permissions**, dale acceso al repositorio `ainovasystems/convivo` y vuelve atrás.
3. **No pulses Deploy todavía.** Abre el apartado **Environment Variables** y añade una a una (Name = nombre, Value = valor):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | el **Project URL** de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clave **anon public** |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clave **service_role** |
   | `CRON_SECRET` | un texto inventado, largo y aleatorio (40 caracteres o más) |
   | `SIGNAL_SECRET` | otro texto inventado, distinto y también largo |

   Para inventar esos dos textos puedes usar un generador de contraseñas (el de tu navegador, por ejemplo). No hace falta que los recuerdes.
4. Pulsa **Deploy** y espera 2 o 3 minutos. Cuando salga **Congratulations**, copia la dirección de tu web. Será algo como `https://convivo-xxxx.vercel.app`.
5. **Dile a Supabase cuál es tu web:**
   - En Supabase ve a **Authentication → URL Configuration**.
   - **Site URL:** pega tu dirección de Vercel.
   - **Redirect URLs:** pulsa *Add URL* y pega tu dirección terminada en `/**`, por ejemplo `https://convivo-xxxx.vercel.app/**`. Guarda.
6. **Último ajuste en Vercel:**
   - Ve a tu proyecto → **Settings → Environment Variables** y añade `NEXT_PUBLIC_SITE_URL` con tu dirección de Vercel.
   - Después ve a **Deployments**, pulsa los tres puntos `⋯` del último despliegue y luego **Redeploy**.

## Parte C · En el móvil

1. Abre tu dirección `https://convivo-xxxx.vercel.app` en **Safari** (iPhone) o **Chrome** (Android).
2. Entra con `ana@convivo.test` y la contraseña `convivo-dev-1234`, o crea una cuenta nueva desde **Perfil → Regístrate**.
3. **Instálala como una app:**
   - **iPhone (Safari):** pulsa el botón **Compartir** (cuadrado con flecha hacia arriba) → **Añadir a pantalla de inicio** → **Añadir**.
   - **Android (Chrome):** menú **⋮** → **Añadir a pantalla de inicio** o **Instalar aplicación**.

   Te aparecerá el icono marrón de Convivo junto a tus otras apps.

## Cosas que debes saber

- **Cada vez que se suban cambios a GitHub, Vercel publica la versión nueva sola** en unos minutos. Tu dirección no cambia.
- **Los emails de la app** (avisos de interés, reseñas…) no se envían hasta que configures un proveedor de correo (Resend). Mientras tanto, todo lo demás funciona.
- **Para enseñarla a otras personas**, pásales la dirección de Vercel. Si cargaste los datos de ejemplo, verán anuncios y perfiles de prueba.
- **Si algo falla:** en Vercel, entra en **Deployments → (el último) → Logs** y copia el error. O dime en qué paso estás y qué ves en pantalla.
