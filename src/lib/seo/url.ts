/** Une la URL base del sitio con una ruta. Pura: sin acceso a variables ni cabeceras. */
export function absoluteUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
