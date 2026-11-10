# Convivo · Contexto del proyecto (para planificar)

> Documento para el chat de planificación del proyecto. Estado a **10 de noviembre de 2026**.
> «Convivo» es un nombre provisional. El detalle técnico completo está en `CLAUDE.md` (raíz del repositorio).
> Qué toca ahora y qué falta: `docs/HOJA-DE-RUTA.md`. Cómo trabajamos: `docs/COMO-TRABAJAMOS.md`.

## 1. Qué es

Plataforma web en español (España) para **vivienda compartida**: un «LinkedIn de la vivienda compartida» que además **sustituye a la inmobiliaria** en lo básico, con el contrato, la firma, el inventario y la fianza.

- **Público:** jóvenes y universitarios; también caseros particulares e inmobiliarias pequeñas.
- **Tres tipos de anuncio:** habitación en piso compartido, piso entero y «busco piso o compañero».
- **Perfiles** al estilo LinkedIn: bio, ciudad, ocupación, edad (año de nacimiento, mínimo 18), idiomas, hábitos, verificaciones y reputación.
- **Lo que nos diferencia: reseñas verificadas.**
  - Solo se reseña tras una **estancia confirmada por las dos partes**.
  - Hay reseñas en cuatro direcciones: inquilino → inmueble, inquilino → casero, casero → inquilino y compañero ↔ compañero.
  - **Firmar el contrato en Convivo confirma la estancia**: cada contrato genera reseñas verificadas.
- **Reglas de las reseñas**, que impone la base de datos y no solo la web:
  - **Doble ciego:** una reseña no es pública hasta que la otra parte reseña o pasan 14 días.
  - **Inmutables:** no se editan. Solo se borran con motivo, y queda constancia.

## 2. Estado en una frase

**El producto completo funciona en una web de pruebas**: anuncios, chat, estancias, reseñas, moderación, seguridad y RGPD, y contratos con firma, inventario y guía de la fianza. Para abrir al público falta lo siguiente:

- la revisión del abogado;
- configurar los emails y el dominio;
- el pulido de diseño, accesibilidad y rendimiento (fase 7b; el SEO técnico ya está hecho en la 7a);
- la preparación del lanzamiento y la operación (fase 8).

**Datos del entorno:**

- **Web de pruebas:** https://convivo-six.vercel.app (Vercel, funciones en París).
- **Base de datos:** Supabase, proyecto «Convivo pruebas», en Europa. No hay todavía un proyecto de producción.
- **Código:** GitHub `ainovasystems/convivo`, rama `claude/new-session-734nfk`, con unos 90 commits.
- **Pruebas automáticas:** 285 de lógica y base de datos, y las de recorrido completo en el navegador (83 pasan en móvil y escritorio, 7 se saltan a propósito). Todas pasan.
- **Datos de ejemplo:** 8 usuarios `@convivo.test` con la contraseña `convivo-dev-1234`, y anuncios en Lugo, A Coruña, Madrid y Barcelona.

## 3. Qué puede hacer hoy un usuario

**Cuenta y perfil**

- Registrarse (declarando 18 años o más y aceptando las condiciones) y entrar con contraseña o enlace mágico.
- Completar el perfil con foto.
- Descargar sus datos y borrar su cuenta.

**Buscar**

- Filtrar por tipo, provincia, ciudad, precio, fecha de entrada, periodo, convivencia «solo chicas/chicos», amueblado, gastos, mascotas, fumadores y orden.
- La búsqueda funciona sin JavaScript y se comparte por URL.

**Publicar**

- Asistente por pasos con autoguardado del borrador y hasta 8 fotos, que se comprimen y pierden la ubicación GPS.
- Periodo de alquiler: indefinido, curso universitario o fechas concretas.
- Si la ciudad es conocida, la provincia se rellena sola.
- Se rechazan los textos discriminatorios («solo españoles»…). «Solo chicas/chicos» se permite por decisión de producto.
- Desde «Mis anuncios» se puede pausar, reactivar, cerrar, duplicar y borrar.

**Contactar**

- «Me interesa» abre un chat en tiempo real. El anunciante acepta o rechaza, y aceptar desbloquea la dirección exacta.
- El chat lleva un aviso fijo: «Nunca pagues antes de ver el piso».

**Estancia**

- Se propone en el chat y la confirma la otra parte. También se pueden registrar convivencias pasadas.
- En las habitaciones se añaden compañeros, que también confirman.

**Contrato (fase 1)**

- Con el interés aceptado, el casero pulsa «Preparar contrato».
- Hay tres plantillas en borrador legal: habitación (Código Civil), vivienda habitual (LAU) y temporada (LAU).
- Se firma escribiendo el nombre completo. Queda constancia de la fecha y la hora y de una huella del texto que impide cambiarlo.
- Al firmar los dos, la estancia queda confirmada. El contrato se descarga en PDF.

**Inventario y fianza (fase 2)**

- Con el contrato firmado, las dos partes hacen juntas el inventario de entrada: zona, elemento, estado, notas y fotos privadas.
- Los dos lo confirman, y entonces queda bloqueado para siempre. Si alguien cambia algo antes, hay que volver a confirmarlo.
- Al salir, el inventario de salida se compara con el de entrada y marca solo los daños nuevos.
- Una guía orientativa dice dónde depositar la fianza en cada comunidad autónoma.

**Reseñas**

- La ventana se abre a los 30 días de entrar o al terminar la estancia, y dura 30 días. Hay avisos por email y en la app.
- El reseñado puede responder una vez en público. Cualquiera puede denunciar; los datos personales se ocultan de forma cautelar.

**Denuncias públicas (DSA)**

- Cualquiera, también sin cuenta, puede notificar contenido ilegal en `/denunciar`, con acuse de recibo y un objetivo de respuesta de 72 h.

**Buscadores y compartir (Fase 7a)**

- Hay páginas públicas por ciudad (Lugo, A Coruña, Madrid y Barcelona), como `/habitaciones/lugo` y `/pisos/lugo`, con sus anuncios, título propio y un mensaje útil si no hay ninguno.
- Al compartir un anuncio o una ciudad en WhatsApp o redes sale una tarjeta con título, foto (o una imagen de marca) y precio.
- Existen `sitemap.xml`, `robots.txt` y datos estructurados, sin dirección exacta ni coordenadas.
- **La web de pruebas no se indexa**: `noindex` en todo y `robots.txt` que bloquea todo. Se enciende con una sola variable (`INDEXING_ENABLED`) en producción el día del lanzamiento. Los perfiles de personas y los anuncios «busco» no se indexan nunca.
- `docs/REVISION-FASE-7.md` lista los problemas de diseño, accesibilidad y rendimiento (con capturas en móvil) para decidir el bloque 7b.

**Admins (`/admin`)**

- Denuncias y notificaciones DSA.
- Anuncios marcados como posible estafa.
- Indicios de autorreseña y de cuentas reabiertas.
- Registro de moderación, que no se puede borrar.

## 4. Tecnología (resumen no técnico)

- **Next.js + TypeScript:** la web, instalable como app desde el móvil.
- **Supabase:** base de datos, usuarios, fotos y tiempo real. La seguridad vive en la propia base de datos: cada usuario solo lee y escribe lo suyo, aunque intente saltarse la web.
- **Vercel:** publicación automática con cada cambio en GitHub.
- **Emails:** con Resend; el código está listo pero falta configurarlo.
- **Trabajo:** el chat de planificación decide y redacta los encargos; Claude Code los ejecuta en el repositorio. Ver `docs/COMO-TRABAJAMOS.md`.

## 5. Decisiones de producto ya tomadas (no reabrir sin motivo)

1. **Reseñas solo tras una estancia confirmada por los dos**, con doble ciego, inmutables y con las reglas en la base de datos.
2. **Estancias retroactivas** confirmadas por los dos, para resolver el arranque en frío de la reputación.
3. **Sin mapa y sin dirección exacta** hasta que el anunciante acepta el interés.
4. **Nunca se pide DNI**, ni nacionalidad, origen, religión o salud.
5. **Edad exacta**, calculada a partir del año de nacimiento, con un mínimo de 18 años.
6. **«Solo chicas/chicos» permitido**, en el texto y como filtro, solo en habitaciones y en «busco». Riesgo legal pendiente (Ley 15/2022).
7. **Borrar la cuenta desvincula, no destruye:**
   - el perfil queda como «Usuario eliminado» y las reseñas se conservan;
   - si la persona vuelve con el mismo email, recupera su historial;
   - una cuenta que comparte conexión con una borrada que tenía malas reseñas genera un aviso para el admin.
8. **Las marcas de fraude no despublican ni avisan al anunciante**: decide un admin.
9. **Firmar el contrato confirma la estancia.** Se firma el texto exacto. La firma es electrónica simple; la avanzada, con un proveedor como Signaturit o DocuSign, queda para más adelante.
10. **El inventario confirmado por los dos queda bloqueado**: es la prueba para devolver la fianza.
11. **Datos en Europa** (Vercel en París, Supabase en Europa). Solo cookies técnicas, así que no hay banner de cookies.
12. **Indexación:** la web de pruebas no se indexa (una variable la enciende en producción); perfiles y anuncios «busco» no se indexan; las páginas de ciudad son solo las del piloto.
13. **Identidad visual:** blanco y crema, marrón nogal #7b4b2a y acento miel #f4b740, tipografía Plus Jakarta Sans, botones en píldora y estilo startup (Glovo, Too Good To Go, BlaBlaCar). El modo oscuro está desactivado.

Las 55 decisiones técnicas están numeradas en `CLAUDE.md` → «Decisiones tomadas».

## 6. Riesgos principales

- **Legal:** nada se abre al público sin la revisión del abogado. Lista de preguntas en `docs/HOJA-DE-RUTA.md`.
- **Arranque en frío:** una web de reseñas vale poco sin reseñas. Plan: **piloto en una sola ciudad** universitaria (Lugo o Santiago), sembrando reputación con los contratos y las estancias retroactivas.
- **Fraude** típico del sector: pagos por adelantado y «estoy en el extranjero». Está cubierto con la detección, el aviso en el chat y la moderación, pero hay que vigilarlo en el piloto.
- **Datos de la guía de la fianza:** son orientativos y hay que verificarlos.

## 7. Modelo de negocio (sin decidir)

Se decidirá **después** de validar el uso en el piloto. Ideas:

- contrato, inventario y firma gratis al principio y de pago más adelante (por ejemplo, firma avanzada);
- anuncios destacados;
- herramientas para pequeños caseros e inmobiliarias;
- pagos de la renta y seguro de impago con socios regulados (fase 3 de contratos).
