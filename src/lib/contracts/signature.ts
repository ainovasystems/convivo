/**
 * Cómo se enseña una firma en el registro: el nombre tal como figura en el
 * contrato (lo que la BD guarda al firmar) y, si quien firmó lo tecleó con otras
 * mayúsculas o espacios, también lo tecleado. Los contratos firmados antes de
 * guardar ese nombre usan el de las condiciones, que es el mismo dato.
 */
export function signatureLabel(signedName: string | null | undefined, nameInTerms: unknown, typed: string | null | undefined): string {
  const official = (signedName ?? (typeof nameInTerms === "string" ? nameInTerms : "")).trim();
  const written = (typed ?? "").trim();
  if (!official) return written;
  return written && written !== official ? `${official} (tecleado al firmar: «${written}»)` : official;
}
