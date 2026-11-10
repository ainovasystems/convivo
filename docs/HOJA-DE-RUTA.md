# Convivo · Hoja de ruta

> **Fuente única de «qué toca ahora».** Solo se trabaja en el bloque marcado como **SIGUIENTE**. Lo que surja por el camino va a «Ideas aparcadas», no se hace en ese momento.
> La actualiza Claude Code al cerrar cada bloque y se vuelve a subir al proyecto de Claude.
> Última actualización: **11 de noviembre de 2026**.

## Hecho

| Bloque | Qué incluye |
|---|---|
| Fases 0-5 | Arranque, modelo de datos y RLS, cuentas y perfiles, anuncios, interés, chat y estancias, reseñas y moderación |
| Diseño y despliegue de pruebas | Marrón y blanco, barra inferior en móvil, instalable, Vercel + Supabase, página `/estado` |
| Fase 6 · Seguridad y RGPD | Auditoría de RLS, CSP con nonce, límites de acceso, exportar y borrar la cuenta, textos legales en borrador, anti-discriminación, anti-fraude, registro de moderación |
| Ajustes legales | Canal DSA de denuncias, casilla 18+, edad exacta, «solo chicas/chicos», cuentas que vuelven, ponderación, EIPD y tabla de conservación |
| Contratos · fase 1 | Plantillas, edición, envío, firma de los dos, estancia confirmada, PDF |
| Contratos · fase 2 | Inventario de entrada y salida con fotos privadas y bloqueo, guía de la fianza por comunidad autónoma |

## SIGUIENTE (elegir uno con el usuario; recomendación en orden)

1. **Fase 7 · Diseño, SEO y rendimiento.** Hace falta antes del piloto.
   - Lighthouse ≥ 90 en móvil.
   - URLs públicas tipo `/habitaciones/lugo`, `sitemap.xml`, `robots.txt` y datos estructurados (JSON-LD).
   - Accesibilidad revisada con axe.
   - Revisión visual de todas las pantallas en móvil.
2. **Fase 8 · Lanzamiento y operación.**
   - `DEPLOY.md`.
   - Proyecto de Supabase de **producción** separado, sin datos de ejemplo.
   - GitHub Actions con las pruebas en cada cambio.
   - Errores con Sentry, copias de seguridad y checklist de lanzamiento.
   - Plan de piloto en una ciudad.
3. **Contratos · fase 3.** Pagos de la renta y seguro de impago con socios regulados. Antes hay que hablar con el abogado de servicios de pago.
4. **App nativa** (Expo / React Native), reutilizando la misma base de datos. Mejor después del piloto web.

## Tareas manuales del usuario (no son de código)

| Qué | Para qué | Urgencia |
|---|---|---|
| Configurar Resend + dominio propio y pegar `resendkey` y `emailfrom` en Vercel | Que los emails lleguen a cualquier usuario | Alta |
| Después: reactivar «Confirm email» en Supabase → Authentication | Obligatorio antes de abrir | Alta |
| Variable `CRON_SECRET`, con ese nombre exacto, en Vercel | Avisos diarios de reseña. Vercel solo envía el secreto con ese nombre | Media |
| Comprobar en Supabase Site URL y Redirect URLs = dominio real + `/auth/callback` | Enlaces de los emails | Alta |
| Rellenar los `[POR COMPLETAR]` de `/privacidad` y `/terminos`: responsable, NIF, dirección y email de contacto y de reclamaciones | Textos legales | Antes de abrir |
| Nombre definitivo y dominio | Marca y emails | Antes de abrir |
| Nombrar admins (SQL en `CLAUDE.md`) | Moderación | Antes del piloto |

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

- Detectar datos personales en reseñas y anuncios antes de publicar (caso Russmedia).
- Tarea de purga automática de los plazos de conservación.
- Suspender cuentas desde `/admin`.
- Verificación de teléfono (el campo existe; falta el flujo y la tabla privada).
- Firma avanzada con proveedor (Signaturit, DocuSign).
- Liquidación de la fianza dentro de Convivo: descuentos justificados con el inventario.
- Corregir una prueba e2e de tiempo real que a veces falla en móvil justo tras arrancar.
- Modo oscuro.
