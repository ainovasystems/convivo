# Convivo · Hoja de ruta

> **Fuente única de «qué toca ahora».** Solo se trabaja en el bloque marcado como **SIGUIENTE**. Lo que surja por el camino va a «Ideas aparcadas», no se hace en ese momento.
> La actualiza Claude Code al cerrar cada bloque y se vuelve a subir al proyecto de Claude.
> Última actualización: **14 de noviembre de 2026** (cierre de la Fase 8a).
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
| Fase 7a · SEO técnico y auditoría | Páginas de ciudad (`/habitaciones/lugo`, `/pisos/lugo`…), `sitemap.xml`, `robots.txt`, datos estructurados, tarjetas para compartir, indexación apagada con una variable, y `docs/REVISION-FASE-7.md` (Lighthouse, axe y 52 capturas en móvil) |

## SIGUIENTE (en este orden, decidido en la planificación)

1. **Correcciones legales** (el siguiente bloque):
   - quitar el campo y el filtro «solo chicas/chicos» (`listings.cohabitation`, filtro `convivencia`, textos y pruebas). Decisión 41 revocada;
   - plantilla de contrato de habitación **solo para Galicia**;
   - guía de la fianza **solo para Galicia** y un texto general para el «resto de España».
2. **Fase 7b · Corregir lo que salió en la revisión** (`docs/REVISION-FASE-7.md`). El usuario decide qué entra; la propuesta es D1, D2, P1, P2, A1-A4 y la pasada manual con teclado y lector de pantalla. Incluir las **fotos más ligeras** de `docs/PESO-DE-LAS-FOTOS.md` (recomendaciones 1 y 2). Objetivo: Lighthouse ≥ 90 en las cinco pantallas y 0 fallos «graves» de axe.
3. **Seguimiento de la fianza** (alcance a definir en la planificación).
4. **Piloto** en una ciudad: montar producción con `docs/DEPLOY.md`, completar `docs/CHECKLIST-LANZAMIENTO.md`, objetivos y captación.

Después del piloto: contratos · fase 3 / **Fase B de pagos** con socio regulado, y app nativa (Expo / React Native) reutilizando la misma base de datos.

## Tareas manuales del usuario (no son de código)

| Qué | Para qué | Urgencia |
|---|---|---|
| Configurar Resend + dominio propio y pegar `resendkey` y `emailfrom` en Vercel | Que los emails lleguen a cualquier usuario | Alta |
| Después: reactivar «Confirm email» en Supabase → Authentication | Obligatorio antes de abrir | Alta |
| Variable `CRON_SECRET`, con ese nombre exacto, en Vercel | Avisos diarios de reseña. Vercel solo envía el secreto con ese nombre | Media |
| Comprobar en Supabase Site URL y Redirect URLs = dominio real + `/auth/callback` | Enlaces de los emails | Alta |
| Rellenar los `[POR COMPLETAR]` de `/privacidad` y `/terminos`: responsable, NIF, dirección y email de contacto y de reclamaciones | Textos legales | Antes de abrir |
| Nombre definitivo y dominio | Marca y emails | Antes de abrir |
| Cuando haya dominio: variable `siteurl` = `https://<dominio>` y, **solo en producción**, `INDEXING_ENABLED=true` (pasos en `CLAUDE.md` → «SEO técnico e indexación») | Que Google indexe la web. En la web de pruebas **no** se enciende | El día del lanzamiento |
| Dar de alta el sitemap en Google Search Console | Que Google encuentre las páginas de ciudad | Tras encender la indexación |
| Nombrar admins (SQL en `CLAUDE.md`) | Moderación | Antes del piloto |
| Comprobar «Hommie» en TMview / OEPM (ojo con «homming») antes de comprar o renombrar nada | Marca | Alta |
| Montar producción siguiendo `docs/DEPLOY.md` (Supabase Pro en la UE, Vercel Pro, Resend, Sentry en la UE con sus 3 alertas) | Producción | Antes del piloto |
| Traducir al español las plantillas de email de Supabase Auth | Emails de acceso | Antes de abrir |

## Preguntas para el abogado (agrupadas)

**Inmobiliario / LAU**

1. ¿Son válidas las tres plantillas de contrato? ¿Qué cláusulas faltan o sobran?
2. Habitación en vivienda compartida: ¿Código Civil o LAU, según el caso?
3. ¿Basta con identificar a las partes por su nombre completo y su cuenta de Convivo, sin DNI ni domicilio?
4. ¿Son correctos los datos de la guía de la fianza (`src/lib/contracts/deposits.ts`)? Sobre todo Andalucía (suprimido en 2026), Navarra (desde 2027) y Cataluña (habitaciones desde 2026).
5. ¿Plazo de conservación de los contratos y los inventarios? Hoy se conservan sin límite.

**Digital y protección de datos**

6. ¿Sirve la firma electrónica simple (eIDAS) para estos contratos, o hace falta la avanzada?
7. Responsabilidad por las reseñas (LSSI/DSA, difamación) y si el canal DSA y la moderación actuales bastan.
8. «Solo chicas/chicos» frente a la Ley 15/2022: ¿mantener, limitar o quitar?
9. ¿Es suficiente la ponderación del interés legítimo para conservar las reseñas tras borrar la cuenta y para enlazar las cuentas que vuelven (huella del email durante 2 años)?
10. Plazos de la tabla `docs/legal/conservacion.md` y bloqueo del art. 32 LOPDGDD.
11. Revisión de `/privacidad`, `/terminos`, la EIPD ligera y la edad mínima de 18 años.

**Pagos (solo para la fase 3)**

12. ¿Qué licencia o socio hace falta para cobrar rentas o fianzas y ofrecer un seguro de impago?

## Ideas aparcadas (no hacer sin decidirlo antes en la planificación)

- **Control previo de datos personales** en reseñas y anuncios antes de publicar (caso Russmedia). **Prioritario antes del piloto.**
- Tarea de purga automática de los plazos de conservación.
- Suspender cuentas desde `/admin`.
- Verificación de teléfono (el campo existe; falta el flujo y la tabla privada).
- Firma avanzada con proveedor (Signaturit, DocuSign).
- **Liquidación de salida de la fianza** dentro de Convivo: descuentos justificados con el inventario de entrada y salida.
- **Fase B de pagos** con un socio regulado (cobro de rentas o fianzas y seguro de impago). Antes, la pregunta 12 al abogado.
- **Fotos a escala:** si en Supabase el tráfico pasa de **150 GB/mes** o los ficheros de **60 GB** (revisión mensual), estudiar una CDN o almacenamiento propio para las fotos (p. ej. Cloudflare R2) y miniaturas generadas al subir. Hoy no hace falta: las fotos pasan por el optimizador de Vercel (`docs/PESO-DE-LAS-FOTOS.md`).
- **Prueba de carga** antes de abrir a varias ciudades: cuántas visitas y mensajes por minuto aguantan Vercel y Supabase con el plan contratado.
- Sentry: subir los *source maps* en el build (`withSentryConfig` con una clave de Sentry) para leer las trazas de errores del navegador, que hoy salen minificadas.
- Vigilar con monitores de disponibilidad también la portada, `/anuncios` y `/habitaciones/lugo` (Sentry de pago o UptimeRobot gratis): decisión del usuario.
- Corregir una prueba e2e de tiempo real que a veces falla en móvil justo tras arrancar.
- Modo oscuro.
- Páginas de ciudad para más ciudades (Santiago, Valencia, Sevilla…): basta añadir el nombre a `SEO_CITIES`; decidir cuándo, según haya anuncios.
- Página de ciudad con texto propio (barrios, precios medios, guía de la zona) para posicionar mejor que la lista de anuncios.
- Indexar los anuncios «busco» y los perfiles (hoy no, por privacidad): decidir con el abogado.
- Índice de páginas por barrio (`/habitaciones/lugo/centro`) y filtros populares como páginas propias.
- Comprobar en Vercel (con dominio) las cifras de Lighthouse y la tarjeta de WhatsApp con un anuncio real con foto.
- Subir `axe` y Lighthouse a la GitHub Action de la CI (ya existe; falta añadirles un paso).
