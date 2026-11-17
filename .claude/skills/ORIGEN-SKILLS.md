# Origen de las skills de este directorio

No son código nuestro: son copias, sin modificar, de las skills oficiales de Supabase.

- Repositorio: https://github.com/supabase/agent-skills (licencia MIT)
- Commit fijado: `c9be0e931b7930f7d02126d04774d904c381e7d7` (2 de octubre de 2026, «chore: release main (#609)»)
- Skills copiadas: `supabase` (0.1.2) y `supabase-postgres-best-practices` (1.1.1)
- Instaladas el 17 de noviembre de 2026, tras leer todos sus ficheros: solo Markdown, sin scripts ni ejecutables.
- No hay plugin, ni marketplace, ni hooks: no se actualizan solas.

## Cómo actualizarlas (a mano y con revisión)

1. Clonar el repositorio de Supabase en una carpeta aparte y mirar el `CHANGELOG.md` de cada skill.
2. Leer los ficheros que hayan cambiado (que siga sin haber scripts ni ejecutables).
3. Copiar las dos carpetas aquí, actualizar el commit de este fichero y la sección «Skills de Supabase» de `CLAUDE.md`.

Si una guía de estas skills choca con `CLAUDE.md` o con una decisión tomada, **gana `CLAUDE.md`**.
