# Prueba de ponderación del interés legítimo · BORRADOR

> Borrador para revisar con el abogado. Sigue la estructura habitual de tres pasos: finalidad legítima, necesidad y ponderación (art. 6.1.f RGPD; directrices 1/2024 del CEPD sobre interés legítimo). Cada tratamiento se valora por separado.

## 1. Huellas anti-abuso de IP y navegador (`user_signals`)

- **Finalidad:** detectar autorreseñas y cuentas duplicadas, que destruyen la fiabilidad de las reseñas, el valor central del servicio y lo que protege a los propios usuarios. Prevenir el fraude es un interés legítimo reconocido (considerando 47).
- **Necesidad:** no hay una alternativa menos intrusiva que funcione igual. Pedir DNI o teléfono es más intrusivo y está descartado por diseño. Solo se guarda un HMAC con secreto, no la IP; no se puede recuperar la IP, aunque sigue siendo un dato seudonimizado.
- **Ponderación:**
  - Expectativa razonable: en una plataforma de reseñas es esperable que se combata el fraude.
  - Impacto bajo: el dato no es público y solo lo ven los admins en forma de indicio.
  - Ninguna decisión automática: la decide una persona, así que no aplica el art. 22.
  - Garantías: minimización, secreto, acceso restringido y plazo (ver conservación).
- **Derechos:** se informa en la política de privacidad y existe derecho de oposición. Si alguien se opone, se valora caso a caso: hay motivos imperiosos mientras la cuenta publique reseñas.
- **Conclusión provisional:** favorable. [Validar]

## 2. Límite de intentos de acceso (`auth_attempts`)

- **Finalidad:** proteger las cuentas frente a ataques de fuerza bruta y frente a quien prueba muchas cuentas desde un mismo sitio.
- **Necesidad:** solo huellas HMAC de la IP y del email, que se borran a partir de las 24 h.
- **Ponderación:** el impacto es mínimo y el beneficio lo recibe el propio usuario.
- **Conclusión provisional:** favorable.

## 3. Marcas anti-fraude de anuncios (`listing_flags`)

- **Finalidad:** detectar estafas típicas del alquiler (pagos por adelantado, «estoy en el extranjero») y precios irreales.
- **Necesidad:** se usan reglas sencillas sobre el texto y el precio del anuncio; no se perfila a la persona.
- **Ponderación:**
  - La marca no despublica ni tiene efectos para el anunciante hasta que decide una persona, así que no aplica el art. 22.
  - Es interna y no pública.
  - Si se cierra el anuncio, se motiva la decisión (art. 17 DSA).
- **Conclusión provisional:** favorable.

## 4. Conservar reseñas tras borrar la cuenta

- **Finalidad:** mantener la reputación verificada de otras personas (caseros, inquilinos y compañeros) y la información que reciben los futuros inquilinos.
- **Necesidad:** se desvincula la reseña de la cuenta («Usuario eliminado») y se borra el resto de los datos.
- **Ponderación:**
  - Interés de terceros: su reputación legítima.
  - Libertad de información: es una excepción al derecho de supresión (art. 17.3.a).
  - Contra: quien convivió con el autor puede identificarlo por la estancia, así que es seudonimización y no anonimización.
- **Puntos abiertos:**
  - ¿Debe cortarse el enlace entre la reseña y la estancia?
  - ¿Hace falta un plazo máximo de conservación?
  - ¿Debe poder el autor pedir que se elimine su reseña al borrar la cuenta? Hoy puede eliminarla él mismo antes, indicando un motivo.
- **Conclusión provisional:** favorable con matices. [Decidir con el abogado]
