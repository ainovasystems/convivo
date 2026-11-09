# Tabla de conservación de datos · BORRADOR

> Borrador técnico para revisar con el abogado. Describe lo que hace hoy el sistema y una propuesta de plazos. La ley no fija la mayoría de estos plazos: los define el responsable, con justificación.
>
> **Pendiente clave (art. 32 LOPDGDD):** tras la supresión, los datos deben **bloquearse** (conservarse fuera del uso normal, solo a disposición de jueces y autoridades) durante los plazos de prescripción de las posibles responsabilidades. Hoy el borrado de cuenta **suprime sin bloquear**. Hay que decidir qué datos se bloquean, cuánto tiempo y dónde (por ejemplo, un esquema aparte, cifrado y sin acceso desde la app).

| Dato | Dónde | Hoy | Propuesta | Justificación |
|---|---|---|---|---|
| Cuenta (email, contraseña cifrada) | `auth.users` | Hasta que se borra la cuenta | Igual. Cuentas sin actividad durante 24 meses: aviso y borrado | Ejecución del contrato. Minimización de cuentas abandonadas |
| Perfil público | `profiles` | Hasta el borrado. Después queda «Usuario eliminado», sin datos | Igual | Las reseñas conservadas necesitan un autor o sujeto, aunque esté vacío |
| Anuncios y dirección exacta | `listings`, `listing_addresses` | Hasta el borrado. Los cerrados con estancias se conservan sin dirección ni fotos | Cerrados sin estancias: borrar a los 12 meses | Sin estancias no aportan reputación |
| Fotos de anuncios y avatar | Storage | Se borran al borrar la cuenta o al quitarlas | Igual | — |
| Conversaciones (intereses y mensajes) | `interests`, `messages` | Hasta el borrado de cualquiera de las dos partes | Borrar a los 24 meses del último mensaje | Prueba en caso de conflicto durante la prescripción. [Validar plazo] |
| Estancias | `stays`, `stay_participants` | Se conservan: sostienen las reseñas | Igual mientras haya reseñas | Base de la reputación verificada |
| Reseñas | `reviews` | Indefinido. Al borrar la cuenta se desvinculan («Usuario eliminado») | [Decidir con el abogado] Plazo máximo, p. ej. 5 años desde la estancia | Interés legítimo y libertad de información (art. 17.3.a RGPD). Proporcionalidad: una reseña muy antigua aporta poco |
| Respuestas a reseñas | `review_responses` | Igual que la reseña | Igual que la reseña | — |
| Avisos in-app | `notifications` | Indefinido | Borrar a los 12 meses | Sin utilidad pasado ese tiempo |
| Huellas de intentos de acceso | `auth_attempts` | Se borran a partir de las 24 h (limpieza oportunista) | Igual | Seguridad (interés legítimo). Mínimo imprescindible |
| Huellas de cuentas borradas (email, IP y navegador, HMAC) y n.º de reseñas negativas | `private.deleted_account_traces` | 2 años (`expires_at`); dejan de usarse al caducar, pero aún no se purgan | Igual, más una purga automática | Prevención del fraude: que nadie borre la cuenta para escapar de sus reseñas (interés legítimo). Se informa antes de borrar |
| Huellas anti-abuso (IP y navegador, HMAC) | `user_signals` | Indefinido | Borrar a los 12 meses del último uso | Detectar autorreseñas en el periodo en que se escriben |
| Denuncias internas | `reports` | Indefinido. Al borrar la cuenta se quita el texto libre | 3 años desde la resolución | Defensa ante reclamaciones. [Validar] |
| Notificaciones DSA (nombre y email de quien notifica, explicación) | `legal_notices` | Indefinido | 3 años desde la decisión | Obligación legal (DSA) y defensa ante reclamaciones. [Validar] |
| Marcas anti-fraude | `listing_flags` | Indefinido | 3 años desde la resolución | Prevención del fraude (interés legítimo) |
| Registro de moderación | `moderation_log` | Indefinido. Nadie puede borrarlo | 5 años. El borrado por plazo exige una función de purga controlada, porque el trigger impide borrar | Rendición de cuentas (DSA) |
| Logs técnicos de Vercel y Supabase | Proveedores | Según el plan de cada uno | Documentar el plazo de cada plan | Encargados del tratamiento |
| Copias de seguridad | Supabase | Según el plan (Free: sin PITR) | Documentar. Lo borrado sigue en las copias hasta que caducan | Decirlo en la política de privacidad |

## Qué hace falta construir cuando se decidan los plazos

1. Una tarea programada de purga (como la de avisos de reseña) que borre por plazo, con su test en `tests/db`.
2. Una función `private.purge_moderation_log(before)` solo para service_role. El trigger append-only solo la dejaría pasar con una variable de sesión, igual que `convivo.anonymizing`.
3. El bloqueo del art. 32 LOPDGDD, si el abogado lo exige para algún dato.
