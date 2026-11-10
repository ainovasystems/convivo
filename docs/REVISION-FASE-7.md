# Revisión de la Fase 7a · diseño, accesibilidad y rendimiento

> Solo **mide y lista**. No se ha corregido nada de esto (es el bloque 7b). Lo único que se arregló en 7a es lo que necesita el SEO técnico: títulos, descripciones, canonical, datos estructurados y texto alternativo en las páginas nuevas.
> Fecha: 10 de noviembre de 2026. Capturas en [`capturas-fase-7/`](capturas-fase-7/) (52 pantallas, móvil de 375 px). Datos de axe y de Lighthouse sin tratar en esa misma carpeta (`axe-resultados.json`, `lighthouse/resumen.json`).

## Cómo se midió (y qué límites tiene)

- **Entorno:** `next build` + `next start` en una máquina de la nube, con Supabase local y los datos de ejemplo (más una foto de ejemplo en cada anuncio, solo en local). Las cifras de rendimiento son **orientativas**: el servidor y la base de datos están en la misma máquina y Lighthouse simula un móvil con 4G lenta. Hay que **repetirlas en Vercel** cuando haya dominio.
- **Lighthouse** (móvil, versión 12): 5 pantallas públicas. «Antes» = estado previo a esta fase; «después» = con la indexación **encendida** (con ella apagada, el SEO baja a 69 a propósito: la web de pruebas lleva `noindex`).
- **axe** (reglas WCAG 2 A/AA, 2.1 A/AA y buenas prácticas) sobre **52 pantallas**, públicas y con sesión (inicio, búsqueda, ciudad, ficha, perfil, acceso, legales, chat, mensajes, mis anuncios, asistente de publicar, reseñas, contrato en sus cuatro estados, inventario, admin…). Para ver el contrato y el inventario se creó un circuito completo en la base local.
- **Revisión visual:** una persona (Claude) mirando las capturas. Se ve lo evidente; no sustituye a probarlo en un móvil real.
- **Lo que no se ha probado:** teclado y orden de foco de punta a punta, lector de pantalla, zoom al 200 % y tamaño de letra grande. axe detecta solo una parte de los problemas de accesibilidad: **«0 fallos» no significa «accesible»**.
- Las capturas son de página completa: la barra de pestañas inferior (fija) aparece «a mitad de página» por cómo se hace la captura; no es un fallo. El selector de fecha y «Choose File» salen en inglés porque el navegador de la prueba está en inglés.
- Los «errores en consola» de Lighthouse en local (`ERR_SSL_PROTOCOL_ERROR`) vienen de abrir la web por `http` con la regla `upgrade-insecure-requests`: **no ocurrirán en Vercel** y no se listan.

## Lighthouse en móvil: antes y después

Puntuaciones: rendimiento / accesibilidad / buenas prácticas / SEO.

| Pantalla | Antes | Después (indexación encendida) | LCP antes → después | CLS |
|---|---|---|---|---|
| Inicio `/` | 86 / 96 / 96 / 100 | **99** / 96 / 96 / 100 | 2,2 s → 2,0 s | 0 → 0 |
| Búsqueda `/anuncios` | 93 / 95 / 96 / **91** | 94 / 95 / 96 / **100** | 2,9 s → 2,9 s | 0 → 0 |
| Ciudad | 93 / 95 / 96 / **91** (se midió `/anuncios?ciudad=Lugo`, la página nueva no existía) | **99 / 100** / 96 / **100** (`/habitaciones/lugo`) | 3,0 s → 2,2 s | 0 → 0 |
| Ficha de anuncio | 91 / 100 / 93 / **91** | 91 / 100 / 93 / **100** | 3,0 s → 3,3 s | 0 → 0 |
| Perfil público | 73 / 100 / 93 / **90** | 75 / 100 / 93 / **63** (a propósito: `noindex`) | 3,3 s → 3,0 s | **0,37** → **0,37** |

Lectura honesta:

- **El SEO sube de 90–91 a 100** en todas las páginas indexables. La causa era que la **meta descripción no estaba en el `<head>`** para los visitantes que no son buscadores conocidos (Next la enviaba después, dentro del `<body>`). Se ha corregido con `htmlLimitedBots` (ver `next.config.ts`); además WhatsApp y otros rastreadores nuevos ya la leen siempre.
- El perfil público **baja a 63 a propósito**: Lighthouse avisa «Página bloqueada para indexación». Es la decisión de producto (los perfiles de personas no se indexan).
- **Las diferencias de rendimiento no se deben al trabajo de SEO**, sino a la variación entre mediciones (la primera pasada de inicio salió con 490 ms de bloqueo y las siguientes con 40–60 ms). La web ya estaba cerca del objetivo de 90; el único valor claramente por debajo es el perfil (CLS).
- Con la indexación **apagada** (como está la web de pruebas): inicio 99/96/96/**69**, ciudad 98/100/96/**69**.

## Los 10 hallazgos más graves (resumen)

1. **D1 · Búsqueda:** en móvil los filtros ocupan más de una pantalla antes del primer resultado.
2. **D2 · Ficha:** el botón de contacto está al final de una página de unos 2.700 px.
3. **P1 · Perfil público:** salto de diseño (CLS 0,37) al cargar; es el único valor de Lighthouse en rojo.
4. **P2 · Ficha, búsqueda y perfil:** LCP de 2,9–3,3 s en móvil simulado; la foto principal no se pide con prioridad.
5. **A1 · Contraste:** texto «Sin fotos aún» sobre la tarjeta sin foto (axe: «grave»).
6. **A2 · Bandeja de mensajes:** el nombre accesible de cada conversación no contiene el texto visible (axe: «grave»; afecta a control por voz).
7. **A3 · Chat:** lista `<ol>` con un `<div>` suelto dentro (axe: «grave»).
8. **A5 · Objetivos táctiles:** enlaces del pie (20 px), casillas de filtros (16 px) y enlaces de «Notificar…» (15 px) por debajo de 24 px.
9. **D5 · Contrato e inventario:** las partes y la referencia salen como identificadores largos (UUID) que se parten en tres líneas.
10. **D3 · Ficha y perfil:** la ubicación repite ciudad y provincia («Centro histórico, Lugo, Lugo»).

---

## 1. Accesibilidad

Ordenado de más a menos grave. Gravedad: alta / media / baja.

| # | Pantalla | Qué pasa | Gravedad | Propuesta de arreglo | Esfuerzo | Captura |
|---|---|---|---|---|---|---|
| A1 | Inicio, búsqueda, tarjetas sin foto | Contraste insuficiente del texto «Sin fotos aún» / «Busca hogar» (`text-brand/70` sobre `brand-soft`). axe: *color-contrast*, «grave». También lo marca Lighthouse. | Media | Usar `text-brand` (sin opacidad) o `brand-strong` en ese texto. | Pequeño | [01](capturas-fase-7/01-inicio.webp) · [02](capturas-fase-7/02-buscar.webp) · [20](capturas-fase-7/20-sesion-inicio.webp) |
| A2 | Mensajes (bandeja) | Cada conversación tiene un `aria-label` («Conversación con X sobre Y…») que **no contiene** el texto visible (nombre, extracto del mensaje). axe: *label-content-name-mismatch*, «grave». Quien use control por voz no puede decir «clic en Ana». | Media | Quitar el `aria-label` y dejar que el nombre accesible salga del contenido; el aviso «N sin leer» como texto oculto dentro del enlace. | Pequeño | [24](capturas-fase-7/24-mensajes.webp) · [42](capturas-fase-7/42-mensajes-con-conversaciones.webp) |
| A3 | Chat | El `<ol>` de mensajes contiene un `<div ref={endRef}>` (ancla de desplazamiento) que no es `<li>`. axe: *list*, «grave»: los lectores de pantalla cuentan mal los mensajes. | Media | Sacar el ancla fuera del `<ol>`, o hacerla `<li aria-hidden>`. | Pequeño | [40](capturas-fase-7/40-chat-pendiente.webp) · [41](capturas-fase-7/41-chat-aceptado.webp) |
| A4 | Ficha de anuncio | El texto alternativo de las fotos es «Foto 1 de N», sin decir qué se ve. Ayuda poco a una persona ciega y nada al SEO de imágenes. | Media | Alt descriptivo: «Habitación en Centro histórico, Lugo (foto 1 de 4)». En las páginas de ciudad nuevas ya se hace. | Pequeño | [08](capturas-fase-7/08-ficha-habitacion.webp) |
| A5 | Pie, filtros, fichas, acceso | Objetivos táctiles por debajo de 24 px (WCAG 2.5.8): enlaces del pie (20 px de alto), casillas de los filtros (16×16), «Notificar contenido ilegal» (15–16 px), «Regístrate» (18 px), «Quitar» del inventario. Los títulos de las tarjetas **no** cuentan: su enlace cubre toda la tarjeta. | Media | Más alto de línea y relleno en enlaces sueltos (`py-2`), casillas con área clicable mayor (etiqueta completa), separación mínima. | Pequeño–medio | [02](capturas-fase-7/02-buscar.webp) · [08](capturas-fase-7/08-ficha-habitacion.webp) · [12](capturas-fase-7/12-entrar.webp) |
| A6 | Búsqueda | Orden de encabezados: h1 «Anuncios» → h3 (título de cada tarjeta) sin h2 intermedio. axe: *heading-order*. En las páginas de ciudad nuevas ya está resuelto con un h2 oculto. | Baja | Añadir el h2 oculto «Resultados» o cambiar las tarjetas a h2 en la búsqueda. | Pequeño | [02](capturas-fase-7/02-buscar.webp) · [03](capturas-fase-7/03-buscar-filtrada.webp) |
| A7 | Botones desactivados (chat «Enviar», inventario, asistente) | Se ven muy apagados y no explican por qué están desactivados (en el asistente sí hay una lista de lo que falta; en el chat y el inventario no). | Baja | Texto de ayuda enlazado con `aria-describedby` y estado desactivado con más contraste. | Pequeño | [40](capturas-fase-7/40-chat-pendiente.webp) · [48](capturas-fase-7/48-inventario-vacio.webp) · [38](capturas-fase-7/38-publicar-con-errores.webp) |
| A8 | Todas | **Sin comprobar a mano:** orden de foco con teclado, lector de pantalla, zoom 200 %, texto grande. | — | Hacer una pasada manual en 7b (30–60 min con VoiceOver o TalkBack en las 5 pantallas clave). | Medio | — |

Pantallas con **0 fallos de axe**: 44 de 52 (ciudad, ficha, perfil, acceso, registro, legales, denunciar, estado, 404, mis reseñas, reseña nueva, estancias, perfil editar, cuenta, contratos, publicar (todos los pasos), mis anuncios, admin, contrato en sus 4 estados e inventario). No hay desbordamiento horizontal en ninguna.

## 2. Rendimiento

| # | Pantalla | Qué pasa | Gravedad | Propuesta de arreglo | Esfuerzo | Captura |
|---|---|---|---|---|---|---|
| P1 | Perfil público | **CLS 0,37** (el límite «bueno» es 0,1): al sustituir el esqueleto de carga (`loading.tsx`) por el contenido, el pie de página y el bloque de reseñas saltan. Única métrica en rojo de Lighthouse. | Alta | Dar al esqueleto la misma altura mínima que el contenido o quitarlo (la página ya es rápida de servidor); reservar altura para las reseñas. | Pequeño–medio | [11](capturas-fase-7/11-perfil-publico.webp) |
| P2 | Ficha, búsqueda, perfil | **LCP de 2,9–3,3 s** en móvil simulado (objetivo < 2,5 s). En la ficha la foto principal («Foto 1») no se pide con prioridad (*LCP request discovery*). En el perfil el elemento LCP es un texto, retrasado por el CSS bloqueante (~260 ms). | Media | `priority` en la primera foto de la galería; revisar el CSS crítico; medir en Vercel (la región `cdg1` y la CDN cambian mucho esta cifra). | Pequeño–medio | [08](capturas-fase-7/08-ficha-habitacion.webp) |
| P3 | Todas | JavaScript innecesario: 11–12 KiB de «JS heredado» (polyfills para navegadores antiguos) y 21–22 KiB sin usar en ficha y perfil. | Media | Declarar `browserslist` moderno; cargar bajo demanda lo que no se usa al entrar (galería, reseñas, informar). | Medio | — |
| P4 | Asistente de publicar, chat, editar perfil | Rutas con mucho JS: `/publicar/[id]` 222 kB, `/mensajes/[id]` 215 kB, `/perfil/editar` 145 kB de primera carga (la base común son 103 kB). Pesan en móviles gama baja. | Media | Cargar por partes el editor de fotos, el compresor de imágenes y el Realtime solo cuando se usan. | Medio | — |
| P5 | Inicio | Una pasada dio **490 ms de bloqueo (TBT)** y «trabajo del hilo principal 2,4 s»; otras, 40–60 ms. Hay variabilidad que no sabemos explicar. | Baja | Repetir 5 veces en Vercel y mirar solo la mediana. Si se confirma, revisar el degradado del hero y los chips. | Pequeño | [01](capturas-fase-7/01-inicio.webp) |
| P6 | Todas | Lighthouse: la página **no se restaura al volver atrás** (caché de ida y vuelta, 2 motivos). La navegación atrás es más lenta de lo necesario. | Baja | Ver los dos motivos en Chrome DevTools → Application → Back/forward cache y quitarlos (normalmente `Cache-Control: no-store` o escuchas de `unload`). | Medio | — |

Nota: en esta fase se activó `htmlLimitedBots` (metadatos siempre en el `<head>`). Cuesta una fracción de milisegundos de TTFB por página y no se aprecia en las medidas.

## 3. Diseño visual (móvil, 375 px)

| # | Pantalla | Qué pasa | Gravedad | Propuesta de arreglo | Esfuerzo | Captura |
|---|---|---|---|---|---|---|
| D1 | Búsqueda de anuncios | El panel «Filtros y orden» llega **abierto**: ocupa unos 1.000 px (más de una pantalla) y el primer anuncio queda fuera de la vista. Tras buscar, el panel sigue abierto, así que se ve el mismo muro de filtros en vez de resultados. | Alta | Panel cerrado por defecto con un resumen («Lugo · hasta 300 €») y chips de los filtros activos que se pueden quitar; los resultados, arriba. | Medio | [02](capturas-fase-7/02-buscar.webp) · [03](capturas-fase-7/03-buscar-filtrada.webp) · [04](capturas-fase-7/04-buscar-sin-resultados.webp) |
| D2 | Ficha de anuncio (con y sin sesión) | La llamada a la acción («Entra para contactar» / «Me interesa») está **al final** de una página de ~2.700 px, tras datos, descripción, normas, ubicación y reseñas. En móvil, quien se decide arriba tiene que bajar entera. | Alta | Barra inferior pegajosa con el precio y el botón «Me interesa», o repetir el botón tras «Datos clave». | Medio | [08](capturas-fase-7/08-ficha-habitacion.webp) · [09](capturas-fase-7/09-ficha-piso.webp) · [21](capturas-fase-7/21-sesion-ficha-habitacion.webp) |
| D3 | Ficha de anuncio y tarjetas | La ubicación repite ciudad y provincia cuando son iguales: «Centro histórico, Lugo, Lugo», «Riazor, A Coruña, A Coruña». | Media | No añadir la provincia si coincide con la ciudad. | Pequeño | [08](capturas-fase-7/08-ficha-habitacion.webp) · [09](capturas-fase-7/09-ficha-piso.webp) |
| D4 | Chat | El aviso «Nunca pagues antes de ver el piso» sale **dos veces** (arriba y debajo de los mensajes) con texto casi idéntico, y empuja el campo de escribir fuera de la pantalla. | Media | Dejar una sola vez, fija y compacta (una línea con «Más info»). | Pequeño | [40](capturas-fase-7/40-chat-pendiente.webp) · [41](capturas-fase-7/41-chat-aceptado.webp) |
| D5 | Contrato firmado, inventario | Las partes («usuario de Convivo con identificador a0000000-0000-4000-8000-000000000004») y la «Referencia del contrato» son UUID de 36 caracteres que se parten en 3 líneas. Difícil de leer y de copiar. Ojo: forma parte del **texto firmado**; cambiarlo exige subir `TEMPLATE_VERSION` y que lo vea el abogado. | Media | Mostrar un código corto legible (p. ej. los 8 primeros caracteres) o el enlace al perfil, con el UUID completo en un campo «copiar». | Medio | [43](capturas-fase-7/43-contrato-borrador.webp) · [46](capturas-fase-7/46-contrato-firmado.webp) · [50](capturas-fase-7/50-inventario-bloqueado.webp) |
| D6 | Mi cuenta (borrar) | «Borrar mi cuenta para siempre» es del **mismo marrón** que cualquier botón normal; el único aviso de peligro es el fondo rosado de la tarjeta. | Media | Botón rojo (o contorno rojo) y confirmación en dos pasos visibles. | Pequeño | [26](capturas-fase-7/26-cuenta.webp) |
| D7 | Perfil público | La etiqueta «Cuenta nueva» se parte y queda a media línea junto a «En Convivo desde…». | Baja | Llevarla a su propia línea o junto al nombre. | Pequeño | [11](capturas-fase-7/11-perfil-publico.webp) |
| D8 | Asistente de publicar | Los pasos «1. Tipo · 2. Datos · 3. Fotos · 4. Revisión» se parten en dos líneas y no hay indicación de progreso (solo cambia el color). Además, en la revisión, un elemento de la lista «Antes de publicar falta» queda centrado y sin viñeta alineada. | Baja | Pasos en una línea con barra de progreso («Paso 2 de 4»); revisar la alineación de la lista de errores. | Pequeño | [32](capturas-fase-7/32-publicar-datos.webp) · [38](capturas-fase-7/38-publicar-con-errores.webp) |
| D9 | Inventario de salida | Texto «1 elementos copiados». | Baja | Plural correcto («1 elemento copiado»). | Pequeño | [51](capturas-fase-7/51-inventario-salida.webp) |
| D10 | Páginas legales | Textos de 3.500–4.800 px sin índice ni enlaces a cada apartado. Son borradores, pero serán lo más leído antes de registrarse. | Baja | Índice con enlaces a los apartados al inicio y botón «Volver arriba». | Pequeño | [14](capturas-fase-7/14-privacidad.webp) · [15](capturas-fase-7/15-terminos.webp) |
| D11 | Bandeja de mensajes, mis estancias, mis contratos, mis reseñas | Con pocos elementos, el pie y mucho blanco dominan la pantalla; no hay un siguiente paso sugerido (por ejemplo «Buscar habitación» si no hay conversaciones). | Baja | Estados vacíos con una acción clara. | Pequeño | [23](capturas-fase-7/23-mis-estancias.webp) · [27](capturas-fase-7/27-contratos-vacio.webp) · [42](capturas-fase-7/42-mensajes-con-conversaciones.webp) |

Pantallas revisadas sin hallazgos relevantes: inicio, páginas de ciudad (nuevas), 404, entrar, registro (con y sin errores), denunciar, estado, perfil editar, reseña nueva (formulario claro), mis anuncios, admin, contrato por firmar y borrador, inventario con elementos.

## 4. Qué haría primero en el bloque 7b

1. **D1 + D2** (búsqueda y ficha): son lo que más pesa en la conversión en móvil.
2. **P1 + P2** (CLS del perfil y prioridad de la foto principal): rápido y mueve las cifras.
3. **A1–A4**: todos pequeños, y limpian los «graves» de axe.
4. **A5** y una **pasada manual de teclado y lector de pantalla** (A8).
5. El resto, según el tiempo.
