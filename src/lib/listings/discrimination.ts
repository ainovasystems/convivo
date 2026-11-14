import { z } from "zod";

/**
 * Expresiones discriminatorias en anuncios. ÚNICO sitio donde se definen: para
 * ampliar la lista basta con añadir palabras a los grupos de abajo (sin tildes
 * y en minúsculas; el texto del usuario se normaliza igual antes de comparar).
 *
 * Se rechazan exclusiones por origen, nacionalidad, etnia, religión u
 * orientación sexual ("solo españoles", "no extranjeros", "abstenerse
 * gitanos"…). No se busca la palabra suelta, sino la exclusión: "hablamos
 * español" o "barrio chino" no son discriminatorios.
 *
 * Sexo: este filtro no lo toca, y lo que cada anunciante escriba en su
 * descripción sigue siendo libre. El campo cerrado y el filtro «solo
 * chicas/chicos» se quitaron (riesgo con la Ley 15/2022; decisión 41 revocada).
 */

/** Grupos que nunca se pueden exigir ("solo …"). */
const ONLY_GROUPS = [
  "espanol", "espanoles", "espanola", "espanolas", "nacional", "nacionales", "europeo", "europeos", "europea", "europeas",
  "blanco", "blancos", "blanca", "blancas", "payo", "payos", "paya", "payas",
  "cristiano", "cristianos", "cristiana", "cristianas", "catolico", "catolicos", "catolica", "catolicas",
  "heterosexual", "heterosexuales", "hetero", "heteros",
];

/** Grupos que nunca se pueden excluir ("no …", "sin …", "abstenerse …"). */
const EXCLUDED_GROUPS = [
  "extranjero", "extranjeros", "extranjera", "extranjeras", "inmigrante", "inmigrantes", "emigrante", "emigrantes",
  "latino", "latinos", "latina", "latinas", "sudamericano", "sudamericanos", "sudamericana", "sudamericanas",
  "arabe", "arabes", "moro", "moros", "mora", "moras", "marroqui", "marroquies", "magrebi", "magrebies",
  "africano", "africanos", "africana", "africanas", "negro", "negros", "negra", "negras",
  "gitano", "gitanos", "gitana", "gitanas", "rumano", "rumanos", "rumana", "rumanas", "chino", "chinos", "china", "chinas",
  "asiatico", "asiaticos", "asiatica", "asiaticas", "musulman", "musulmanes", "musulmana", "musulmanas",
  "judio", "judios", "judia", "judias", "gay", "gays", "lesbiana", "lesbianas", "homosexual", "homosexuales",
  "trans", "transexual", "transexuales", "personas de color", "gente de color", "extracomunitario", "extracomunitarios",
];

/** Frases que por sí solas indican un requisito ilegítimo. */
const FORBIDDEN_PHRASES = ["nacionalidad espanola", "de nacionalidad", "origen espanol", "religion catolica", "que sean espanoles"];

const ONLY = "(?:solo|solamente|unicamente|exclusivamente|preferiblemente|preferentemente)";
const FILLER = "(?:(?:para|a|de|con)\\s+)?(?:(?:gente|personas|chicos|chicas|chicos y chicas|inquilinos|inquilinas|companeros|companeras|estudiantes)\\s+)?";
const NEG = "(?:no|sin|ni|abstenerse|abstengase|abstenganse|nada de|no se admiten|no admitimos|no aceptamos|no queremos|no se aceptan)";

const alt = (words: string[]) => words.map((w) => w.replace(/\s+/g, "\\s+")).join("|");

const PATTERNS: RegExp[] = [
  new RegExp(`\\b${ONLY}\\s+${FILLER}(?:${alt(ONLY_GROUPS)})\\b`),
  new RegExp(`\\b${NEG}\\s+${FILLER}(?:${alt(EXCLUDED_GROUPS)})\\b`),
  new RegExp(`\\b(?:${alt(EXCLUDED_GROUPS)})\\s+(?:abstenerse|abstenganse|no|ni hablar)\\b`),
  new RegExp(`\\b(?:${alt(FORBIDDEN_PHRASES)})\\b`),
];

const GENDER_PATTERN =
  /\b(?:solo|solamente|unicamente|exclusivamente)\s+(?:(?:para|a)\s+)?(?:chicas|chicos|mujeres|hombres|varones|ellas|ellos)\b|\b(?:chicas|chicos|mujeres|hombres)\s+(?:unicamente|solamente|exclusivamente)\b/;

/** Minúsculas, sin tildes ni signos y con un solo espacio: "¡SÓLO  Españoles!" → "solo espanoles". */
export function normalizeForMatching(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fragmentos discriminatorios encontrados (normalizados), o [] si no hay. */
export function findDiscriminatoryTerms(text: string): string[] {
  const t = normalizeForMatching(text);
  const found = new Set<string>();
  for (const re of PATTERNS) {
    const m = t.match(re);
    if (m) found.add(m[0]);
  }
  return [...found];
}

export function hasGenderRestriction(text: string) {
  return GENDER_PATTERN.test(normalizeForMatching(text));
}

export const DISCRIMINATION_MESSAGE =
  "No se pueden poner requisitos por origen, nacionalidad, etnia, religión u orientación sexual. Quita la expresión";

/**
 * Esquema Zod del contenido de texto del anuncio. Lo usan publishErrors() (en
 * cliente y en servidor, que es el que manda) y el aviso en vivo del asistente.
 */
export const listingTextSchema = z
  .object({ title: z.string(), description: z.string(), zones: z.array(z.string()) })
  .superRefine((v, ctx) => {
    for (const [field, text] of [
      ["title", v.title],
      ["description", v.description],
      ["zones", v.zones.join(", ")],
    ] as const) {
      const terms = findDiscriminatoryTerms(text);
      if (terms.length) ctx.addIssue({ code: "custom", path: [field], message: `${DISCRIMINATION_MESSAGE} «${terms[0]}».` });
    }
  });
