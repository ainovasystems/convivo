# Convivo · Cómo trabajamos

Dos herramientas, cada una con su papel:

| | Chat del proyecto de Claude (planificación) | Claude Code (ejecución) |
|---|---|---|
| Para qué | Decidir qué hacer, en qué orden y por qué. Dudas de producto, legales y de negocio | Programar, probar, subir los cambios y aplicar las migraciones a la base de pruebas |
| Qué sabe | Lo que hay en los documentos del proyecto | Todo el repositorio, más `CLAUDE.md` |
| Qué produce | **Un encargo** por bloque, con la plantilla de abajo | **Un parte de cierre** por bloque, con la plantilla de abajo |

## El ciclo (siempre igual)

1. En el **chat del proyecto** se elige **un** bloque de `HOJA-DE-RUTA.md` («SIGUIENTE») y se cierran las dudas de producto.
2. El chat redacta **el encargo** y el usuario lo pega en **una sesión nueva de Claude Code**.
3. Code lo ejecuta hasta el final y responde con **el parte de cierre**. Antes actualiza `HOJA-DE-RUTA.md`, `CONTEXTO-PROYECTO.md` y `CLAUDE.md`.
4. El usuario pega el parte en el chat del proyecto y vuelve a subir los dos documentos actualizados. Se pasa al siguiente bloque.

**Reglas para no irse por las ramas:**

- Un bloque cada vez. Lo que aparezca por el camino va a «Ideas aparcadas».
- Lo ya decidido (sección 5 de `CONTEXTO-PROYECTO.md`) no se reabre sin un motivo nuevo.
- Si Code encuentra una decisión de producto, pregunta en vez de inventar. El usuario la resuelve en el chat del proyecto si hace falta.
- Sesiones de Code cortas: una por bloque. Si un bloque es grande, se parte en subbloques con su propio encargo.

## Plantilla del encargo (la escribe el chat del proyecto)

```
ENCARGO · <nombre del bloque>

Contexto: proyecto Convivo. Lee CLAUDE.md y docs/HOJA-DE-RUTA.md antes de empezar.
Rama: claude/new-session-734nfk (no crear PR).

Objetivo (qué tiene que poder hacer el usuario al terminar):
- …

Decisiones ya tomadas para este bloque:
- …

Fuera de alcance (no hacer):
- …

Al terminar:
1. npm run lint && npm run typecheck && npm test && npm run build, y los e2e afectados.
2. Commits pequeños en castellano y push.
3. Si hay migraciones: aplicarlas a «Convivo pruebas» (nunca a producción) y decir cuáles.
4. Actualizar CLAUDE.md, docs/HOJA-DE-RUTA.md y docs/CONTEXTO-PROYECTO.md.
5. Responder con el PARTE DE CIERRE.
```

## Plantilla del parte de cierre (la escribe Claude Code)

```
PARTE DE CIERRE · <nombre del bloque> · <fecha>

Hecho: (qué puede hacer ahora el usuario, en 3-6 puntos)
Cómo probarlo: (pasos en la web de pruebas)
Migraciones aplicadas a pruebas: (nombres, o «ninguna»)
Pruebas: (n.º de pruebas y si pasan)
Decisiones tomadas por el camino: (o «ninguna»)
Pendiente del usuario: (tareas manuales nuevas, o «nada nuevo»)
Preguntas nuevas para el abogado: (o «ninguna»)
Ideas aparcadas añadidas: (o «ninguna»)
Siguiente bloque recomendado: …
Documentos actualizados: CLAUDE.md, docs/HOJA-DE-RUTA.md, docs/CONTEXTO-PROYECTO.md
```

## Instrucciones para el proyecto de Claude

Pégalas en «Instrucciones del proyecto» (*Project instructions*):

```
Eres el jefe de proyecto y producto de Convivo. Trabajas conmigo (no técnico) en español de España, claro y breve.

Tu papel: decidir conmigo qué hacer, en qué orden y por qué, y redactar ENCARGOS para Claude Code con la plantilla de docs/COMO-TRABAJAMOS.md. Tú no programas: Claude Code ve el repositorio y decide el cómo.

Fuentes de verdad (en los archivos del proyecto): CONTEXTO-PROYECTO.md (qué es y estado), HOJA-DE-RUTA.md (qué toca, pendientes, preguntas al abogado, ideas aparcadas), COMO-TRABAJAMOS.md (el ciclo y las plantillas) y CLAUDE.md (detalle técnico y decisiones).

Reglas:
- Un bloque cada vez: el marcado como SIGUIENTE en la hoja de ruta. Si propongo otra cosa, dime si encaja o si va a «Ideas aparcadas», y que decida yo.
- No reabras decisiones ya tomadas salvo que haya un motivo nuevo; si lo hay, dilo explícitamente.
- Antes de redactar un encargo, hazme como mucho 3 preguntas de producto que de verdad cambien el resultado. Si no hacen falta, no preguntes.
- Encargos concretos: el objetivo visto por el usuario final, las decisiones tomadas y lo que queda fuera de alcance. Sin código.
- Cuando pegue un PARTE DE CIERRE, resúmelo en 2 líneas, dime qué tareas manuales tengo pendientes y propón el siguiente bloque.
- Temas legales: señala el riesgo y añádelo a las preguntas para el abogado; no des la respuesta legal como definitiva.
- Nunca me pidas claves ni contraseñas: van en Vercel o en Supabase, nunca en el chat.
```

## Primer mensaje en el chat del proyecto

```
Hola. Acabo de pasar Convivo a este proyecto. Lee los cuatro documentos y dime:
1. En 5 líneas, en qué punto estamos.
2. Mis tareas manuales pendientes, de la más urgente a la menos.
3. Cuál recomiendas como siguiente bloque de la hoja de ruta y por qué (una recomendación, no un menú).
Después, hazme las preguntas que necesites (máximo 3) y redacta el ENCARGO para Claude Code.
```
