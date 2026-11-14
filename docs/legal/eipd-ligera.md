# Evaluación de impacto ligera (EIPD) · BORRADOR

> Borrador técnico para revisar con el abogado antes de abrir al público. La lista de la AEPD (art. 35.4 RGPD) pide una EIPD normalmente cuando se cumplen dos o más criterios. Convivo roza dos: la evaluación de personas (reputación) y el uso de identificadores únicos (huellas de IP y navegador). Es zona gris, así que se hace una versión ligera.

## 1. Descripción del tratamiento

- **Qué es:** una plataforma de anuncios de vivienda compartida, con perfiles públicos y reseñas verificadas tras una estancia confirmada por las dos partes.
- **Interesados:** inquilinos, sobre todo jóvenes y universitarios mayores de 18 años; caseros; compañeros de piso; y personas sin cuenta que envían notificaciones.
- **Datos:**
  - Cuenta, perfil (sin DNI, nacionalidad ni datos de salud) y año de nacimiento (se muestra la edad).
  - Anuncios y dirección exacta, que se revela solo al interesado aceptado.
  - Mensajes, estancias y reseñas.
  - Huellas HMAC de IP y navegador, y notificaciones de contenido.
- **Encargados:** Supabase (base de datos y archivos, en la UE), Vercel (web, funciones en París) y Resend (email).
  - Los tres son empresas de EE. UU. Sus transferencias se amparan en el Data Privacy Framework, con cláusulas contractuales tipo como plan B.

## 2. Necesidad y proporcionalidad

- **Minimización:**
  - año de nacimiento en lugar de la fecha completa, y se muestra solo la edad;
  - hábitos con claves cerradas, sin criterios discriminatorios;
  - dirección oculta hasta que se acepta el interés;
  - fotos sin datos GPS;
  - huellas con secreto.
- **Bases legales:** contrato (servicio), interés legítimo (seguridad, fraude y reputación; ver la prueba de ponderación) y obligación legal (DSA).
- **Derechos:**
  - acceso y portabilidad con «Descargar mis datos»;
  - supresión con «Borrar mi cuenta» (las reseñas se conservan desvinculadas);
  - rectificación editando el perfil;
  - oposición por email.

## 3. Riesgos y medidas

| Riesgo | Probabilidad e impacto | Medidas existentes | Riesgo residual |
|---|---|---|---|
| Reseña difamatoria o con datos personales de un tercero | Media / alto | Solo tras estancia confirmada, doble ciego, denuncia interna, ocultación cautelar por datos personales, canal DSA abierto a quien no tiene cuenta, decisión humana motivada y registrada | Medio. Valorar la detección previa de datos personales (doctrina Russmedia) |
| Discriminación en anuncios | Media / alto | Validación de exclusiones por origen, religión, etc.; hábitos con claves cerradas. El campo cerrado de preferencia de sexo («solo chicas/chicos») se quitó por la Ley 15/2022; lo que cada anunciante escriba en su descripción sigue siendo libre | Medio-bajo: pendiente de criterio legal sobre el texto libre |
| Estafas a inquilinos | Media / alto | Marcas anti-fraude con revisión humana, aviso fijo en el chat, dirección oculta | Medio |
| Revelar la dirección exacta | Baja / alto | RLS: solo el dueño y los interesados aceptados | Bajo |
| Acceso indebido a datos de otros usuarios | Baja / alto | RLS en todas las tablas con tests de atacante, CSP con nonce, límites de intentos de acceso | Bajo |
| Reidentificar al autor de una reseña tras borrar la cuenta | Media / medio | Se desvincula el perfil y se borran sus datos; el usuario recibe la información antes de borrar | Medio. Decidir si se corta el enlace con la estancia |
| Uso por menores | Baja / medio | Declaración de mayoría de edad al registrarse, año de nacimiento con mínimo de 18 años (trigger), suspensión si nos avisan | Bajo |
| Transferencias a EE. UU. | — | DPF con cláusulas contractuales tipo como plan B; región UE donde se puede | Seguir el recurso ante el TJUE |
| Brecha de seguridad | Baja / alto | Proveedores con certificaciones, secretos fuera del código, service_role solo en el servidor | Falta un procedimiento de notificación de brechas en 72 h (art. 33) |

## 4. Pendiente antes de abrir

1. Firmar o aceptar los DPA de Supabase, Vercel y Resend, y revisar sus subencargados.
2. Procedimiento de brechas (art. 33-34): quién decide, cómo se notifica a la AEPD en 72 h y la plantilla de aviso a los afectados.
3. Registro de actividades de tratamiento (art. 30), si no aplica la exención.
4. Decidir y aplicar los plazos de conservación (`conservacion.md`).
5. Revisar esta EIPD al crecer o al añadir tratamientos nuevos: pagos, verificación de identidad o analítica.
