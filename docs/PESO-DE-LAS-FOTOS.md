# Peso de las fotos por visita

> Medido el 14 de noviembre de 2026 (Fase 8a) en local, con 4 fotos «realistas» por anuncio (unos 300 KB cada una a 1.600 px en WebP, lo que sale de una foto de móvil tras la compresión del asistente) y un avatar de 1.200 px. Cómo repetirlo: `scripts/auditoria/peso-fotos/README.md`.
> **Solo se mide; no se ha cambiado nada.** Las mejoras se decidirán en la planificación (ver «Recomendaciones»).

## Resultado

| Página | Móvil (Pixel 7) al entrar | Móvil bajando hasta el final | Escritorio |
|---|---|---|---|
| Búsqueda (`/anuncios`, 10 anuncios con foto) | **6 fotos · 1.092 KB** | 10 fotos · 1.820 KB | 10 fotos · 440 KB |
| Ficha de un anuncio (4 fotos) | **4 fotos · 730 KB** | 4 fotos · 730 KB | 4 fotos · 438 KB |
| Perfil público (avatar) | 1 foto · 21 KB | 1 foto · 21 KB | 1 foto · 7 KB |

**Una visita típica en móvil** (búsqueda y una ficha) descarga de **1,8 a 2,5 MB de fotos**. En escritorio, unos 0,9 MB.

## Qué carga cada pantalla

- **Ninguna foto se descarga en tamaño original.** Todas pasan por el optimizador de imágenes de Next.js (`/_next/image`), que las reduce al ancho necesario.
- **Tarjetas de la búsqueda en móvil:** se pide la versión de **1.200 px** (unos 180 KB por foto). La tarjeta mide 412 px de ancho, pero el Pixel 7 tiene una pantalla de densidad 2,6, así que el navegador pide la de 1.200. No es la foto grande (la original es de 1.600 px y 300 KB), pero **es mucho más de lo que necesita una miniatura**.
- **Tarjetas en escritorio:** versión de 384 px, unos 44 KB por foto. Correcto.
- **Ficha en móvil:** se descargan **las 4 fotos de la galería nada más entrar** (1.200 px cada una), aunque solo se ve la primera. Las demás están marcadas como «diferidas», pero el navegador las considera cerca porque están en la misma fila deslizable.
- **Avatares:** bien. De 211 KB pasan a 21 KB en móvil y a 7 KB en escritorio.
- **Fotos del inventario** (privadas): se sirven directamente desde Supabase con un enlace temporal y sin optimizar, unos 300 KB por foto. Solo las ven las dos partes del contrato, así que el tráfico es muy bajo.

## Dónde se paga ese tráfico

- Las fotos de anuncios y avatares las entrega **Vercel**, a través de su optimizador. **Supabase solo sirve la original** la primera vez que Vercel pide cada tamaño; después Vercel la guarda en caché (las fotos de anuncio se suben con caché de un año).
  - Por eso el tráfico de Supabase debería quedarse bajo aunque haya muchas visitas.
  - El que crece con las visitas es el de Vercel, junto con su cuota de optimización de imágenes.
- Cuenta aproximada: **1.000 visitas al día en móvil × 2 MB ≈ 60 GB de fotos al mes en Vercel.** Los límites exactos de Vercel (tráfico y número de imágenes optimizadas al mes) **no los he verificado**: hay que mirarlos en el panel de Vercel → Usage.
- **Cifras de alarma en Supabase** (revisión mensual; están en el checklist): tráfico de salida **> 150 GB/mes** o ficheros **> 60 GB**. El plan Pro incluye 250 GB de tráfico y 100 GB de ficheros. Si saltara la alarma de tráfico con este esquema, lo más probable es que algo se esté sirviendo directamente desde Supabase sin pasar por el optimizador.

## Recomendaciones (no aplicadas; a decidir)

1. **Tarjetas en móvil: pedir como mucho unos 828 px** en vez de 1.200. Basta con ajustar el `sizes` de la tarjeta o limitar los anchos del optimizador. Ahorra en torno a un 40-50 % en la búsqueda: de 1,1 MB a unos 0,6 MB al entrar. Es el cambio con más efecto y entra bien en la **7b (P2)**.
2. **Galería de la ficha: cargar solo la primera foto** y las demás cuando el usuario deslice. Ahorra unos 550 KB por ficha en móvil.
3. **Calidad de la versión optimizada un poco más baja** en las tarjetas (de 75 a unos 60), sin pérdida visible en una miniatura. Es opcional.
4. **No hace falta cambiar de almacenamiento** para el piloto. Con el optimizador delante, Supabase Storage aguanta de sobra. Mover las fotos a otro sitio, como Cloudflare R2, se queda en «Ideas aparcadas → Fotos a escala» por si saltan las cifras de alarma.
5. Cuando haya producción, **mirar una vez al mes** el tráfico en Vercel → Usage y en Supabase → Usage. Está en `docs/CHECKLIST-LANZAMIENTO.md`.
