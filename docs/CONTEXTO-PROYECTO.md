# Convivo · Contexto del proyecto (para planificar)

> Documento para dar contexto a un chat de planificación. Estado a **6 de noviembre de 2026**.
> «Convivo» es un nombre provisional.

## 1. Qué es

Plataforma web en español (España) para **vivienda compartida**, como un «LinkedIn de la vivienda compartida».

- **Público:** sobre todo jóvenes y universitarios; también caseros e inmobiliarias pequeñas.
- **Tres tipos de anuncio:**
  - **Habitación** en un piso compartido.
  - **Piso entero** en alquiler.
  - **Busco piso o compañero.**
- **Perfiles** al estilo LinkedIn: bio, ciudad, ocupación, rango de edad, idiomas, hábitos de convivencia, verificaciones y reputación.
- **Foso competitivo: reseñas verificadas.** Solo se puede reseñar tras una **estancia confirmada por las dos partes**. Las reseñas van en las cuatro direcciones:
  - inquilino → inmueble
  - inquilino → casero
  - casero → inquilino
  - compañero ↔ compañero
- **Reglas de las reseñas**, impuestas por la base de datos y no solo por la app:
  - **Doble ciego:** una reseña no es pública hasta que la otra parte también reseña o pasan 14 días.
  - **Inmutables:** no se pueden editar. Solo se borran indicando un motivo, y queda constancia del borrado.

## 2. Estado actual en una frase

**El MVP funcional está hecho y publicado en una web de pruebas.** Falta la pasada de seguridad y RGPD, el pulido de diseño, SEO y rendimiento, y preparar el lanzamiento real.

- **Web de pruebas:** https://convivo-six.vercel.app (alojada en Vercel, con las funciones en París).
- **Base de datos:** Supabase, proyecto «Convivo pruebas», en Europa.
- **Código:** GitHub `ainovasystems/convivo`, rama `claude/new-session-734nfk`. Lleva unos 46 commits.
- **Datos de ejemplo:** 8 usuarios de prueba `@convivo.test` con la contraseña `convivo-dev-1234`. Hay anuncios en Lugo, A Coruña, Madrid y Barcelona.

## 3. Plan de trabajo (paquete de prompts 0-8)

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Arranque: stack, estructura, CLAUDE.md | ✅ Hecho |
| 1 | Modelo de datos, RLS y reglas de reseñas en BD, con tests | ✅ Hecho |
| 2 | Registro, login (contraseña o enlace mágico) y perfiles con avatar | ✅ Hecho |
| 3 | Anuncios: asistente de publicación, fotos, búsqueda con filtros, ficha, «mis anuncios» | ✅ Hecho |
| 4 | «Me interesa», chat en tiempo real, aceptar o rechazar, estancias con doble confirmación, emails | ✅ Hecho |
| 5 | Reseñas: formulario por relación, «mis reseñas», respuesta pública, denuncias, panel /admin, avisos de ventana | ✅ Hecho |
| — | Rediseño «marrón y blanco», estilo startup, barra de pestañas en móvil, instalable como app | ✅ Hecho |
| — | Despliegue de pruebas en Vercel + Supabase y página de diagnóstico `/estado` | ✅ Hecho |
| 6 | Seguridad y RGPD (detalle abajo) | 🔄 Empezando |
| 7 | Diseño, SEO y rendimiento: Lighthouse ≥ 90, URLs tipo /habitaciones/lugo, sitemap, JSON-LD, accesibilidad con axe, modo oscuro opcional | ⏳ Pendiente |
| 8 | Despliegue y operación: DEPLOY.md, staging, GitHub Actions, Sentry, backups, checklist y plan de piloto por ciudad | ⏳ Pendiente |

### Fase 6 en detalle (lo siguiente)

1. **Auditoría de RLS** con tests que intenten explotar fugas: direcciones, mensajes ajenos, reseñas sin publicar, escrituras cruzadas.
2. **Protección de la web:** cabeceras de seguridad (CSP, HSTS…) y límites de intentos en login y registro. Los mensajes y las denuncias ya tienen límite.
3. **Textos legales y datos personales:**
   - Política de privacidad y términos, como **borrador para revisar con un abogado**.
   - **Exportar mis datos** (JSON).
   - **Borrar mi cuenta**: anonimiza las reseñas publicadas, no las elimina.
   - Banner de cookies solo si se usan cookies no esenciales. Ahora mismo solo hay cookies de sesión.
4. **Anti-discriminación:** rechazar en los anuncios expresiones como «solo españoles» o «no extranjeros», con un aviso al usuario. Los hábitos ya son una lista cerrada, así que no se puede filtrar por origen, religión, etc.
5. **Anti-fraude:**
   - Marcar para revisión los anuncios con un precio muy por debajo de la zona o con textos tipo «Western Union» o «paga por adelantado».
   - Aviso fijo en el chat: «Nunca pagues antes de ver el piso».
6. **Registro de auditoría** de las acciones de moderación.

## 4. Qué puede hacer hoy un usuario

- Registrarse y entrar con contraseña o enlace mágico, y completar su perfil con foto.
- Buscar anuncios con filtros: tipo, provincia, ciudad, precio, fecha, amueblado, gastos incluidos, mascotas, fumadores y orden. La búsqueda funciona sin JavaScript y se puede compartir por URL.
- Publicar un anuncio con un asistente por pasos que guarda solo el borrador, con hasta 8 fotos. Las fotos se comprimen en el móvil y se les quitan los datos GPS.
- Gestionar sus anuncios: pausar, reactivar, cerrar, duplicar y borrar borradores.
- Pulsar «Me interesa» con un mensaje, lo que abre un chat en tiempo real. El anunciante acepta o rechaza, y **aceptar desbloquea la dirección exacta**. Hasta entonces solo se ve el barrio.
- Proponer una estancia, que confirma la otra parte. En las habitaciones se pueden añadir compañeros, que también confirman.
- Reseñar cuando se abre la ventana: a los 30 días de entrar o al terminar la estancia. Cada ventana dura 30 días y hay avisos por email y en la app.
- Responder públicamente una vez a una reseña recibida y denunciar reseñas. Si alguien denuncia datos personales, la reseña se oculta hasta que la revise un admin.
- **Admins** (`/admin`): resolver denuncias, borrar reseñas dejando constancia y ver indicios de autorreseña (IP o navegador compartidos, guardados solo como huellas cifradas, nunca en claro).

## 5. Tecnología (resumen no técnico)

- **Next.js + TypeScript:** la web.
- **Supabase:** base de datos, usuarios, fotos y tiempo real. La seguridad está en la propia base de datos: cada usuario solo puede leer y escribir lo suyo, aunque alguien intente saltarse la web.
- **Vercel:** publicación. Cada cambio subido a GitHub se publica solo.
- **Tests automáticos:** 133 de lógica y base de datos y 27 de recorrido completo en el navegador, en móvil y en escritorio. Todos pasan.
- **Emails:** preparados para enviarse con **Resend**, pero aún sin configurar.
- **Documentación técnica completa:** `CLAUDE.md`, en la raíz del repositorio. Incluye las 36 decisiones tomadas.

## 6. Decisiones de producto ya tomadas (las más relevantes)

- **Estancias retroactivas:** se puede registrar una convivencia pasada, siempre que la confirmen las dos partes. Así se resuelve el «arranque en frío»: se siembra reputación desde el primer día.
- **Sin mapa:** solo barrio o zona, para no revelar la ubicación exacta.
- **Dirección exacta oculta** hasta que el anunciante acepta tu interés.
- **Rango de edad** en vez de fecha de nacimiento, para minimizar datos.
- **Nunca se pide DNI**, ni nacionalidad, origen, religión o salud.
- **Los compañeros se añaden con el enlace a su perfil:** no hay buscador de usuarios, para que nadie pueda rastrear perfiles.
- **Límites anti-spam en la base de datos:** 60 mensajes y 15 «me interesa» por hora, y 10 denuncias al día.
- **Ocultación cautelar solo por datos personales.** El resto de denuncias no ocultan nada hasta que las revisa un admin.
- **Identidad visual:**
  - Colores: blanco, crema, marrón nogal (#7b4b2a) y acento miel (#f4b740).
  - Tipografía: Plus Jakarta Sans.
  - Formas: botones en píldora y tarjetas redondeadas.
  - Referencias: Glovo, Too Good To Go, BlaBlaCar.
- **Datos en Europa:** Vercel en París y Supabase en Europa.

## 7. Configuración pendiente (acciones manuales)

| Qué | Para qué | Urgencia |
|---|---|---|
| Supabase → Authentication → URL Configuration: Site URL y Redirect URLs con la dirección de Vercel | Que los enlaces de los emails no lleven a localhost | Alta (verificar si ya está) |
| Proveedor de email (Resend) + dominio propio | Que lleguen los correos a cualquier usuario. El SMTP de Supabase solo envía al equipo y muy pocos por hora | Alta antes de abrir |
| Variable `CRON_SECRET`, con ese nombre exacto, en Vercel | Que los avisos diarios de reseña se envíen solos | Media |
| Reactivar «Confirm email» en Supabase | Obligatorio antes de abrir al público | Antes de lanzar |
| Dominio propio | Imagen y emails | Antes de lanzar |
| Proyecto de Supabase de producción, separado del de pruebas y sin datos de ejemplo | Producción | Fase 8 |

## 8. Riesgos y temas abiertos

- **Legal: revisar con un abogado antes de abrir.** Los temas que exceden lo técnico son:
  - difamación en reseñas y responsabilidad de la plataforma (LSSI);
  - discriminación en anuncios;
  - tratamiento de datos (RGPD: responsable, base legal, encargados como Supabase, Vercel y Resend, plazos de conservación);
  - LAU y fianzas, si la plataforma llega a intermediar contratos o pagos.
- **Arranque en frío:** una plataforma de reseñas vale poco sin reseñas.
  - **Plan propuesto:** piloto en **una sola ciudad** pequeña y densa (por ejemplo Lugo o Santiago, por su población universitaria), con anuncios y usuarios reales antes de abrir al resto.
  - Reseñas retroactivas verificadas para sembrar reputación desde el principio.
- **Fraude** típico del sector: pagos por adelantado o el «estoy en el extranjero y te mando las llaves». Se aborda en la fase 6.
- **Verificación de teléfono:** prevista pero no hecha. El campo existe; falta el flujo.
- **Nombre definitivo** de la marca: «Convivo» es provisional.

## 9. Modelo de negocio (sin decidir)

Ideas sobre la mesa, a decidir **después** de validar el uso:

- anuncios destacados para propietarios;
- verificación premium;
- herramientas para agencias pequeñas.

## 10. Preguntas útiles para la planificación

1. ¿Qué ciudad será la del piloto y con qué objetivo (n.º de anuncios, usuarios y estancias confirmadas en X semanas)?
2. ¿Cómo se consiguen los primeros anuncios? Por ejemplo: universidades, residencias, caseros conocidos o grupos de Facebook y WhatsApp.
3. ¿Fecha objetivo para el piloto? Las fases 6, 7 y 8 y la revisión legal van antes.
4. ¿Presupuesto mensual? Hoy todo es gratis: Vercel Hobby y Supabase Free. En producción harían falta Supabase Pro (unos 25 $/mes), dominio y Resend.
5. ¿Quién hará de moderador (admin) al principio?
6. ¿Nombre definitivo y dominio?
