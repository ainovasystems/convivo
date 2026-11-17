# Hommie · Hoja de ruta

> **Fuente única de «qué toca ahora».** Solo se trabaja en el bloque marcado como **SIGUIENTE**. Lo que surja por el camino va a «Ideas aparcadas», no se hace en ese momento.
> La actualiza Claude Code al cerrar cada bloque y se vuelve a subir al proyecto de Claude.
> Última actualización: **17 de noviembre de 2026** (cierre de «Arreglos de la auditoría 1: lo que queda fijado»).
> Lo que falta antes de abrir, con responsable y estado: `docs/CHECKLIST-LANZAMIENTO.md`.

## Hecho

| Bloque | Qué incluye |
|---|---|
| Fases 0-5 | Arranque, modelo de datos y RLS, cuentas y perfiles, anuncios, interés, chat y estancias, reseñas y moderación |
| Diseño y despliegue de pruebas | Marrón y blanco, barra inferior en móvil, instalable, Vercel + Supabase, página `/estado` |
| Fase 6 · Seguridad y RGPD | Auditoría de RLS, CSP con nonce, límites de acceso, exportar y borrar la cuenta, textos legales en borrador, anti-discriminación, anti-fraude, registro de moderación |
| Ajustes legales | Canal DSA de denuncias, casilla 18+, edad exacta, «solo chicas/chicos», cuentas que vuelven, ponderación, EIPD y tabla de conservación |
| Contratos · fase 1 | Plantillas, edición, envío, firma de los dos, estancia confirmada, PDF |
| Contratos · fase 2 | Inventario de entrada y salida con fotos privadas y bloqueo, guía de la fianza por comunidad autónoma |
| Fase 8a · Operación sin dominio | CI en GitHub Actions (lint, tipos, pruebas, build y e2e con Supabase local en cada cambio), Sentry preparado (apagado sin clave, UE, sin datos personales, límite de envíos, monitor de la tarea diaria), `/api/salud` para el monitor de disponibilidad, `docs/DEPLOY.md`, `docs/COPIAS-DE-SEGURIDAD.md`, `docs/CHECKLIST-LANZAMIENTO.md` y medición del peso de las fotos (`docs/PESO-DE-LAS-FOTOS.md`) |
| Fase 7b · Arreglos de diseño, accesibilidad y rendimiento | D1-D4, D6, D7, D9, P1, P2, A1-A6 y fotos más ligeras (ver `docs/REVISION-FASE-7.md` §5): filtros plegados con resumen y chips, botón de contacto repetido en la ficha, perfil sin esqueleto, tarjetas ≤ 828 px y galería que carga solo la primera foto |
| Correcciones legales | Quitado el campo y el filtro «solo chicas/chicos»; contrato de habitación solo para anuncios en Galicia (fuera, aviso y la estancia se confirma en el chat); guía de la fianza con dos versiones (Galicia y resto de España) y solo para el casero, tras el botón «¿Ayuda con la fianza?»; línea «DNI/NIE» en blanco por parte en los contratos; Sentry en `/privacidad` |
| Fianza: seguimiento (1 de 2) | Apartado «Fianza» en el contrato firmado: depósito anotado por el casero (fecha, n.º de resguardo y resguardo privado), entrega de llaves (la declara el inquilino y la confirma el casero; ya no se da nunca por confirmada: sin confirmar consta como «declarada por el inquilino, sin confirmar» y el casero recibe recordatorios), reloj de un mes para devolver (art. 36.4 LAU) con avisos in-app y por email, devolución marcada por el casero y confirmada por el inquilino, y paquete de pruebas imprimible a PDF si vence el plazo. Sin tocar dinero |
| Fianza: liquidación de salida (2 de 2) | Ajuste de las llaves (sin confirmación a los 7 días; fecha «declarada, sin confirmar» con recordatorios al casero; paquete de pruebas pasado un mes desde la fecha declarada, con aviso expreso de que no la confirmó el casero), importe devuelto informativo y liquidación de salida: partidas del casero (solo daños nuevos vinculables al inventario, con fotos de entrada y salida; el desgaste se avisa como no descontable), respuesta del inquilino partida por partida, confirmación de las dos partes y bloqueo, reabrir antes del cierre, enlace a la conversación y resumen imprimible a PDF con huella. Cronología append-only. Solo documenta |
| Control previo de datos personales | Anuncios (título, descripción, zonas y barrio), reseñas, respuestas públicas y biografía rechazan teléfonos, emails (también «arroba»), DNI/NIE, IBAN y tarjetas, canales de contacto externos y direcciones exactas. Aviso en vivo y de nuevo en el servidor; no se repite el dato. Reseñas y respuestas, además, con respaldo en la base de datos. El chat no se toca |
| Datos sensibles de terceros (Russmedia) | Aviso visible sobre datos sensibles en la reseña, la respuesta pública y la biografía; el motivo «datos personales» de las denuncias lo dice expresamente; `/terminos` y `/privacidad` ajustadas (uso del contenido solo para prestar el servicio, retirada y cómo notificar). Sin detección automática |
| Renombrado a Hommie y emails de acceso | Todo lo que ve el usuario dice Hommie (cabecera, portada, títulos, tarjetas para compartir, manifest, emails de la app, errores, contratos, PDF y páginas legales, que siguen en borrador). `/terminos` §3 ya no permite «solo chicas/chicos». Plantillas de los emails de acceso de Supabase en español en `docs/EMAILS-DE-ACCESO.md`. Los nombres internos no cambian |
| CI en verde (e2e del asistente y de los chips) | Dos pruebas fallaban en la CI. (1) La del asistente comprobaba mal que el aviso no repite el teléfono: encontraba el propio campo, no el aviso (el aviso **nunca** lo repitió); ahora mira el aviso. (2) Los chips «Quitar filtro» fallaban a veces de verdad: el esqueleto de carga `src/app/anuncios/loading.tsx` dejaba bloqueada la navegación por parámetros de búsqueda; se quitó (como en el perfil) |
| Herramientas de revisión (skills de Supabase y gitleaks) | Las dos skills oficiales de Supabase (`supabase` y `supabase-postgres-best-practices`) instaladas sin modificar en `.claude/skills/`, fijadas a un commit y sin hooks ni actualización automática, para que Claude Code las consulte al tocar SQL, RLS o migraciones (origen y reglas en `CLAUDE.md` y `.claude/skills/ORIGEN-SKILLS.md`). Nuevo trabajo «secretos» en la CI: gitleaks recorre todo el historial y falla si hay una clave, sin mostrar nunca su valor. Resultado inicial: 134 commits, 0 hallazgos. Sin cambios en la app ni en la base de datos |
| Auditoría exploratoria de la web de pruebas (solo informe) | Recorrido completo como usuario real, en móvil y escritorio, con cuentas «[AUDITORÍA]»: `docs/AUDITORIA-PRUEBAS-2026-11.md`. 2 hallazgos bloqueantes, 15 importantes, 27 menores, 10 dudas de producto y 7 posibles preguntas para el abogado. No se cambió código ni base de datos. Sin probar: `/admin` (no hay administradores en pruebas), la tarea diaria y los emails |
| Arreglos de la auditoría 1 · lo que queda fijado (inventario y fianza) | **B1**: solo se confirma el inventario que se ha visto (si la otra parte lo cambió, no se guarda la confirmación, se avisa y se marca lo nuevo; protegido también en la base de datos). **B2**: importes siempre exactos y con coma decimal en pantalla, PDF, devolución y avisos. **I5**: «Corregir» un elemento del inventario sin quitarlo. **I6**: «el casero no la ha confirmado» y el paquete de pruebas esperan 7 días desde que se registró la declaración de llaves. **Menores 20, 24 y 25**: nombre del contrato en el registro de firmas, confirmación previa en las acciones definitivas, cronología con fecha e importe de cada devolución y con lo que había antes de reabrir la liquidación |
| Fase 7a · SEO técnico y auditoría | Páginas de ciudad (`/habitaciones/lugo`, `/pisos/lugo`…), `sitemap.xml`, `robots.txt`, datos estructurados, tarjetas para compartir, indexación apagada con una variable, y `docs/REVISION-FASE-7.md` (Lighthouse, axe y 52 capturas en móvil) |

## SIGUIENTE (en este orden, decidido en la planificación)

Antes del piloto quedan tres bloques de arreglos de la auditoría (`docs/AUDITORIA-PRUEBAS-2026-11.md`; el bloque 1 ya está hecho):

1. **Arreglos de la auditoría 2 · que nadie se pierda ni vea «Algo se ha torcido»:** **I1** (avisos con contador, enlace y fecha, y acceso a «Contratos» en el menú), **I2** (resguardo de fianza grande), **I3** (sesión caducada al guardar el perfil), **I4** (búsqueda con una página que no existe), **I7** (foto de perfil con «Guardar perfil»), **I8** (el asistente deja de guardar sin avisar) e **I9** (horas del chat en UTC).
2. **Arreglos de la auditoría 3 · acceso, denuncias y lo que prometen los textos:** **I10** (el registro dice si un email tiene cuenta), **I11** (las condiciones prometen borrar una reseña propia), **I12** (recuperar y cambiar la contraseña), **I13** (denuncias con enlaces que no son de Hommie), **I15** («Curso universitario» propone 2028) e **I14** (notas internas en el contrato firmado: necesita antes al abogado, porque toca el texto de las plantillas).
3. **Arreglos de la auditoría 4 · menores y dudas:** los 24 menores que quedan (§5 del informe, todos menos el 20, el 24 y el 25) y las 10 dudas de producto (§6), que hay que decidir antes en la planificación.
4. **Piloto** en una ciudad (Galicia, que es donde hay contrato de habitación): montar producción con `docs/DEPLOY.md`, completar `docs/CHECKLIST-LANZAMIENTO.md`, objetivos y captación.

Después del piloto: contratos · fase 3 / **Fase B de pagos** con socio regulado, y app nativa (Expo / React Native) reutilizando la misma base de datos.

## Tareas manuales del usuario (no son de código)

| Qué | Para qué | Urgencia |
|---|---|---|
| **Pegar las 5 plantillas de `docs/EMAILS-DE-ACCESO.md`** (ya traducidas) en Supabase (primero «Convivo pruebas», luego producción) y poner «Hommie» como nombre del remitente | Que los emails de acceso estén en español y con la marca | Antes de abrir |
| Configurar Resend + dominio propio y pegar `resendkey` y `emailfrom` en Vercel | Que los emails lleguen a cualquier usuario | Alta |
| Después: reactivar «Confirm email» en Supabase → Authentication | Obligatorio antes de abrir | Alta |
| Variable `CRON_SECRET`, con ese nombre exacto, en Vercel | Avisos diarios de reseña. Vercel solo envía el secreto con ese nombre | Media |
| Comprobar en Supabase Site URL y Redirect URLs = dominio real + `/auth/callback` | Enlaces de los emails | Alta |
| Rellenar los `[POR COMPLETAR]` de `/privacidad` y `/terminos`: responsable, NIF, dirección y email de contacto y de reclamaciones | Textos legales | Antes de abrir |
| **hommie.es**: comprado; esperar a que el registrador lo entregue y entonces apuntarlo a Vercel y verificarlo en Resend | Marca y emails | Antes de abrir |
| Cuando haya dominio: variable `siteurl` = `https://<dominio>` y, **solo en producción**, `INDEXING_ENABLED=true` (pasos en `CLAUDE.md` → «SEO técnico e indexación») | Que Google indexe la web. En la web de pruebas **no** se enciende | El día del lanzamiento |
| Dar de alta el sitemap en Google Search Console | Que Google encuentre las páginas de ciudad | Tras encender la indexación |
| Nombrar admins (SQL en `CLAUDE.md`) | Moderación | Antes del piloto |
| Montar producción siguiendo `docs/DEPLOY.md` (Supabase Pro en la UE, Vercel Pro, Resend, Sentry en la UE). De Sentry ya está la alerta de error nuevo; cuando exista producción faltan el monitor de `/api/salud` y el del cron `review-windows` | Producción | Antes del piloto |
| **Pasada manual (A8):** probar con teclado y con lector de pantalla (VoiceOver o TalkBack) las 5 pantallas clave: inicio, búsqueda, ficha, perfil y chat (30-60 min) | Accesibilidad real: axe no lo detecta todo | Antes del piloto |

## Preguntas para el abogado (agrupadas)

**Inmobiliario / LAU**

1. ¿Son válidas las tres plantillas de contrato? ¿Qué cláusulas faltan o sobran?
2. Habitación en vivienda compartida: ¿Código Civil o LAU, según el caso?
3. ¿Basta con identificar a las partes por su nombre completo y su cuenta de Hommie, sin DNI ni domicilio? (Hoy cada contrato lleva una línea «DNI/NIE» en blanco para rellenar a mano: ver pregunta 19.)
4. **Solo Galicia:** ¿es correcta la guía de la fianza de Galicia (`src/lib/contracts/deposits.ts`: IGVS, depósito gratuito y sin intereses, copia del justificante en un mes)? Sin confirmar: el plazo de un mes para depositar y si la obligación alcanza a las habitaciones. Fuera de Galicia ya no damos datos por comunidad.
5. ¿Plazo de conservación de los contratos y los inventarios? Hoy se conservan sin límite.

**Digital y protección de datos**

6. ¿Sirve la firma electrónica simple (eIDAS) para estos contratos, o hace falta la avanzada?
7. Responsabilidad por las reseñas (LSSI/DSA, difamación) y si el canal DSA y la moderación actuales bastan.
8. «Solo chicas/chicos» frente a la Ley 15/2022: **ya se quitó el campo y el filtro** (producto, noviembre de 2026). ¿Es seguro dejar que cada anunciante lo escriba libremente en la descripción, o hay que filtrarlo también en el texto?
9. ¿Es suficiente la ponderación del interés legítimo para conservar las reseñas tras borrar la cuenta y para enlazar las cuentas que vuelven (huella del email durante 2 años)?
10. Plazos de la tabla `docs/legal/conservacion.md` y bloqueo del art. 32 LOPDGDD.
11. Revisión de `/privacidad`, `/terminos`, la EIPD ligera y la edad mínima de 18 años.

**Pagos (solo para la fase 3)**

12. ¿Qué licencia o socio hace falta para cobrar rentas o fianzas y ofrecer un seguro de impago?

**Nuevas (bloque «Correcciones legales»)**

13. (a) **Sentry como encargado del tratamiento en EE. UU.** (configuración y avisos de tareas programadas, sin datos de personas, con la organización en la UE): ¿bastan las cláusulas contractuales tipo y la mención añadida en `/privacidad`?
14. (b) ¿Puede un **socio regulado retener fondos** (reserva o primer mes) y qué licencia hace falta (entidad de pago, agente de una entidad…)?
15. (c) **Límite de cobrar a casero e inquilino** por intermediar o formalizar el contrato (art. 20 LAU).
16. (d) **Fianza legal frente a garantía adicional en Galicia**, y si la obligación de depositar alcanza a las habitaciones.
17. (e) Si la **negociación documentada dentro de la app** vale como MASC (LO 1/2025).
18. (f) El nombre **Hommie** frente a «homming» (marca): ¿riesgo de confusión?
19. (g) **Validez de un contrato con el DNI/NIE en blanco** para el trámite de la fianza: ¿basta que lo rellene cada parte a mano al presentar el trámite, sin que Hommie lo recoja?

**Nuevas (bloque «Fianza: seguimiento»)**

20. (h) **Entrega de llaves dada por confirmada a los 7 días** sin respuesta del casero: ¿vale como constancia y puede iniciar el plazo de un mes del art. 36.4 LAU con la fecha que declara el inquilino?
21. (i) El **paquete de pruebas** (contrato y huella, inventarios con fotos, fechas y cronología): ¿sirve como prueba ante una reclamación o un MASC (LO 1/2025)? ¿Qué más debería llevar?
22. (j) Textos del apartado «Fianza»: «si tu comunidad lo exige» para habitaciones y, en Galicia, solo remitir al IGVS sin afirmar plazo para depositar. ¿Son prudentes? (relacionada con la pregunta 16).
23. (k) **Conservación** de la cronología de la fianza y del resguardo (hoy indefinida, como el contrato firmado).

**Nuevas (bloque «Datos sensibles de terceros»)**

24. (l) **Russmedia (TJUE C-492/23):** ¿bastan el aviso de datos sensibles, el canal de denuncias, la ocultación cautelar y los cambios de `/terminos` y `/privacidad` (ver CLAUDE.md, «Datos sensibles de terceros») para no ser corresponsable de los datos de terceros que publican los usuarios? ¿Hace falta un control previo (no solo aviso) en reseñas, con riesgo de falsos positivos? ¿Es suficiente la cláusula «Tu contenido» (uso solo para prestar el servicio) o hace falta una licencia expresa mínima?

**Nuevas (auditoría de noviembre de 2026, detalle en `docs/AUDITORIA-PRUEBAS-2026-11.md` §7; posibles preguntas, sin respuesta)**

25. (m) Notas «[Revisar con el abogado…]» dentro del texto que se firma; fianza muy por encima de la legal llamada «fianza»; ocultación cautelar de una reseña sin avisar a su autor (art. 17 DSA); `/privacidad` y `/cuenta` no mencionan contratos, inventarios, resguardo ni liquidación ni que se conservan; nombre de la firma guardado tal como se teclea; fecha de llaves declarada con retraso y el texto «el casero no la ha confirmado»; `/terminos` habla de suspender cuentas de menores y aún no existe.

## Ideas aparcadas (no hacer sin decidirlo antes en la planificación)

- **Revisar las migraciones existentes con la skill de Supabase** (solo lectura: Claude Code las repasa con `supabase` y `supabase-postgres-best-practices` y entrega un informe de hallazgos, sin cambiar nada; lo que salga se decide después como bloque aparte).
- **Skills de Vercel** (`react-best-practices`, `next-best-practices`): aparcadas. Si algún día se instalan, con commit fijado y revisadas antes, y dejando fuera lo de Cache Components de Next 16 (el proyecto está en 15.5, decisión 1).
- **Herramientas evaluadas y descartadas (noviembre de 2026):** ECC (`affaan-m/ecc`), superpowers, squawk y awesome-claude-code. Duplican el proceso que ya hay o recargan el contexto de Claude Code sin aportar lo que no tenemos.

- **App nativa: requisitos de la App Store y estudiar un MCP de App Store Connect cuando se prepare.**
- **De la auditoría de noviembre de 2026** (`docs/AUDITORIA-PRUEBAS-2026-11.md`): los hallazgos pendientes ya están repartidos en los bloques 2, 3 y 4 de «SIGUIENTE». Queda aparcado repetir cuando se pueda: `/admin` con un administrador nombrado, y la tarea diaria (recordatorios de llaves y plazos) con `CRON_SECRET` bien puesto.
- **Del bloque «Arreglos de la auditoría 1»:** avisar en directo (sin esperar a pulsar «Confirmar») cuando la otra parte cambia el inventario que se tiene abierto; permitir corregir también la zona o el nombre de un elemento manteniendo el vínculo con la entrada; sustituir los diálogos del navegador de las acciones definitivas por un diálogo propio con la marca; e2e de las llaves «pendiente de confirmar» (hoy cubierto con pruebas de lógica, de componente y de base de datos).
- **Nombres técnicos que todavía dicen «convivo»** (no los ve el usuario; renombrarlos solo con un motivo y con cuidado): repositorio, `package.json`, variables de sesión de la BD (`convivo.contract_rpc`, `convivo.anonymizing`), usuarios de ejemplo `@convivo.test`, contraseña de desarrollo, dominio de prueba de los e2e. Y los textos de las migraciones ya aplicadas.
- Las plantillas de Supabase Auth hay que pegarlas a mano en el panel (pasos en `docs/EMAILS-DE-ACCESO.md`); el cambio de contraseña y el de email aún no tienen pantalla en la app.


- **De la revisión de la 7a, no incluidos en la 7b** (descripción en `docs/REVISION-FASE-7.md`): **D5** contrato e inventario con UUID largos (toca el texto firmado: pendiente del abogado), **D8** pasos del asistente con barra de progreso, **D10** índice en las páginas legales, **D11** estados vacíos con acción, **P3** JS heredado/sin usar (`browserslist`), **P4** rutas pesadas (publicar, chat, editar perfil), **P5** variabilidad del TBT en inicio, **P6** caché de ida y vuelta (bfcache), **A7** botones desactivados con ayuda.
- **Pruebas e2e posiblemente frágiles por el mismo motivo** que arregló el cierre de la CI (mensaje de éxito dentro de un elemento que `router.refresh()` retira): revisar `listing-flag-form.tsx` y otros formularios de `/admin` que hacen `router.refresh()` tras el éxito y cuyas pruebas esperen su mensaje. Nota de producto: el aviso de «Decisión registrada» se ve un instante antes de que la notificación salga de las pendientes.
- **Pendiente de verificar con Supabase real** (CI o web de pruebas): el CLS del perfil tras quitar su esqueleto, y repetir la medición de peso con fotos reales y en Vercel.
- Calidad de la versión optimizada de las tarjetas (de 75 a ~60): recomendación 3 de `docs/PESO-DE-LAS-FOTOS.md`, opcional.
- **Datos personales, mejoras posibles:** revisar con el uso real los falsos positivos y negativos (en teléfonos y direcciones); extender el respaldo de la base de datos a anuncios (hoy solo reseñas y respuestas); controlar también lo que se escribe en la nota de una denuncia o en el motivo de un contrato si hiciera falta; e2e de reseñas y biografía (hoy solo hay e2e del asistente de anuncios).
- Tarea de purga automática de los plazos de conservación.
- Suspender cuentas desde `/admin`.
- Verificación de teléfono (el campo existe; falta el flujo y la tabla privada).
- Firma avanzada con proveedor (Signaturit, DocuSign).
- **Seguimiento de la fianza, mejoras:** PDF real generado en servidor para el paquete de pruebas (hoy se imprime a PDF desde el navegador); corregir un error de tecleo del número de resguardo (hoy inmutable); aviso al casero para anotar el depósito si pasa mucho tiempo; **e2e del flujo de la fianza** (no se pudo ejecutar sin Docker en la sesión) y comprobar el cron con Supabase real.
- **Fianza: liquidación, mejoras:** **e2e del flujo completo** (llaves sin confirmar, liquidación y resumen) en escritorio y móvil, que no se pudo ejecutar sin Docker en la sesión (probar con la CI); editar una partida ya creada desde la pantalla (hoy se quita y se vuelve a añadir; la RPC ya lo admite); sección de la liquidación dentro del paquete de pruebas; aviso al casero para abrir la liquidación cuando el inventario de salida queda bloqueado; PDF real generado en servidor; revisión del abogado de todos los textos (preguntas 4 y siguientes).
- **Fase B de pagos** con un socio regulado (cobro de rentas o fianzas y seguro de impago). Antes, la pregunta 12 al abogado.
- **Fotos a escala:** si en Supabase el tráfico pasa de **150 GB/mes** o los ficheros de **60 GB** (revisión mensual), estudiar una CDN o almacenamiento propio para las fotos (p. ej. Cloudflare R2) y miniaturas generadas al subir. Hoy no hace falta: las fotos pasan por el optimizador de Vercel (`docs/PESO-DE-LAS-FOTOS.md`).
- **Prueba de carga** antes de abrir a varias ciudades: cuántas visitas y mensajes por minuto aguantan Vercel y Supabase con el plan contratado.
- Sentry: subir los *source maps* en el build (`withSentryConfig` con una clave de Sentry) para leer las trazas de errores del navegador, que hoy salen minificadas.
- Vigilar con monitores de disponibilidad también la portada, `/anuncios` y `/habitaciones/lugo` (Sentry de pago o UptimeRobot gratis): decisión del usuario.
- Corregir una prueba e2e de tiempo real que a veces falla en móvil justo tras arrancar.
- **Navegación por parámetros y `loading.tsx`:** en Next 15.5 un `loading.tsx` en una ruta cuya navegación es solo por `searchParams` bloquea el router. Si se quiere un esqueleto en `/anuncios`, probar un `<Suspense key={filtros}>` propio alrededor de los resultados y repetir la prueba de los chips ~20 veces con el build real.
- **CSP por http:** `upgrade-insecure-requests` convierte en https las redirecciones del propio sitio cuando se sirve por http (`next start` en local y en la CI): el precargado de `/publicar` → `/entrar` falla con `ERR_SSL_PROTOCOL_ERROR`. No afecta a producción (https) ni causaba lo de los chips; valorar emitirla solo cuando la petición sea https.
- Modo oscuro.
- Páginas de ciudad para más ciudades (Santiago, Valencia, Sevilla…): basta añadir el nombre a `SEO_CITIES`; decidir cuándo, según haya anuncios.
- Página de ciudad con texto propio (barrios, precios medios, guía de la zona) para posicionar mejor que la lista de anuncios.
- Indexar los anuncios «busco» y los perfiles (hoy no, por privacidad): decidir con el abogado.
- Índice de páginas por barrio (`/habitaciones/lugo/centro`) y filtros populares como páginas propias.
- Comprobar en Vercel (con dominio) las cifras de Lighthouse y la tarjeta de WhatsApp con un anuncio real con foto.
- Subir `axe` y Lighthouse a la GitHub Action de la CI (ya existe; falta añadirles un paso).
