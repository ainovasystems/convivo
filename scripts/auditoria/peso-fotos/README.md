# Peso de las fotos por visita (solo en local)

Mide cuántos KB de fotos descarga el navegador en la búsqueda, la ficha y el
perfil, en móvil (Pixel 7) y escritorio, al entrar y bajando hasta el final.
Resultados y recomendaciones: `docs/PESO-DE-LAS-FOTOS.md`.

Con el Supabase local arrancado y `.env.local` apuntando a él (los scripts se
niegan a funcionar contra otra cosa):

```bash
node scripts/auditoria/peso-fotos/1-subir-fotos.mjs /tmp/fotos-antes.json   # 4 fotos «realistas» (~300 KB) por anuncio
node scripts/auditoria/peso-fotos/2-subir-avatar.mjs                        # avatar de 1200 px a un anunciante
npm run build && npm run start -- -p 3400                                   # en otra terminal
node scripts/auditoria/peso-fotos/3-medir.mjs
node scripts/auditoria/peso-fotos/4-restaurar.mjs /tmp/fotos-antes.json     # deja la BD local como estaba
```
