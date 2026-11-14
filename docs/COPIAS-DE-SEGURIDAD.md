# Copias de seguridad y cómo restaurarlas

> Para producción (Supabase **Pro**). Escrito en noviembre de 2026 a partir de la documentación oficial de Supabase:
> - copias: supabase.com/docs/guides/platform/backups;
> - volcado propio: …/migrating-within-supabase/backup-restore;
> - acceso S3 a Storage: …/storage/s3/authentication.
>
> Es un **borrador de procedimiento**: conviene que lo revise quien haga de responsable técnico.

## Lo esencial en 5 líneas

1. **Supabase Pro hace una copia diaria** de la base de datos y guarda **los últimos 7 días**.
2. **Esas copias NO incluyen las fotos.** Supabase lo dice así: *«Database backups do not include objects you store via the Storage API»*. Las fotos de anuncios, los avatares y las fotos de inventario hay que copiarlas aparte.
3. Además, **una vez al mes** hacemos una **copia propia**: la base de datos y las fotos. Se guarda **cifrada** fuera de Supabase y se conservan las 3 últimas.
4. **Cada 3 meses se prueba a restaurar** en un proyecto vacío. Una copia que nunca se ha probado puede no servir.
5. **Al restaurar, las cuentas borradas no pueden volver.** Antes de restaurar se apunta qué cuentas se han borrado desde la fecha de la copia, y después se vuelven a borrar (sección 4).

## 1. Copias automáticas de Supabase

- **Dónde:** panel de Supabase → **Database → Backups**.
- **Frecuencia y conservación:** una al día y se guardan 7 días (plan Pro).
- **Qué incluye:** toda la base de datos (usuarios, perfiles, anuncios, reseñas, contratos, inventarios y registros) y los *datos sobre* las fotos, pero **no los ficheros de las fotos**.
  - Tampoco guarda las contraseñas de los roles de base de datos personalizados. Convivo no usa ninguno.
- **Opción PITR** (volver a cualquier momento, con unos 2 minutos de pérdida como mucho):
  - es un complemento de pago (desde unos 100 $ al mes para 7 días) y exige un tamaño de servidor mayor;
  - si se activa, Supabase deja de hacer las copias diarias.
  - **No hace falta en el piloto.** Se reconsidera si hay muchos contratos firmados al día.

## 2. Copia propia mensual

La hace la persona responsable técnica, con un ordenador, siguiendo la guía oficial de Supabase. Claude Code puede guiarla paso a paso. Hace falta: Node.js, Docker (la línea de comandos de Supabase lo usa para el volcado) y `rclone` para las fotos.

### 2.1 Base de datos
1. En Supabase → **Connect** (arriba), copia la cadena de conexión del **Session pooler**. Lleva la contraseña de la base de datos, que está en el gestor de contraseñas.
2. En una carpeta **fuera del repositorio**, ejecuta los tres volcados que recomienda Supabase:

```bash
npx supabase db dump --db-url "<cadena de conexión>" -f roles.sql --role-only
```

```bash
npx supabase db dump --db-url "<cadena de conexión>" -f schema.sql
```

```bash
npx supabase db dump --db-url "<cadena de conexión>" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

### 2.2 Fotos (Storage)
1. Supabase → **Storage → Settings**, apartado **S3** (o «S3 Connection»): activa el acceso S3, copia el *endpoint* y la región, y crea un par de claves S3.
   - **Ojo:** estas claves dan acceso total a todos los ficheros y se saltan RLS. Guárdalas en el gestor y no las pongas nunca en Vercel ni en el repositorio.
2. Configura `rclone` con un remoto de tipo S3: proveedor «Other», con el endpoint, la región y las claves anteriores. Llámalo `supabase`.
3. Copia los tres buckets:

```bash
rclone copy supabase:listing-photos ./fotos/listing-photos
```

```bash
rclone copy supabase:avatars ./fotos/avatars
```

```bash
rclone copy supabase:inventory-photos ./fotos/inventory-photos
```

### 2.3 Guardarla bien
- La copia contiene **datos personales**: emails, conversaciones, contratos y fotos de dentro de las viviendas.
  - Guárdala **cifrada**, en un disco cifrado o en un archivo con contraseña fuerte.
  - Nunca la subas a GitHub, a un Drive compartido ni a la web de pruebas.
- **Conserva las 3 últimas** y borra las anteriores. La tabla de conservación (`docs/legal/conservacion.md`) se aplica también a las copias.
- Apunta en la tabla del final la fecha y quién la hizo.

## 3. Restaurar

### 3.1 Algo ha ido mal hace poco (menos de 7 días)
1. **Antes de nada, sigue la sección 4**: apunta las cuentas borradas desde la fecha de la copia.
2. Supabase → **Database → Backups** → elige la copia → **Restore**.
   - **El proyecto queda inaccesible mientras dura**, desde minutos hasta más según el tamaño, así que la web estará caída ese rato.
   - Si se puede, avisa antes en la web o en redes.
3. Al terminar, aplica la sección 4 (volver a borrar las cuentas).
4. **Fotos:** la restauración **no recupera las fotos borradas** después de la copia. Si algún anuncio o avatar apunta a una foto que ya no existe, se verá el hueco de «sin foto». Si hace falta, se recupera de la copia mensual con `rclone copy ./fotos/<bucket> supabase:<bucket>`.
5. Comprueba `/estado`, `/api/salud` y un par de páginas.

### 3.2 Desde la copia propia (si Supabase no tiene una copia válida)
Restaurar en un proyecto **nuevo y vacío**. Comando de la guía oficial:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "<cadena de conexión del proyecto nuevo>"
```

`session_replication_role = replica` desactiva los triggers durante la carga, para que no vuelvan a saltar avisos ni registros. Después:
- sube las fotos con `rclone copy`;
- cambia en Vercel las variables de Supabase al proyecto nuevo y vuelve a desplegar;
- aplica la sección 4;
- revisa la configuración de Auth del proyecto nuevo (Confirm email, URLs y SMTP), porque no viaja con la copia.

### 3.3 Prueba de restauración (cada 3 meses)
1. Crea un proyecto de Supabase **temporal**.
2. Restaura en él la última copia propia (3.2), sin tocar Vercel.
3. Comprueba que hay usuarios, anuncios, reseñas y contratos, y que las fotos están.
4. **Borra el proyecto temporal** al terminar: tiene datos personales reales.
5. Apunta la prueba en la tabla del final.

## 4. Las cuentas borradas no pueden reaparecer

Si alguien borró su cuenta **después** de la fecha de la copia, al restaurar volvería a aparecer con todos sus datos. Eso incumpliría su derecho de supresión (RGPD). Por eso:

**Antes de restaurar** (si la base actual todavía responde), en el SQL Editor:

```sql
select id, deleted_at from public.profiles
 where deleted_at >= '<fecha y hora de la copia, p. ej. 2027-03-10 03:00+00>'
 order by deleted_at;
```

- Guarda la lista de `id`. Son identificadores internos, no nombres ni emails.
- Si la base **no** responde, búscalos en Supabase → **Logs** → Auth, en los borrados de usuarios desde esa fecha. Cuánto tiempo guarda Supabase esos registros depende del plan: compruébalo. Por eso conviene restaurar siempre la copia **más reciente** posible.

**Después de restaurar**, por cada `id` de la lista:

```sql
delete from auth.users where id in ('<id 1>', '<id 2>');
```

- Esto dispara el mismo proceso que «Borrar mi cuenta»: perfil «Usuario eliminado», conversaciones borradas, anuncios cerrados o borrados…
- Comprueba que `select deleted_at from public.profiles where id = '<id>'` ya no está vacío.
- Los ficheros de esas cuentas (avatar y fotos) **ya no existen** en Storage, porque se borraron al borrar la cuenta y la restauración no los trae. Si la copia propia se hizo antes del borrado, **no los vuelvas a subir**: borra sus carpetas (`<id>/…` en `avatars` y `listing-photos`) de la copia local antes de usarla.
- Apunta en el registro (tabla del final) que se repitió el borrado, con fecha y número de cuentas.

## Registro de copias y pruebas

| Fecha | Tipo (mensual / prueba de restauración / restauración real) | Quién | Notas |
|---|---|---|---|
| | | | |
