# Montar producción, paso a paso

> Guía para alguien que **no programa**. Sigue los pasos en orden y marca cada casilla.
> Escrita en noviembre de 2026 (Fase 8a). Los paneles de Supabase, Vercel, Resend y Sentry cambian a veces de sitio sus botones: si algo no está donde dice la guía, busca el nombre del ajuste en el buscador del propio panel.
> La lista de todo lo que falta antes de abrir está en `docs/CHECKLIST-LANZAMIENTO.md`. Las copias de seguridad, en `docs/COPIAS-DE-SEGURIDAD.md`.

## Reglas de oro (léelas antes de empezar)

1. **Ninguna clave en el chat ni en el repositorio.** Ni con Claude, ni en GitHub, ni en un documento compartido. Las claves solo se pegan en los paneles de **Vercel** y **Supabase**, y se guardan en tu gestor de contraseñas.
2. **Producción y pruebas no se mezclan.**
   - Producción usa un proyecto de Supabase **nuevo**; «Convivo pruebas» sigue siendo solo para pruebas.
   - Nunca copies claves de un proyecto al otro.
3. **Nunca cargues los datos de ejemplo** (`supabase/seed.sql`) en producción: crean usuarios con una contraseña conocida.
4. **Una sola forma de instalar la base de datos** (la de esta guía, el editor SQL). No uses después la línea de comandos (`db push`) en el mismo proyecto.
5. **`SIGNAL_SECRET` no se cambia nunca** una vez que la web está abierta. Si se cambia, se pierden los avisos antiabuso y los límites de acceso.
6. **`INDEXING_ENABLED=true` solo en producción**, el día del lanzamiento. En la web de pruebas, nunca.

## Antes de empezar

- [ ] El dominio **hommie.es** comprado. Mientras no esté, puedes hacer los pasos 1 a 3; el resto lo necesita.
- [ ] Un gestor de contraseñas (Bitwarden, 1Password, el del navegador…) para guardar las claves que vayan saliendo.
- [ ] Acceso a tu cuenta de GitHub y a la de Vercel, la misma con la que publicas la web de pruebas.
- [ ] La **decisión de la planificación** sobre de qué rama de GitHub sale producción. Se recomienda `main`: lo que esté en `main` es lo que ven los usuarios. Para publicar, se fusiona la rama de trabajo en `main`.

---

## 1. Supabase de producción (base de datos, usuarios y fotos)

### 1.1 Crear el proyecto
- [ ] En https://supabase.com/dashboard → **New project**.
  - **Nombre:** `hommie-produccion`, o el que quieras, pero que se distinga de «Convivo pruebas».
  - **Región:** **Europe West (Paris)**, porque las funciones de Vercel están en París. Si no aparece, **Central EU (Frankfurt)**. **Nunca** una región fuera de la UE.
  - **Contraseña de la base de datos:** genera una larga y guárdala en el gestor. No la vas a necesitar a diario, pero sí para las copias propias.
- [ ] Pasa el proyecto (o la organización) al **plan Pro**: Billing → Upgrade. El plan gratuito **pausa el proyecto tras 7 días con poca actividad** y no tiene copias diarias.
- [ ] Billing → deja **activado el límite de gasto** («Spend Cap»). Así nunca te cobran de más por tráfico: si te pasas de lo incluido, avisan por email.

### 1.2 Instalar la base de datos (una sola vez, con el proyecto vacío)
- [ ] En el repositorio, abre `supabase/instalar-base-de-datos.sql`. Contiene todas las migraciones juntas y **no** los datos de ejemplo.
- [ ] Supabase → **SQL Editor** → **New query** → pega el fichero entero → **Run**. Tarda unos segundos y debe terminar sin errores.
  - Si sale un error, **no lo ejecutes otra vez encima**. Copia el mensaje y pásaselo a Claude Code: lo más seguro es borrar el proyecto y empezar de nuevo, porque todavía está vacío.
- [ ] Comprueba que no se ha colado nada de ejemplo: SQL Editor → `select count(*) from auth.users;` debe dar **0**.

**Cambios futuros de la base de datos:** cuando Claude Code añada una migración nueva (un fichero nuevo en `supabase/migrations/`), te dirá cuál es. Pégala en el SQL Editor y anótala en la tabla «Migraciones aplicadas en producción», al final de esta guía. **Nunca** pegues `instalar-base-de-datos.sql` en un proyecto que ya tiene datos.

### 1.3 Usuarios y emails de acceso (Authentication)
- [ ] Authentication → **Sign In / Providers** → Email: activa **Confirm email**. Es obligatorio: así nadie se registra con un email ajeno.
- [ ] Authentication → **URL Configuration**:
  - **Site URL:** `https://hommie.es`
  - **Redirect URLs:** añade `https://hommie.es/auth/callback`. Si vas a usar también la versión con www, añade `https://www.hommie.es/auth/callback`.
- [ ] Authentication → **Emails → SMTP Settings**: activa el SMTP propio con **Resend** (paso 3). El de Supabase solo manda unos pocos emails a la hora y solo al equipo.
- [ ] Authentication → **Emails → Templates**: los emails de confirmar cuenta, enlace mágico y cambio de contraseña vienen **en inglés**. Tradúcelos al español; está en el checklist.

### 1.4 Las claves que necesitarás en Vercel
En Supabase → **Project Settings → API Keys** y **Data API**:
- **Project URL** (`https://xxxx.supabase.co`): es pública.
- **Publishable key** (`sb_publishable_…`): es pública y llega al navegador; la protege RLS.
- **Secret key** (`sb_secret_…`): **solo servidor**. Salta todas las protecciones. Guárdala en el gestor y pégala solo en Vercel.

### 1.5 Admins
- [ ] Regístrate en la web de producción con tu email, cuando esté publicada (paso 2), y confirma el email.
- [ ] SQL Editor → `select id, email from auth.users;` → copia tu `id`.
- [ ] `insert into public.admin_users (user_id) values ('<tu id>');` Ya puedes entrar en `/admin`.

---

## 2. Vercel de producción (la web)

**Recomendación:** un **proyecto de Vercel nuevo** para producción (por ejemplo `hommie`), conectado al mismo repositorio de GitHub y con la rama de producción `main`. El proyecto actual (`convivo-six.vercel.app`) sigue siendo la web de pruebas con «Convivo pruebas». Así es imposible mezclar las variables de un entorno con las del otro.

> Para un uso comercial, Vercel pide el **plan Pro**: el gratuito (Hobby) es para uso personal no comercial. Compruébalo en vercel.com/pricing antes de abrir.

### 2.1 Crear el proyecto
- [ ] Vercel → **Add New → Project** → elige el repositorio `convivo` → **Root Directory:** el de por defecto → **Deploy**. Fallará o saldrá vacío sin las variables; es normal.
- [ ] Settings → **Git** → **Production Branch:** `main`.
- [ ] Settings → **Functions → Function Region:** ya viene fijada en el código (`vercel.json`, París). No la cambies.

### 2.2 Variables de entorno (Settings → Environment Variables)
Añádelas **solo en el entorno «Production»**. Después de cambiar cualquier variable hay que volver a desplegar: Deployments → los tres puntos → Redeploy.

El código acepta **dos nombres** para cada una. El de la izquierda manda si existen los dos.

| Nombre corto | Nombre estándar | Valor | Notas |
|---|---|---|---|
| `projecturl` | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase producción | Pública |
| `publickey` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | Pública |
| `secretkey` | `SUPABASE_SERVICE_ROLE_KEY` | Secret key | **Secreta.** Nunca con `NEXT_PUBLIC_` delante |
| `siteurl` | `NEXT_PUBLIC_SITE_URL` | `https://hommie.es` | Sin barra al final |
| `resendkey` | `RESEND_API_KEY` | Clave de Resend (paso 3) | Secreta |
| `emailfrom` | `EMAIL_FROM` | `Hommie <no-responder@hommie.es>` | El dominio debe estar verificado en Resend |
| — | `CRON_SECRET` | Un valor aleatorio largo | **Con este nombre exacto**: si no, Vercel no lo envía a la tarea diaria |
| `signalsecret` | `SIGNAL_SECRET` | Un valor aleatorio largo | **No lo cambies nunca** después de abrir |
| `sentrydsn` | `NEXT_PUBLIC_SENTRY_DSN` | DSN de Sentry (paso 4) | Opcional. Vacío = Sentry apagado |
| `indexing` | `INDEXING_ENABLED` | `true` | **Solo el día del lanzamiento** (paso 5) |

**Cómo generar un valor aleatorio largo** para `CRON_SECRET` y `SIGNAL_SECRET`: usa el generador de contraseñas de tu gestor, con 48 caracteres y solo letras y números. Guárdalos en el gestor y **no** los reutilices de la web de pruebas.

### 2.3 Dominio
- [ ] Settings → **Domains** → añade `hommie.es`, y `www.hommie.es` redirigiendo a `hommie.es`.
- [ ] Vercel te muestra los registros DNS que tienes que crear (un registro A o CNAME). Créalos en el panel de quien te vendió el dominio, **copiándolos de Vercel**. Pueden tardar de minutos a unas horas en funcionar.

### 2.4 Comprobar
- [ ] Abre `https://hommie.es/estado`: todo en verde salvo, quizá, lo que aún no hayas configurado. Ahí verás qué variable falta (nunca su valor).
- [ ] Regístrate con un email tuyo: tiene que llegar el email de confirmación (paso 3) y, al pulsarlo, tienes que entrar.
- [ ] Publica un anuncio de prueba, míralo desde otro móvil sin sesión y **bórralo** después. En producción no deben quedar datos de prueba.

---

## 3. Resend (emails) y DNS

- [ ] Crea la cuenta en https://resend.com. Si al añadir el dominio te deja elegir región, elige **Europa**.
- [ ] **Domains → Add Domain** → `hommie.es`. Resend te da varios registros DNS (SPF, DKIM y, a veces, MX para las devoluciones). Créalos en el panel del dominio **tal cual te los da Resend**, y espera a que aparezca «Verified».
- [ ] Añade también un registro **DMARC**, si Resend no lo pide. Es un TXT en `_dmarc.hommie.es` con un valor como `v=DMARC1; p=none; rua=mailto:<tu email>`. Mejora la entrega y protege la marca.
- [ ] **API Keys → Create API Key**, con permiso **Sending access** y limitada al dominio `hommie.es`. Pégala en Vercel como `resendkey` (paso 2.2).
- [ ] Para los emails de Supabase (confirmar cuenta, enlace mágico): Supabase → Authentication → **SMTP Settings**. Copia de la documentación de Resend («SMTP») el servidor, el puerto, el usuario y usa como contraseña una clave de Resend. Remitente: `no-responder@hommie.es`.
- [ ] Prueba: regístrate con otro email y comprueba que llega, y que no cae en spam.

---

## 4. Sentry (avisos de errores y de la tarea diaria)

Es **opcional pero muy recomendable**: te avisa por email de los errores sin tener que mirar registros. El código ya lo trae preparado y **apagado** hasta que pongas el DSN.

**Qué se envía y qué no:**
- Se envía el tipo de error, en qué página y en qué navegador.
- No se envía: usuario, IP, cookies, cabeceras, lo que se escribe en formularios ni parámetros de las URL. Los emails, teléfonos e identificadores se tapan antes de enviar.
- No hay grabación de sesiones.
- Está probado en `tests/unit/sentry.test.ts`.

### 4.1 Crear la cuenta
- [ ] https://sentry.io → crea la organización con **Data Storage Location: European Union**. **No se puede cambiar después.** El DSN debe acabar en `.ingest.de.sentry.io`.
  - Aunque elijas la UE, Sentry guarda en EE. UU. las comprobaciones de las tareas programadas, la configuración de la organización y las claves. Ahí no hay datos de personas, solo «la tarea se ejecutó a tal hora».
- [ ] Plan **Developer (gratuito)**. Incluye **1 monitor de tarea programada y 1 de disponibilidad**. La cuota de errores (unos 5.000 al mes) está **sin verificar**: compruébala en sentry.io/pricing.
- [ ] Crea un proyecto de tipo **Next.js**. **Sáltate el asistente** («wizard»): no hace falta ejecutar nada, el código ya está hecho. Copia solo el **DSN** (Settings → Client Keys (DSN)).
- [ ] Pega el DSN en Vercel como `sentrydsn` y vuelve a desplegar.

### 4.2 Para que un bucle de errores no gaste la cuota del mes
El código ya limita los envíos: 10 por hora en cada navegador y 30 por minuto en cada servidor. Añade además el límite de Sentry:
- [ ] Project Settings → **Client Keys (DSN)** → tu clave → **Rate Limiting**: **150 eventos por día**. 150 × 30 días ≈ 4.500, por debajo de los 5.000.
- [ ] Project Settings → **Spike Protection**: activado.
- [ ] Project Settings → **Security & Privacy**:
  - activa **Data Scrubber** y **Use Default Scrubbers**;
  - activa **Prevent Storing of IP Addresses**.

### 4.3 Las tres alertas por email
1. **Incidencia nueva**
   - [ ] Alerts → **Create Alert** → *Issues*.
   - [ ] Condición «**A new issue is created**», entorno `production`.
   - [ ] Acción: enviar un email a ti (o al equipo).
2. **La tarea diaria no se ejecuta o falla** (avisos de reseña, todos los días a las 08:17 UTC)
   - [ ] Espera a la primera ejecución, al día siguiente de poner el DSN. En **Crons** aparecerá solo el monitor **`review-windows`**, porque lo crea el código.
   - [ ] Ábrelo → **Alerts / Notify**: email cuando falle o no se ejecute (está configurado con 30 min de margen).
   - [ ] Si a los dos días no aparece, revisa que `CRON_SECRET` exista con ese nombre exacto en Vercel.
3. **Disponibilidad** (la web o la base de datos no responden)
   - [ ] Monitors → **Create Monitor → Uptime**.
     - URL: `https://hommie.es/api/salud`. Responde «ok» si la web **y** la base de datos contestan, y da error si no.
     - Intervalo: 5 minutos.
   - [ ] Notificación por email.
   - El plan gratuito trae **un** monitor de disponibilidad. Usarlo en `/api/salud` vigila a la vez la web y la base de datos.
   - Vigilar además la portada, `/anuncios` y `/habitaciones/lugo` exige más monitores: en Sentry, solo en planes de pago, a 1 $ al mes cada uno. La alternativa es un servicio gratuito aparte, como UptimeRobot. **Decisión pendiente** (ver checklist).

### 4.4 Comprobar
- [ ] Al día siguiente: en Sentry → Crons, `review-windows` en verde.
- [ ] En Sentry → Uptime, el monitor en verde.

---

## 5. El día del lanzamiento

- [ ] Vercel (proyecto de producción) → variable `INDEXING_ENABLED` = `true` → Redeploy.
- [ ] Comprueba:
  - `https://hommie.es/robots.txt` ya no dice `Disallow: /` y menciona el sitemap;
  - `https://hommie.es/sitemap.xml` lista páginas;
  - `https://hommie.es/habitaciones/lugo` ya no lleva `noindex`.
- [ ] **Google Search Console:**
  - https://search.google.com/search-console → **Añadir propiedad → Dominio** → `hommie.es`;
  - verifica con el registro TXT que te da Google, creado en el panel del dominio;
  - después, **Sitemaps** → `https://hommie.es/sitemap.xml` → Enviar.
- [ ] Repasa `docs/CHECKLIST-LANZAMIENTO.md`: no se abre con nada en rojo.

---

## Lo que NO hay que hacer

- ❌ Pegar claves en el chat, en GitHub o en documentos.
- ❌ Ejecutar `supabase/seed.sql` en producción.
- ❌ Ejecutar `instalar-base-de-datos.sql` sobre un proyecto que ya tiene datos.
- ❌ Usar `supabase db push` (línea de comandos) en producción: la base se instaló por el editor SQL y la línea de comandos no lo sabría.
- ❌ Poner `INDEXING_ENABLED=true` en la web de pruebas.
- ❌ Cambiar `SIGNAL_SECRET` o `CRON_SECRET` sin motivo. `SIGNAL_SECRET`, nunca.
- ❌ Desactivar «Confirm email» en producción.
- ❌ Desactivar RLS de una tabla «para probar algo».
- ❌ Restaurar una copia sin seguir `docs/COPIAS-DE-SEGURIDAD.md`: las cuentas borradas no deben reaparecer.
- ❌ Activar en Sentry la grabación de sesiones (Session Replay) o «Send Default PII».

---

## Migraciones aplicadas en producción

Anota aquí cada migración que pegues en el SQL Editor de producción, en orden.

| Fecha | Fichero | Quién | Resultado |
|---|---|---|---|
| _(instalación)_ | `instalar-base-de-datos.sql` (hasta `20261111000100_contract_inventories.sql`) | | |
