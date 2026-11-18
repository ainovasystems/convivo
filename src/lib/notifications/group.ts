/** Reparte los avisos en las tres secciones de la pantalla «Avisos». Sin dependencias: se puede probar tal cual. */
export function groupNotifications<T extends { pending: boolean; needs_action: boolean }>(items: T[]) {
  return {
    /** Te toca: piden hacer algo y aún no se ha hecho. */
    todo: items.filter((n) => n.pending && n.needs_action),
    /** Novedades sin leer. */
    news: items.filter((n) => n.pending && !n.needs_action),
    /** Ya atendidos o leídos. */
    past: items.filter((n) => !n.pending),
  };
}
