# Auditoría exploratoria de la web de pruebas · noviembre de 2026

> **Solo informe.** No se ha cambiado código ni se han aplicado migraciones.
> Web auditada: https://convivo-six.vercel.app (base de datos «Convivo pruebas», con las migraciones al día).
> Fecha: 17 de noviembre de 2026. Navegador: Chromium (Playwright), en **escritorio** (1280 px) y **móvil** (375 px, táctil).
> Cada hallazgo se comprobó en la web real. Donde se indica, se miró además la base de datos **solo en lectura** para confirmar lo que la pantalla decía.

> **Bloque «Arreglos de la auditoría 3» (19 de noviembre de 2026):** arreglados **I10, I11 e I13**. De los importantes solo queda **I14** (notas internas en el contrato: espera al abogado), más los menores y dudas (bloque 4).
>
> **Bloque «Recuperar contraseña» (19 de noviembre de 2026):** arreglado **I12**. Quedan I10, I11, I13 e I14 (bloque 3) y los menores y dudas (bloque 4).
>
> **Bloque «Arreglos de la auditoría 2» (18 de noviembre de 2026):** arreglados **I1, I2, I3, I4, I7, I8, I9 e I15**, repetidos a mano en la web de pruebas. Quedan I10 a I14 (bloque 3) y los menores y dudas (bloque 4).
>
> **Estado a 17 de noviembre de 2026 (bloque «Arreglos de la auditoría 1»):** arreglados **B1, B2, I5, I6** y los menores **20, 24 y 25**. Cada uno lleva su nota «✅ Arreglado» más abajo. El resto sigue pendiente, repartido en los bloques 2, 3 y 4 de `docs/HOJA-DE-RUTA.md`. B1, B2 e I6 se repitieron a mano en la web de pruebas el 18 de noviembre con las cuentas de auditoría (contrato del piso de Madrid) y ya no ocurren.

## 1. Resumen

| Gravedad | N.º | Qué significa aquí |
|---|---|---|
| **Bloqueante** | 2 | Estropea la promesa central (dejar constancia fiable) y queda fijado para siempre en un registro inmutable |
| **Importante** | 15 | Un usuario real se atasca, pierde lo escrito, ve un error o recibe un mensaje que no es verdad |
| **Menor** | 27 | Molestias, textos y detalles |
| Dudas de producto | 10 | No son fallos: hay que decidir |
| Posibles preguntas para el abogado | 7 | Sin respuesta definitiva |

**Lo que funciona bien** (probado de principio a fin): registro y acceso, perfil, búsqueda con filtros y chips, publicar los tres tipos, pausar, reactivar, duplicar y cerrar, «Me interesa», chat en tiempo real, aceptar y rechazar, estancia desde el chat con compañero, contrato de habitación y de vivienda con firma de los dos y PDF, aviso fuera de Galicia, inventarios con fotos y bloqueo, todo el circuito de la fianza (depósito, llaves sin confirmar y confirmadas, plazo, devolución, paquete de pruebas, liquidación con respuestas, reapertura y cierre), reseñas con doble ciego, respuesta pública, ocultación cautelar, control de datos personales, exportar datos y borrar la cuenta. **Ningún usuario pudo abrir contratos, chats, inventarios ni fianzas ajenos** (siempre 404). No hay desbordes horizontales en móvil en ninguna pantalla recorrida.

## 2. Cómo repetir las pruebas

Cuentas creadas para la auditoría (la contraseña no se guarda en el repositorio; pídesela a Claude Code o cámbiala desde el panel de Supabase):

| Papel | Email | Dispositivo |
|---|---|---|
| Casera, «[AUDITORÍA] Carmen Casera» | `auditoria.casero.1794918004813@convivo.test` | escritorio |
| Inquilino, «[AUDITORÍA] Iván Inquilino» | `auditoria.inqui.1794918004813@convivo.test` | móvil |
| Tercero, «[AUDITORÍA] Teo Tercero» | `auditoria.tercero.1794918004813@convivo.test` | escritorio |

Los usuarios de ejemplo (`ana@`, `brais@`, `diego@convivo.test`…) se usaron **solo para mirar** sus pantallas; no se tocó ningún dato suyo.

Direcciones que se citan en los pasos:

- Habitación de Lugo: `/anuncios/6622d72a-4bf7-4d94-9c7f-959ac8556e96`
- Contrato de habitación (firmado, con todo el circuito de fianza): `/contratos/439ff6d6-3b5f-4fb4-a3d4-10f675b321a4`
- Contrato de vivienda (firmado): `/contratos/3f9292f1-fef0-467c-98f9-5c0185a44e33`
- Conversación casera–inquilino: `/mensajes/35077d77-5b8b-4caa-9817-357b6f3b0804`

## 3. Hallazgos bloqueantes

### B1 · Se puede confirmar un inventario con elementos que no se han visto

> ✅ **Arreglado.** Cada cambio del inventario sube su «revisión» y, para confirmar, hay que enviar la que se tenía delante: si no coincide, la base de datos no guarda la confirmación. La pantalla avisa («El inventario ha cambiado: tu confirmación no se ha guardado»), trae la versión actual y marca lo nuevo, lo corregido y lo quitado. Vale para entrada y salida, en móvil y escritorio.

- **Pantalla:** `/contratos/[id]/inventario/entrada` o `/salida`. Móvil y escritorio.
- **Pasos:** (1) El inquilino abre el inventario y lo deja abierto. (2) La casera, en su sesión, añade un elemento nuevo (en la prueba: «Cocina · Nevera · Dañado o roto»). (3) El inquilino, **sin recargar**, pulsa «Confirmo que el inventario es correcto».
- **Esperaba:** que no le dejara confirmar, o que le avisara de que el inventario ha cambiado y se lo enseñara antes.
- **Pasó:** la confirmación se guardó sobre el inventario nuevo. La nevera dañada no estaba en su pantalla cuando pulsó. Después confirmó la casera y el inventario quedó **bloqueado para siempre** con un daño que el inquilino no había visto; de ahí salió una partida de 800 € en la liquidación.
- **Por qué es bloqueante:** la app dice «si alguien cambia algo, las confirmaciones se anulan», pero no protege contra una pantalla desactualizada, y el inventario bloqueado es la prueba para la fianza.

### B2 · Los importes con céntimos se enseñan redondeados en la liquidación y en su resumen

> ✅ **Arreglado.** Un solo formato en toda la fianza (pantalla, resumen en PDF, paquete de pruebas, devolución, cronología y avisos): coma decimal, con céntimos cuando los hay («12,50 €», «962,50 €») y sin ellos en euros justos («900 €»). Los registros ya cerrados no se han tocado: ahora se ven con su cifra exacta.

- **Pantalla:** `/contratos/[id]/fianza/liquidacion`, su `/resumen` (PDF) y el paso «4. Devolución». Móvil y escritorio.
- **Pasos:** (1) La casera añade una partida con importe `12,50`. (2) Envía la liquidación. (3) Marca la fianza como devuelta con importe `100,50`.
- **Esperaba:** ver 12,50 € y 100,50 €, o un aviso de que no se admiten céntimos.
- **Pasó:** la pantalla y el resumen muestran **13 €**, total **963 €** y «importe indicado: **101 €**». En cambio, los avisos del inquilino dicen «3 partidas por un total de **962.50 €**» e «importe indicado: **100.50 €**» (y con punto en vez de coma). Es decir, se guarda la cifra exacta pero el documento de constancia enseña otra.
- **Por qué es bloqueante:** el resumen «sirve como constancia» y queda cerrado con cifras que no son las anotadas.

## 4. Hallazgos importantes

### I1 · Los avisos de la app solo están en «Reseñas», sin contador, sin enlace y sin fecha

> ✅ **Arreglado (bloque 2).** Hay una pantalla **Avisos** con contador en la cabecera y en la barra inferior (la pestaña «Reseñas» pasó a ser «Avisos»), con fecha, enlace a la pantalla de cada aviso y accesos a Contratos, Reseñas, Estancias y Mis anuncios. Cada aviso deja de pedir acción cuando se hace lo que pedía, y los repetidos se sustituyen. Los avisos anteriores quedaron archivados.

- **Pantalla:** `/mis-resenas`. Móvil y escritorio.
- **Pasos:** la casera envía un contrato; el inquilino entra en la web.
- **Esperaba:** un aviso visible («tienes un contrato para firmar») que le lleve al contrato.
- **Pasó:** nada en la cabecera ni en la barra inferior (solo los mensajes tienen contador). El aviso está en la pestaña «Reseñas», no se puede pulsar, no lleva fecha, y los ya atendidos siguen diciendo «Confirma si la has recibido». Al final del circuito había 14 avisos seguidos, tres de ellos idénticos. Además, **no hay enlace a «Contratos» en el menú**: solo se llega desde «Mis estancias», la conversación o «Mi cuenta».
- **Nota:** hoy, sin emails configurados, es la única forma de enterarse.

### I2 · Subir un resguardo de fianza grande da la pantalla de error

> ✅ **Arreglado (bloque 2).** La foto del resguardo se reduce en el navegador antes de subirla (como las de los anuncios). Un PDF de más de 2,5 MB o un fichero de otro tipo se dicen en la pantalla, sin perder lo escrito.

- **Pantalla:** `/contratos/[id]`, paso «1. Depósito de la fianza». Escritorio (igual en móvil).
- **Pasos:** rellenar fecha y número, adjuntar una foto de 7,7 MB y pulsar «Anotar el depósito».
- **Esperaba:** «El archivo no puede pasar de 2,5 MB».
- **Pasó:** «Algo se ha torcido» y se pierde lo escrito. Una foto normal de móvil suele pasar de 2,5 MB, y aquí no se comprime como las fotos de los anuncios.

### I3 · Con la sesión caducada, guardar el perfil da la pantalla de error

> ✅ **Arreglado (bloque 2).** Con la sesión caducada sale «Tu sesión ha caducado. Vuelve a entrar», con un enlace para entrar en otra pestaña, y lo escrito sigue en la pantalla.

- **Pantalla:** `/perfil/editar`. Escritorio.
- **Pasos:** escribir en «Sobre ti», dejar que caduque la sesión (o borrar las cookies) y pulsar «Guardar perfil».
- **Esperaba:** «Tu sesión ha caducado. Vuelve a entrar», como hace el chat (que además conserva el texto).
- **Pasó:** «Algo se ha torcido» y se pierde lo escrito.

### I4 · La búsqueda da error 500 si la página no existe

> ✅ **Arreglado (bloque 2).** Una página que no existe enseña la última que sí, con el aviso «No hay página 99: no hay más anuncios».

- **Pantalla:** `/anuncios?pagina=99` (también `?pagina=2` cuando solo hay una página). Sin sesión, móvil y escritorio.
- **Esperaba:** la última página o «no hay más anuncios».
- **Pasó:** «Algo se ha torcido». Le puede pasar a quien guarde o comparta un enlace de la página 2 y luego haya menos anuncios.

### I5 · En el inventario no se puede corregir un elemento

> ✅ **Arreglado.** Cada elemento tiene «Corregir» (estado, notas y fotos). La zona y el nombre no cambian, así que se conserva la comparación con la entrada. Al guardar se anulan las confirmaciones.

- **Pantalla:** inventario de salida, tras «Copiar los elementos del inventario de entrada».
- **Esperaba:** cambiar el estado y añadir fotos a cada elemento, como dice el propio mensaje («Revisa el estado de cada uno y añade fotos»).
- **Pasó:** solo existe «Quitar». Para cambiar «Buen estado» por «Dañado» hay que quitarlo y volver a escribirlo **con la misma zona y el mismo nombre**; si se teclea distinto, se pierde la comparación con la entrada.

### I6 · Declarar hoy una entrega de llaves antigua dice al instante que el casero no la ha confirmado

> ✅ **Arreglado.** Hasta 7 días después de **registrar** la declaración, las dos partes la ven como «Pendiente de confirmar» y no hay paquete de pruebas ni aviso de «no la ha confirmado». Pasados esos 7 días (y el mes desde la fecha declarada) vuelve lo de antes. Corregir la fecha reinicia el margen. Hommie sigue sin dar nunca la fecha por confirmada.

- **Pantalla:** `/contratos/[id]`, paso «2. Entrega de llaves». Inquilino, móvil.
- **Pasos:** declarar una fecha de hace más de un mes (en la prueba, 5 de octubre).
- **Pasó:** en el mismo segundo aparece «Ha pasado un mes desde la fecha declarada y el casero no la ha confirmado» y se puede descargar el paquete de pruebas, que lo dice de forma expresa. El casero no ha tenido ni un minuto para verla. (Ver también dudas de producto y preguntas legales.)

### I7 · La foto de perfil no se guarda con «Guardar perfil»

> ✅ **Arreglado (bloque 2).** «Guardar perfil» guarda también la foto elegida. Con una foto no válida no se guarda nada y se explica por qué.

- **Pantalla:** `/perfil/editar` (también en la bienvenida tras registrarse). Escritorio y móvil.
- **Pasos:** elegir una foto (aparece la vista previa), bajar y pulsar «Guardar perfil».
- **Esperaba:** que se guardara todo.
- **Pasó:** «Perfil guardado.», pero la foto no se guarda: tiene su propio botón «Guardar foto» justo debajo de la foto. Con un fichero no válido salen a la vez «Formato no admitido» y «Perfil guardado.».

### I8 · El asistente deja de guardar sin avisar si hay un número fuera de rango

> ✅ **Arreglado (bloque 2).** Un número fuera de rango ya no impide guardar lo demás: se guarda el resto y se dice «Guardado, salvo el campo marcado».

- **Pantalla:** `/publicar/[id]?paso=datos`. Escritorio.
- **Pasos:** rellenar título y descripción, poner un precio de `-50` (o una fianza enorme) y recargar.
- **Esperaba:** conservar lo demás, o un aviso de «sin guardar».
- **Pasó:** arriba sigue «Los cambios se guardan solos», pero no se guarda **nada** mientras haya un número inválido; al recargar, el borrador está vacío.

### I9 · Las horas del chat salen primero en hora UTC

> ✅ **Arreglado (bloque 2).** El chat pinta la hora de España desde el servidor: ya no salta ni da el error de React.

- **Pantalla:** `/mensajes/[id]`. Móvil y escritorio.
- **Pasó:** el servidor envía «12:32» y, al terminar de cargar, cambia a «13:32». En cada conversación salta un error interno de React (n.º 418). Solo pasa en el chat: las horas de firmas, inventarios y fianza salen bien.

### I10 · El registro dice si un email ya tiene cuenta

> ✅ **Arreglado (bloque 3, 19 de noviembre de 2026).** El registro responde siempre lo mismo, tenga o no cuenta ese email: «Te hemos enviado un email para continuar. Abre el enlace para confirmar tu cuenta.», y debajo «¿Ya tenías cuenta con ese email? Entonces no te llegará nada: entra desde aquí o pulsa ¿Olvidaste tu contraseña?». Comprobado contra «Convivo pruebas» con «Confirm email» activado: Supabase ya no devuelve ningún error para un email con cuenta (y no le envía nada), así que no hay diferencia que mostrar. Sigue el límite de 3 registros por email y hora.

- **Pantalla:** `/registro`.
- **Pasos:** registrarse con `ana@convivo.test`.
- **Pasó:** «Ya existe una cuenta con ese email. Prueba a entrar.» El acceso y el enlace mágico sí dan mensajes genéricos. Puede cambiar al activar «Confirm email» en Supabase: volver a comprobarlo entonces.

### I11 · Las condiciones prometen borrar una reseña propia, y no hay dónde

> ✅ **Arreglado (bloque 3, 19 de noviembre de 2026).** En «Reseñas que he escrito» y en la propia reseña (para quien la escribió) hay «Solicitar retirada», con motivo obligatorio. La reseña **no** se borra al pedirlo: la solicitud llega a `/admin` junto al resto de denuncias, un admin la rechaza o retira la reseña, y quien la escribió recibe la decisión con aviso en la app y por email. `/terminos` §4 dice ahora «puedes solicitar la retirada de una reseña tuya indicando el motivo». La base de datos ya no deja que el autor borre su reseña por su cuenta.

- **Pantalla:** `/terminos` §4 («Puedes eliminar una reseña tuya indicando el motivo») frente a `/mis-resenas`.
- **Pasó:** no hay botón para hacerlo en «Reseñas que he escrito» ni en la propia reseña.

### I12 · No hay forma de recuperar ni cambiar la contraseña

> ✅ **Arreglado (bloque «Recuperar contraseña», 19 de noviembre de 2026).** En `/entrar`, junto a la contraseña, «¿Olvidaste tu contraseña?» lleva a `/recuperar`: se escribe el email, la respuesta es siempre la misma exista o no la cuenta, llega un email en español y su enlace abre `/recuperar/nueva`, donde se elige la contraseña (dos veces, mismas reglas que el registro) y se entra directamente. Un enlace caducado o ya usado lleva a «Pide otro enlace». Sirve también a quien solo entraba con enlace por email. **No** hay cambio de contraseña ni de email dentro de `/cuenta` (decisión 81). Probado en local de principio a fin con el buzón Mailpit; en la web de pruebas falta que el usuario pegue la plantilla nueva del email en Supabase.

- **Pantalla:** `/entrar`. Solo existe «Con enlace por email». Ya estaba anotado en ideas aparcadas; se sube aquí porque, antes del piloto, quien olvide la contraseña no tiene salida clara.

### I13 · El formulario de denuncia acepta enlaces que no son de Hommie

> ✅ **Arreglado (bloque 3, 19 de noviembre de 2026).** `/denunciar` solo admite enlaces de `hommie.es`, `www.hommie.es` y del dominio de la propia web (la de pruebas). Con otro enlace: «Ese enlace no es de Hommie…»; con un texto que no es un enlace: «Eso no es un enlace…». Se avisa al salir del campo y el servidor lo vuelve a comprobar: no se registra nada ni se da referencia.

- **Pantalla:** `/denunciar`, sin cuenta.
- **Pasos:** poner `https://www.google.com/` como enlace y rellenar el resto.
- **Pasó:** «Recibida. Tu referencia es E6D1D0B7». Queda como una notificación más que alguien tendrá que revisar en 72 h.

### I14 · El contrato que se firma lleva notas internas

- **Pantalla:** texto de cualquier contrato y su PDF.
- **Pasó:** dentro del texto firmado aparecen «[Revisar con el abogado si deben constar documento de identidad y domicilio de las partes]» y «[Revisar con el abogado si, según el caso, resulta aplicable la Ley de Arrendamientos Urbanos]». Es coherente con «borrador», pero un usuario del piloto firmaría eso tal cual.

### I15 · «Curso universitario» propone como fin el 30 de junio de 2028

> ✅ **Arreglado (bloque 2).** «Curso universitario» propone el 30 de junio del curso en marcha según la fecha de entrada (entrando en diciembre de 2026, junio de 2027).

- **Pantalla:** asistente, «Periodo de alquiler». Probado el 17 de noviembre de 2026 con entrada el 1 de diciembre de 2026.
- **Esperaba:** 30 de junio de 2027 (el curso en marcha).
- **Pasó:** propone 30/06/2028, es decir, 19 meses. Quien publique entre septiembre y diciembre para el curso actual lo tendrá mal sin darse cuenta.

## 5. Hallazgos menores

**Registro, acceso y perfil**

1. Tras un error en el registro se desmarcan las dos casillas (18 años y condiciones).
2. Las iniciales del avatar toman símbolos: un nombre que empieza por «[» sale como «[C».
3. Hábitos del perfil con mayúsculas y género mezclados: «casi nunca», «relajada», «ordenado/a».
4. El perfil de una cuenta borrada sin reseñas sigue abierto como «Usuario eliminado», vacío.

**Buscar**

5. Precio mínimo mayor que el máximo: chip «500–100 €» y 0 resultados, sin pista.
6. Ciudad «lugo» más provincia: salen dos chips, «lugo» y «Lugo».
7. En la portada, Valencia y Sevilla llevan a una búsqueda con 0 anuncios.

**Publicar y mis anuncios**

8. Doble clic al elegir el tipo en `/publicar` crea dos borradores.
9. Los avisos salen por capas: con datos personales no se ve el de discriminación hasta quitarlos.
10. El aviso de discriminación cita «solo espanoles», sin ñ.
11. «Disponible desde» admite fechas pasadas (se publicó con 1 de enero de 2020).
12. Fecha de fin anterior a la de entrada: solo se avisa en «Revisión» y sin decir qué campo («Debe ser posterior a la fecha de entrada»).
13. La revisión enseña «Periodo: Sin fecha de fin» sin haberlo elegido, y «Fotos: Gestionadas en el paso Fotos»; no enseña descripción ni fianza.
14. Fotos: un fichero que no es imagen dice «Inténtalo de nuevo» (no servirá); «1 foto(s) añadida(s)»; al pasar de 8 (o de 6 en el inventario) descarta las sobrantes sin decirlo.
15. Al editar un anuncio publicado, «Guardar cambios» solo está en el paso 4, y después de guardar sigue diciendo «Guarda para aplicar los cambios».
16. En la ficha, vista por el dueño: «27001(solo la ves tú…», falta un espacio.

**Chat y estancias**

17. El aviso del chat dice «Si te pasa, denúncialo», pero en el chat no hay botón para denunciar ni bloquear.
18. Las estancias con fecha de fin ya pasada siguen como «Activa» hasta pulsar «Terminar estancia».

**Contratos, inventario y fianza**

19. Fianza de 99999 en el borrador: «Fianza: escribe un número» (el problema es el máximo).
20. ✅ **Arreglado.** ~~El registro de firmas guarda el nombre tal como se tecleó («iván INQUILINO prueba»), no como figura en el contrato.~~ Ahora guarda y enseña el nombre del contrato y, si difiere, lo tecleado.
21. Tras firmar salen dos frases casi iguales: «Ya has firmado. Falta que firme la otra parte.» y «Has firmado. Falta la otra parte.»
22. Un contrato cancelado no dice quién lo canceló ni cuándo, y el aviso «Se ha cancelado un contrato» no dice cuál.
23. Vista de la casera: «…y el casero no la ha confirmado», en tercera persona.
24. ✅ **Arreglado.** ~~«Confirmar la entrega de llaves» no pide confirmación y es definitivo; «Enviar para firmar» tampoco.~~ Las dos, y confirmar el inventario, piden una confirmación clara antes.
25. ✅ **Arreglado.** ~~La cronología no dice la fecha ni el importe de cada «marcó la fianza como devuelta»; tras reabrir la liquidación, las respuestas anteriores no se ven.~~ Ahora salen la fecha y el importe de cada devolución y, en la reapertura, las partidas y respuestas que había.
26. «Elemento añadido» sale al final de una página larga, lejos del botón.

**Textos**

27. El aviso de datos sensibles dice «la reseña puede ocultarse» también en la biografía y en la respuesta pública. En la reseña del inmueble, la pista de «Limpieza» junta dos frases («¿Estaba limpio como en el anuncio? / ¿Mantiene limpios los espacios comunes?»). `/terminos` y `/privacidad` llevan fecha del 18 de noviembre (un día después de la auditoría).

## 6. Dudas de producto (para decidir, no resueltas)

1. **Rechazo definitivo:** un interesado rechazado no puede volver a escribir sobre ese anuncio y el casero no puede deshacerlo. ¿Se quiere así?
2. **Estancias retroactivas:** la decisión 14 dice «sin interés previo», pero en la web solo se pueden proponer desde una conversación con interés aceptado. Dos cuentas nuevas pudieron registrar una estancia de 2025-2026 y abrir reseñas el mismo día.
3. **Contrato con fechas totalmente pasadas:** se firmó hoy uno de agosto a octubre de 2026 sin ningún aviso, y con él se abrieron reseñas, llaves y plazo vencido.
4. **Llaves con fecha antigua** (I6): ¿debe pasar un tiempo desde la declaración antes de decir que el casero no ha confirmado y de ofrecer el paquete?
5. **Ocultación cautelar:** quien recibe una reseña negativa puede ocultarla al momento eligiendo «datos personales». El autor no recibe aviso y la sigue viendo como «Publicada».
6. **Sin administradores:** en «Convivo pruebas» no hay ninguno. La reseña oculta en la auditoría y la notificación E6D1D0B7 no las verá nadie hasta nombrar uno.
7. **Cláusulas adicionales del contrato, concepto de las partidas y notas del inventario:** texto libre sin control (se aceptó un teléfono, un IBAN y «solo españoles»). Es privado entre las partes.
8. **Enter no envía** el mensaje del chat (ni en escritorio).
9. **Anuncios cerrados:** se quedan para siempre en «Mis anuncios», sin forma de ocultarlos.
10. **Marcas de fraude:** se publicó a propósito un anuncio con «Western Union» y «paga por adelantado»; se publicó sin aviso, como está decidido. No se pudo comprobar que saliera marcado (hace falta un admin).

## 7. Posibles preguntas para el abogado (sin respuesta definitiva)

1. **Notas «[Revisar con el abogado…]» dentro del texto firmado** (I14): ¿puede firmarse un contrato que las lleva?
2. **Fianza por encima de la legal:** se envió un contrato de temporada con fianza de 5.000 € y renta de 900 €; el texto la llama «fianza» y solo añade que la legal son dos mensualidades. ¿Hay que limitarla o separarla como garantía adicional? (relacionada con la pregunta 16 de la hoja de ruta).
3. **Ocultación cautelar sin avisar al autor:** `/terminos` §5 dice que las decisiones se comunican «si se retira o restringe contenido, a quien lo publicó». ¿La ocultación cautelar es una restricción que exige motivación (art. 17 DSA)?
4. **Privacidad y contratos:** `/privacidad` no menciona los contratos (nombre y apellidos, dirección, firma), las fotos de los inventarios, el resguardo ni la liquidación, ni su conservación. `/cuenta` tampoco dice que se conservan al borrar la cuenta.
5. **Nombre de la firma:** el registro guarda lo tecleado (mayúsculas y espacios distintos). ¿Importa para la validez de la firma simple?
6. **Fecha de llaves declarada con retraso** (I6) y el texto «el casero no la ha confirmado» en el paquete de pruebas: ¿es prudente decirlo sin un plazo mínimo para que conteste?
7. **`/terminos` §2:** «si se detecta que una cuenta es de un menor, se suspende». Hoy no existe la suspensión de cuentas.

## 8. Lo que no se pudo probar

| Qué | Por qué |
|---|---|
| **`/admin`**: denuncias, canal DSA, anuncios marcados y registro de moderación | No hay ningún administrador en «Convivo pruebas» y nombrar uno es cambiar datos (fuera del encargo). Solo se comprobó que un usuario normal recibe 404 |
| Recordatorios de llaves, aviso del mes y avisos de plazo de la fianza; avisos de ventana de reseña | Dependen de la tarea diaria, que en pruebas no corre sola (`/estado` lo avisa: falta `CRON_SECRET` con ese nombre) |
| Emails | Fuera de alcance; además no están configurados en pruebas. Ojo: `/denunciar` dice «Te hemos enviado un acuse por email» aunque no se envíe |
| Cierre de la ventana de reseñas y publicación a los 14 días | Hace falta que pase el tiempo. Sí se probó la publicación al opinar las dos partes |
| Límites anti-spam (60 mensajes, 15 intereses) y de acceso | Excluidos: serían pruebas de fuerza |
| Safari en iPhone real, fotos HEIC, lector de pantalla | No disponibles en la sesión (el lector lo hace Sergio) |
| Botón «Descargar o imprimir» | Abre el diálogo de impresión del navegador; se revisó el PDF generando la versión de impresión (contrato, inventario, paquete y resumen salen bien) |

Ninguna parte se cortó por las salvaguardas del modelo.

## 9. Datos creados (todos llevan «[AUDITORÍA]»)

- **4 cuentas:** las tres de la tabla y `auditoria.borrable.…@convivo.test` (ya borrada desde la propia web; queda su perfil «Usuario eliminado»).
- **4 anuncios de la casera:** habitación en Lugo (activa, con texto de estafa a propósito), su copia (cerrada), piso en Madrid (activo), habitación en «Villanueva de Prueba», Madrid (activa). **1 anuncio del inquilino:** «busco» en Lugo (activo).
- **4 conversaciones**, 3 estancias (una con compañero), **3 contratos** (habitación firmado, temporada cancelado, vivienda firmado), 2 inventarios bloqueados con fotos, 2 seguimientos de fianza (uno completo con liquidación cerrada), 3 reseñas (una oculta por denuncia), 1 respuesta pública, 1 denuncia interna y 1 notificación pública (E6D1D0B7).
- **Añadido en los bloques de arreglos (18 de noviembre):** para repetir las pruebas se firmó otro contrato de vivienda entre la casera y el inquilino de auditoría (`/contratos/e64bb78a-e796-45c6-bccb-265a0acc7679`, con su conversación, su estancia y el depósito anotado con un resguardo de prueba); en el contrato del piso de Madrid se hicieron los inventarios, una liquidación y una entrega de llaves sin confirmar; y la casera tiene ahora foto de perfil y ocupación de prueba.
- **No se borró ni modificó nada que ya existiera.** Los contratos firmados, inventarios, fianzas y reseñas son inmutables: para limpiarlos habrá que hacerlo desde el panel de Supabase.
- Para que la sesión pudiera abrir la web se creó un entorno de Claude Code llamado «convivo», que solo permite la web de pruebas y su base de datos.

## 10. Qué arreglar primero (recomendación)

1. **B1 y B2**: afectan a registros que quedan cerrados para siempre.
2. **I1** (avisos y acceso a «Contratos»): sin esto, el circuito de contrato y fianza no se encuentra.
3. **I2, I3 e I4**: las tres pantallas de «Algo se ha torcido».
4. **I5 e I7**: los dos tropiezos de uso más probables en el piloto.
5. Antes de abrir: nombrar un admin y repetir la parte de `/admin`; decidir las dudas 2, 3 y 4; llevar al abogado las preguntas 1 a 4.
