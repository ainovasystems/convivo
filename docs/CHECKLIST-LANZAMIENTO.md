# Checklist de lanzamiento

> **La única lista de lo que falta antes de abrir al público.** No se abre con ninguna fila de «Antes de abrir» en ⏳.
> Estados: ✅ hecho · 🔄 en curso · ⏳ pendiente · ➖ no aplica todavía.
> Responsables: **Usuario** (tú), **Abogado**, **Claude Code** (programación), **Moderador** (quien haga de admin).
> Pasos detallados de montaje: `docs/DEPLOY.md`. Copias: `docs/COPIAS-DE-SEGURIDAD.md`. Plan de trabajo: `docs/HOJA-DE-RUTA.md`.
> Última actualización: 14 de noviembre de 2026 (Fase 8a).

## 1. Marca y dominio

| Tarea | Responsable | Estado | Cuándo |
|---|---|---|---|
| Buscar «Hommie» en **TMview** (tmdn.org/tmview) y en el **localizador de la OEPM**. Mirar sobre todo marcas parecidas como «**homming**» en las clases 35, 36 (inmobiliario), 42 (software) y 45. Si hay alguna parecida, consultarlo antes de seguir | Usuario (o Abogado de marcas) | ⏳ | Antes de comprar nada más |
| Comprar el dominio **hommie.es** (y, si se puede, hommie.com) | Usuario | ⏳ | Antes de abrir |
| Registrar la marca, si la búsqueda sale limpia | Usuario / Abogado | ⏳ | Antes de abrir (recomendado) |
| Renombrar Convivo → Hommie en la web: textos, emails, icono, manifiesto y metadatos | Claude Code | ⏳ | Bloque propio, con la marca confirmada |

## 2. Cuentas y configuración (ver `docs/DEPLOY.md`)

| Tarea | Responsable | Estado | Cuándo |
|---|---|---|---|
| Supabase de **producción** nuevo, en la UE, plan Pro, sin datos de ejemplo (DEPLOY §1.1-1.2) | Usuario | ⏳ | Antes de abrir |
| Auth: **Confirm email**, Site URL y Redirect URLs de hommie.es (DEPLOY §1.3) | Usuario | ⏳ | Antes de abrir |
| Traducir al español las **plantillas de email de Auth**: confirmación, enlace mágico y cambio de contraseña (DEPLOY §1.3) | Usuario (Claude Code puede redactarlas) | ⏳ | Antes de abrir |
| Vercel de producción: proyecto nuevo, rama `main` y **plan Pro** (el gratuito es para uso no comercial) (DEPLOY §2) | Usuario | ⏳ | Antes de abrir |
| Decidir el proceso de publicación: fusionar la rama de trabajo en `main` cuando la CI esté en verde | Usuario (en la planificación) | ⏳ | Antes de abrir |
| Variables de producción en Vercel, sin reutilizar las de pruebas (DEPLOY §2.2) | Usuario | ⏳ | Antes de abrir |
| `CRON_SECRET` (con ese nombre exacto) y `SIGNAL_SECRET` nuevos para producción | Usuario | ⏳ | Antes de abrir |
| Resend: dominio verificado (SPF, DKIM y DMARC), clave limitada al dominio y SMTP en Supabase (DEPLOY §3) | Usuario | ⏳ | Antes de abrir |
| Sentry en la UE: DSN en Vercel, límite de 150 al día, Spike Protection y no guardar IP (DEPLOY §4.1-4.2) | Usuario | ⏳ | Antes de abrir |
| Sentry: las 3 alertas por email (incidencia nueva, tarea diaria y disponibilidad de `/api/salud`) (DEPLOY §4.3) | Usuario | ⏳ | Antes de abrir |
| Decidir si se vigilan también la portada, `/anuncios` y `/habitaciones/lugo`: Sentry de pago (1 $ al mes cada una) o UptimeRobot gratis | Usuario | ⏳ | Antes de abrir |
| Nombrar admins (DEPLOY §1.5) | Usuario | ⏳ | Antes del piloto |
| Comprobar `/estado` en verde y hacer un registro de prueba con email real; borrar los datos de prueba | Usuario | ⏳ | Antes de abrir |
| `INDEXING_ENABLED=true` solo en producción, y alta del sitemap en Google Search Console (DEPLOY §5) | Usuario | ⏳ | El día del lanzamiento |
| CI en GitHub (lint, tipos, pruebas, build y e2e en cada cambio) | Claude Code | ✅ | Hecho en 8a |
| Sentry preparado en el código: apagado sin clave, sin datos personales, monitor de la tarea diaria y `/api/salud` | Claude Code | ✅ | Hecho en 8a |

## 3. Legal (preguntas detalladas: `docs/HOJA-DE-RUTA.md` → «Preguntas para el abogado»)

| Tarea | Responsable | Estado | Cuándo |
|---|---|---|---|
| Revisión de las **12 preguntas** de la hoja de ruta: plantillas de contrato, Código Civil o LAU, sin DNI, guía de la fianza, firma simple, reseñas y DSA, «solo chicas/chicos», interés legítimo, plazos de conservación, textos legales y pagos | Abogado | ⏳ | Antes de abrir |
| **Correcciones legales** ya decididas: quitar el campo y el filtro «solo chicas/chicos», plantilla de habitación solo para Galicia y guía de la fianza solo para Galicia y «resto de España» | Claude Code | ⏳ | Siguiente bloque |
| Rellenar los `[POR COMPLETAR]` de `/privacidad` y `/terminos`: responsable, NIF, dirección, email de contacto y de reclamaciones | Usuario | ⏳ | Antes de abrir |
| Añadir **Sentry** (y Resend, si no está) a la lista de encargados de la política de privacidad, mencionando que Sentry guarda en EE. UU. la configuración y los avisos de las tareas (sin datos de personas) | Claude Code + Abogado | ⏳ | Antes de abrir, si se usa Sentry |
| Aceptar o firmar los **contratos de encargado del tratamiento** (DPA) de Supabase, Vercel, Resend y Sentry, y guardar una copia | Usuario | ⏳ | Antes de abrir |
| Registro de actividades de tratamiento y EIPD ligera revisados (`docs/legal/`) | Abogado | ⏳ | Antes de abrir |
| Quitar el aviso «Borrador pendiente de revisión legal» solo cuando el abogado lo apruebe: textos legales, plantillas de contrato y guía de la fianza | Claude Code (tras el abogado) | ➖ | Después de la revisión |

## 4. Producto antes del piloto

| Tarea | Responsable | Estado | Cuándo |
|---|---|---|---|
| **Control previo de datos personales** en reseñas y anuncios (prioritario) | Claude Code | ⏳ | Antes del piloto |
| Fase 7b: búsqueda y ficha en móvil, rendimiento y accesibilidad (`docs/REVISION-FASE-7.md`) | Claude Code | ⏳ | Antes del piloto |
| Fotos más ligeras en las tarjetas y la galería del móvil (`docs/PESO-DE-LAS-FOTOS.md`, recomendaciones 1 y 2; entra en la 7b) | Claude Code | ⏳ | Antes del piloto |
| Seguimiento de la fianza | Claude Code | ⏳ | Antes del piloto |
| Plan del piloto en una ciudad: objetivos, captación de anuncios y moderación | Usuario (en la planificación) | ⏳ | Antes del piloto |
| Moderador con tiempo para mirar `/admin` a diario: objetivo de 72 h para las notificaciones DSA | Usuario | ⏳ | Antes del piloto |

## 5. Operación (cuando esté abierto)

| Tarea | Responsable | Frecuencia |
|---|---|---|
| Mirar `/admin`: denuncias, notificaciones DSA (72 h), anuncios marcados y cuentas reabiertas | Moderador | A diario |
| Supabase → **Usage**: alarma si el **tráfico > 150 GB/mes** o los **ficheros > 60 GB** (Pro incluye 250 GB y 100 GB). Si salta, ver «Fotos a escala» en la hoja de ruta | Usuario | Mensual |
| Vercel → **Usage** (tráfico y optimización de imágenes) y cuota de Sentry | Usuario | Mensual |
| **Copia propia** de la base de datos y las fotos, cifrada, conservando las 3 últimas (`docs/COPIAS-DE-SEGURIDAD.md` §2) | Responsable técnico | Mensual |
| **Prueba de restauración** en un proyecto temporal (§3.3) | Responsable técnico | Trimestral |
| Revisar la guía de la fianza (`src/lib/contracts/deposits.ts`) | Claude Code + Abogado | Anual |
| Revisar que la CI sigue en verde en GitHub (pestaña Actions) antes de publicar | Usuario | En cada publicación |
