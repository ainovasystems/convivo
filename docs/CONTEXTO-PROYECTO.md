# Hommie · Contexto del proyecto (para planificar)

> Documento para el chat de planificación del proyecto. Estado a **17 de noviembre de 2026** (cierre de «Herramientas de revisión: skills de Supabase y gitleaks»).
> **El nombre definitivo es Hommie (dominio hommie.es)**; «Convivo» era provisional. La web ya dice Hommie en todo lo que ve el usuario; la búsqueda en TMview está hecha y hommie.es está comprado (el registrador aún no lo ha entregado); el riesgo de confusión con «homming» sigue como pregunta al abogado (ver `docs/HOJA-DE-RUTA.md`). El detalle técnico completo está en `CLAUDE.md` (raíz del repositorio).
> Qué toca ahora y qué falta: `docs/HOJA-DE-RUTA.md`. Cómo trabajamos: `docs/COMO-TRABAJAMOS.md`.

## 1. Qué es

Plataforma web en español (España) para **vivienda compartida**: un «LinkedIn de la vivienda compartida» que además **sustituye a la inmobiliaria** en lo básico, con el contrato, la firma, el inventario y la fianza.

- **Público:** jóvenes y universitarios; también caseros particulares e inmobiliarias pequeñas.
- **Tres tipos de anuncio:** habitación en piso compartido, piso entero y «busco piso o compañero».
- **Perfiles** al estilo LinkedIn: bio, ciudad, ocupación, edad (año de nacimiento, mínimo 18), idiomas, hábitos, verificaciones y reputación.
- **Lo que nos diferencia: reseñas verificadas.**
  - Solo se reseña tras una **estancia confirmada por las dos partes**.
  - Hay reseñas en cuatro direcciones: inquilino → inmueble, inquilino → casero, casero → inquilino y compañero ↔ compañero.
  - **Firmar el contrato en Hommie confirma la estancia**: cada contrato genera reseñas verificadas.
- **Reglas de las reseñas**, que impone la base de datos y no solo la web:
  - **Doble ciego:** una reseña no es pública hasta que la otra parte reseña o pasan 14 días.
  - **Inmutables:** no se editan. Solo se borran con motivo, y queda constancia.

## 2. Estado en una frase

**El producto completo funciona en una web de pruebas**: anuncios, chat, estancias, reseñas, moderación, seguridad y RGPD, y contratos con firma, inventario, ayuda y seguimiento de la fianza, con control previo de datos personales en el texto público. Para abrir al público falta lo siguiente:

- la revisión del abogado;
- configurar los emails y el dominio;
- repasar a mano la accesibilidad con teclado y lector de pantalla (A8; la 7b ya corrigió lo que midió axe);
- **montar producción**: la operación ya está preparada en la 8a (CI, Sentry, copias y guía paso a paso en `docs/DEPLOY.md`). Lo que falta, con responsable, está en `docs/CHECKLIST-LANZAMIENTO.md`.

**Datos del entorno:**

- **Web de pruebas:** https://convivo-six.vercel.app (Vercel, funciones en París).
- **Base de datos:** Supabase, proyecto «Convivo pruebas», en Europa. No hay todavía un proyecto de producción.
- **Código:** GitHub `ainovasystems/convivo`, rama `claude/new-session-734nfk`, con unos 100 commits. **Cada cambio pasa solo las comprobaciones en GitHub** (pestaña Actions).
- **Pruebas automáticas:** 541 de lógica y base de datos, y 87 de recorrido completo en el navegador (móvil y escritorio; otras 7 se saltan a propósito). Todas pasan, en local y en GitHub.
- **Datos de ejemplo:** 8 usuarios `@convivo.test` con la contraseña `convivo-dev-1234`, y anuncios en Lugo, A Coruña, Madrid y Barcelona.

## 3. Qué puede hacer hoy un usuario

**Cuenta y perfil**

- Registrarse (declarando 18 años o más y aceptando las condiciones) y entrar con contraseña o enlace mágico.
- Completar el perfil con foto.
- Descargar sus datos y borrar su cuenta.

**Buscar**

- La búsqueda arranca con los filtros plegados (resumen y chips que se quitan con un toque). Filtrar por tipo, provincia, ciudad, precio, fecha de entrada, periodo, amueblado, gastos, mascotas, fumadores y orden.
- La búsqueda funciona sin JavaScript y se comparte por URL.

**Publicar**

- Asistente por pasos con autoguardado del borrador y hasta 8 fotos, que se comprimen y pierden la ubicación GPS.
- Periodo de alquiler: indefinido, curso universitario o fechas concretas.
- Si la ciudad es conocida, la provincia se rellena sola.
- La ficha repite el botón de contacto tras «Datos clave» (en móvil) y carga solo la primera foto de la galería hasta que se desliza.
- Se rechazan los textos discriminatorios («solo españoles»…). El campo y el filtro «solo chicas/chicos» se quitaron (Ley 15/2022); lo que cada anunciante escriba en su descripción sigue siendo libre.
- Desde «Mis anuncios» se puede pausar, reactivar, cerrar, duplicar y borrar.

**Contactar**

- «Me interesa» abre un chat en tiempo real. El anunciante acepta o rechaza, y aceptar desbloquea la dirección exacta.
- El chat lleva un aviso fijo: «Nunca pagues antes de ver el piso».

**Estancia**

- Se propone en el chat y la confirma la otra parte. También se pueden registrar convivencias pasadas.
- En las habitaciones se añaden compañeros, que también confirman.

**Contrato (fase 1)**

- Con el interés aceptado, el casero pulsa «Preparar contrato». **El de habitación solo está disponible en Galicia**: fuera sale un aviso, y la estancia y las reseñas funcionan igual (se confirman en el chat).
- Hay tres plantillas en borrador legal: habitación (Código Civil, solo Galicia), vivienda habitual (LAU) y temporada (LAU).
- Cada parte lleva una línea «DNI/NIE» en blanco para rellenar a mano al presentar el trámite de la fianza; Hommie no lo recoge.
- Se firma escribiendo el nombre completo. Queda constancia de la fecha y la hora y de una huella del texto que impide cambiarlo.
- Al firmar los dos, la estancia queda confirmada. El contrato se descarga en PDF.

**Inventario y fianza (fase 2)**

- Con el contrato firmado, las dos partes hacen juntas el inventario de entrada: zona, elemento, estado, notas y fotos privadas.
- Los dos lo confirman, y entonces queda bloqueado para siempre. Si alguien cambia algo antes, hay que volver a confirmarlo.
- Al salir, el inventario de salida se compara con el de entrada y marca solo los daños nuevos.
- El casero tiene el botón «¿Ayuda con la fianza?», con una guía orientativa de dos versiones: Galicia y resto de España. El inquilino no la ve por ahora.

**Seguimiento de la fianza (sin tocar dinero)**

- En el contrato firmado, las dos partes ven un apartado «Fianza» con su estado: pendiente de depositar, depositada, devuelta o reclamada (no recibida). No es una señal pública en el perfil.
- El casero anota la fecha y el número de resguardo del depósito y, si quiere, sube el resguardo (solo lo ve él; el inquilino ve estado, fecha y número).
- Al terminar la estancia, el inquilino declara la fecha de entrega de llaves y el casero la confirma. **Hommie nunca la da por confirmada**: si el casero no responde, consta como «declarada por el inquilino, sin confirmar» (con su fecha y hora de registro, visible para los dos) y el casero recibe recordatorios en la app y por email.
- Con las llaves confirmadas corre un plazo de un mes para devolver la fianza (art. 36.4 LAU, orientativo), visible para las dos partes, con avisos en la app y por email 7 días antes y al vencer. Si la fecha no está confirmada, no hay reloj oficial: pasado un mes desde la fecha declarada, el inquilino puede descargar el paquete de pruebas, que dice de forma expresa que el casero no la confirmó.
- El casero marca la devolución (con el importe devuelto, si quiere; es solo informativo) y el inquilino la confirma o dice que no la ha recibido. Si vence el plazo sin devolverla, el inquilino puede preparar un paquete de pruebas en PDF (contrato y huella, inventarios con fotos, fechas y cronología). Hommie no reclama nada en su nombre.
**Liquidación de salida de la fianza (solo documenta)**

- Cuando los dos habéis confirmado el inventario de salida, el casero abre la liquidación: una lista de partidas con concepto e importe y, si procede, el elemento del inventario al que se refieren, con sus fotos de entrada y de salida. Solo se pueden vincular los **daños nuevos** (a la entrada estaba bien y a la salida está dañado); el desgaste por uso normal se avisa como no descontable.
- Se ve el total de descuentos frente a la fianza (si lo supera, solo se señala).
- El casero la envía; el inquilino responde a cada partida (acepto / no acepto, con comentario obligatorio si no acepta). Estados: en preparación, enviada, de acuerdo, con discrepancias.
- Las dos partes la confirman y queda cerrada: ya nadie puede cambiarla. Antes del cierre, el casero puede reabrirla (lo anterior queda en la cronología). Si hay discrepancias, se hablan en la conversación de siempre y el resumen sirve como constancia.
- El resumen se guarda como PDF (partidas, fotos, respuestas, fechas, estado y huella). Hommie no media, no propone cifras, no decide quién tiene razón y no mueve dinero. Textos en borrador pendiente de revisión legal.

- Habitaciones: «si tu comunidad lo exige»; en Galicia, solo se recuerda consultar al IGVS. Todos los textos son borrador pendiente de revisión legal.

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
- **Arreglos de la auditoría 1 (hecho):** ya no se puede confirmar un inventario sin haber visto un cambio de la otra parte; los importes con céntimos se ven exactos en todas partes; se puede corregir un elemento del inventario sin quitarlo; la entrega de llaves recién declarada sale como «pendiente de confirmar» durante 7 días; las acciones definitivas piden confirmación, y el registro de firmas enseña el nombre del contrato. Quedan los bloques 2, 3 y 4 (ver `HOJA-DE-RUTA.md`).
- `docs/AUDITORIA-PRUEBAS-2026-11.md`: auditoría exploratoria de la web de pruebas (17 de noviembre de 2026), recorriéndola como un usuario real en móvil y escritorio. 2 fallos bloqueantes (se puede confirmar un inventario sin haber visto un cambio; los importes con céntimos se enseñan redondeados en la liquidación), 15 importantes y 27 menores, más dudas de producto y preguntas legales. Sirve para decidir qué arreglar antes del piloto.
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
- **Avisos de errores:** Sentry, en la UE y sin datos personales. Está apagado hasta que se ponga su clave en producción, y vigila también la tarea diaria y que la web responda.
- **Copias:** diarias en Supabase Pro, más una copia propia mensual con las fotos, que la copia de Supabase no incluye. Ver `docs/COPIAS-DE-SEGURIDAD.md`.
- **Búsqueda de claves en el historial:** en cada subida a GitHub, la comprobación automática (gitleaks) recorre todo el historial y falla si encuentra una clave o un secreto, sin mostrar nunca su valor. Al instalarla: 134 commits, 0 hallazgos. Si algún día salta uno real, la clave se rota a mano en Supabase o Vercel (nunca por el chat).
- **Skills oficiales de Supabase:** dos guías de buenas prácticas (seguridad/RLS y rendimiento de Postgres) instaladas sin modificar en `.claude/skills/`, fijadas a una versión concreta y sin actualización automática. Claude Code las consulta al tocar SQL o migraciones; si chocan con una decisión del proyecto, manda `CLAUDE.md`.
- **Trabajo:** el chat de planificación decide y redacta los encargos; Claude Code los ejecuta en el repositorio. Ver `docs/COMO-TRABAJAMOS.md`.

## 5. Decisiones de producto ya tomadas (no reabrir sin motivo)

1. **Reseñas solo tras una estancia confirmada por los dos**, con doble ciego, inmutables y con las reglas en la base de datos.
2. **Estancias retroactivas** confirmadas por los dos, para resolver el arranque en frío de la reputación.
3. **Sin mapa y sin dirección exacta** hasta que el anunciante acepta el interés.
4. **Nunca se pide DNI**, ni nacionalidad, origen, religión o salud. Los contratos solo llevan una línea «DNI/NIE» en blanco para que cada parte la rellene a mano al hacer el trámite de la fianza.
5. **Edad exacta**, calculada a partir del año de nacimiento, con un mínimo de 18 años.
6. **«Solo chicas/chicos»: quitado** (noviembre de 2026, bloque «Correcciones legales»): ni campo ni filtro. La decisión anterior queda revocada por riesgo con la Ley 15/2022.
7. **Borrar la cuenta desvincula, no destruye:**
   - el perfil queda como «Usuario eliminado» y las reseñas se conservan;
   - si la persona vuelve con el mismo email, recupera su historial;
   - una cuenta que comparte conexión con una borrada que tenía malas reseñas genera un aviso para el admin.
8. **Las marcas de fraude no despublican ni avisan al anunciante**: decide un admin.
9. **Firmar el contrato confirma la estancia.** Se firma el texto exacto. La firma es electrónica simple; la avanzada, con un proveedor como Signaturit o DocuSign, queda para más adelante.
10. **El inventario confirmado por los dos queda bloqueado**: es la prueba para devolver la fianza.
10b. **Fianza sin tocar dinero:** Hommie solo deja constancia (estados, fechas, avisos y un paquete de pruebas). Si el casero no responde: avisos, reloj y paquete de pruebas; nunca una carta de requerimiento ni un mediador. La entrega de llaves **nunca** se da por confirmada: solo la confirma el casero. La liquidación de salida solo documenta (sin mediar ni proponer cifras) y queda cerrada al confirmarla las dos partes.
11. **Datos en Europa** (Vercel en París, Supabase en Europa). Solo cookies técnicas, así que no hay banner de cookies.
12. **Indexación:** la web de pruebas no se indexa (una variable la enciende en producción); perfiles y anuncios «busco» no se indexan; las páginas de ciudad son solo las del piloto.
13. **Identidad visual:** blanco y crema, marrón nogal #7b4b2a y acento miel #f4b740, tipografía Plus Jakarta Sans, botones en píldora y estilo startup (Glovo, Too Good To Go, BlaBlaCar). El modo oscuro está desactivado.

Las 70 decisiones técnicas están numeradas en `CLAUDE.md` → «Decisiones tomadas».

**Renombrado (noviembre de 2026):** todo lo que ve el usuario dice Hommie. Los nombres técnicos internos (repositorio, variables, el proyecto «Convivo pruebas») no cambian. Las páginas legales siguen en borrador; `/terminos` ya no permite «solo chicas/chicos». Las plantillas de los emails de acceso de Supabase (en español, con la marca) están en `docs/EMAILS-DE-ACCESO.md` y hay que pegarlas a mano en el panel.

**Datos personales en texto público (noviembre de 2026):** el título, la descripción, las zonas y el barrio de un anuncio, las reseñas, sus respuestas y la biografía del perfil no pueden llevar teléfonos, emails, DNI/NIE, IBAN o tarjetas, enlaces a WhatsApp, Telegram, Instagram y similares, ni direcciones exactas (tampoco las del propio anunciante: el contacto va por el chat). **Se bloquea, no pasa a revisión.** El chat entre las dos partes no se controla. Lo ya publicado no se toca; lo retroactivo lo cubre el canal de denuncias. No se detectan nombres ni datos de salud (con patrones no es fiable).

**Datos sensibles de terceros (Russmedia):** como la plataforma puede ser corresponsable de lo que publican los usuarios, la reseña, la respuesta pública y la biografía llevan un aviso visible («No escribas sobre la salud, la religión, el origen racial o étnico, la orientación o la vida sexual, la ideología política o sindical ni los antecedentes penales de nadie…»). Solo se avisa: no se detecta nada sensible automáticamente. Sigue la ocultación cautelar por datos personales y el canal público de denuncias. Las condiciones y la privacidad (borradores) dicen que Hommie usa el contenido solo para prestar el servicio y que puede ocultarlo o retirarlo.

## 6. Riesgos principales

- **Legal:** nada se abre al público sin la revisión del abogado. Lista de preguntas en `docs/HOJA-DE-RUTA.md`.
- **Arranque en frío:** una web de reseñas vale poco sin reseñas. Plan: **piloto en una sola ciudad** universitaria (Lugo o Santiago), sembrando reputación con los contratos y las estancias retroactivas.
- **Fraude** típico del sector: pagos por adelantado y «estoy en el extranjero». Está cubierto con la detección, el aviso en el chat y la moderación, pero hay que vigilarlo en el piloto.
- **Fianza:** la ayuda es orientativa y solo tiene dos versiones (Galicia y resto de España). Lo de Galicia (plazo de un mes para depositar y que alcance a habitaciones) no está confirmado y lo dice el propio texto.

## 7. Modelo de negocio (sin decidir)

Se decidirá **después** de validar el uso en el piloto. Ideas:

- contrato, inventario y firma gratis al principio y de pago más adelante (por ejemplo, firma avanzada);
- anuncios destacados;
- herramientas para pequeños caseros e inmobiliarias;
- pagos de la renta y seguro de impago con socios regulados (fase 3 de contratos).
