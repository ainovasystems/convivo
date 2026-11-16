import { z } from "zod";

/**
 * Control previo de datos personales en texto libre PÚBLICO: anuncios (título,
 * descripción, zonas y barrio), reseñas (y sus respuestas) y biografía del
 * perfil. ÚNICO sitio donde se definen los patrones (como discrimination.ts).
 * Los mensajes del chat NO se tocan: es una conversación privada.
 *
 * Qué se detecta: teléfonos, emails (también «nombre arroba dominio» o «(at)»),
 * DNI/NIE, IBAN y tarjetas, canales de contacto externos (WhatsApp, Telegram,
 * Instagram…) y direcciones exactas (calle con número, piso o puerta).
 * No se detectan nombres propios ni datos de salud: con patrones no es fiable.
 *
 * Regla de oro: lo normal no salta. Precios («450 €»), superficies («12 m²»),
 * fechas, años, códigos postales sueltos y números de habitaciones o plantas
 * no son datos personales. Cada patrón es estricto a propósito y hay tests de
 * ambos lados (tests/unit/personal-data.test.ts).
 *
 * El resultado nunca contiene el dato encontrado: solo el TIPO. Así el mensaje
 * de error no repite lo que el usuario escribió.
 *
 * La base de datos refuerza una parte (reseñas y respuestas, que son
 * inmutables): migración 20261118000100_review_personal_data.sql. Es un
 * respaldo con los patrones más claros (teléfono, email, DNI/NIE, IBAN); si
 * cambias aquí un patrón de esos tipos, revisa también la función
 * private.contains_personal_data.
 */

export type PersonalDataKind = "phone" | "email" | "id" | "payment" | "social" | "address";

/** Dónde se escribe el texto: cambia solo la explicación del porqué. */
export type PersonalDataContext = "listing" | "review" | "profile";

/** Cómo se nombra cada tipo en el mensaje (nunca el dato en sí). */
const KIND_LABEL: Record<PersonalDataKind, string> = {
  phone: "un número de teléfono",
  email: "un email",
  id: "un DNI o NIE",
  payment: "un IBAN o número de tarjeta",
  social: "un enlace o usuario de WhatsApp, Telegram, Instagram u otra red",
  address: "una dirección exacta (calle con número, piso o puerta)",
};

const KIND_ORDER: PersonalDataKind[] = ["phone", "email", "id", "payment", "social", "address"];

/** Todos los mensajes de este control empiezan así (el asistente lo usa para marcarlos en vivo). */
export const PERSONAL_DATA_PREFIX = "Parece que el texto incluye";

const WHY: Record<PersonalDataContext, string> = {
  listing: "Para tu seguridad y la de quien te escribe, el contacto va por el chat de Hommie.",
  review: "Las reseñas son públicas y no se pueden editar después. Cuenta tu experiencia sin datos personales.",
  profile: "Tu perfil es público. Para tu seguridad, el contacto va por el chat de Hommie.",
};

/** Hint breve y visible para anticiparlo en los formularios. */
export const PERSONAL_DATA_HINT = "No incluyas teléfonos, emails ni direcciones exactas: usa el chat.";

// ---------------------------------------------------------------------------
// Normalización: minúsculas y sin tildes, pero conservando signos y números.
// ---------------------------------------------------------------------------

const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const AT = "(?:@|arroba|[\\(\\[\\{]\\s*at\\s*[\\)\\]\\}])";
const DOT = "(?:\\.|\\s+punto\\s+|[\\(\\[\\{]\\s*dot\\s*[\\)\\]\\}])";

const EMAIL_PATTERNS: RegExp[] = [
  // nombre@dominio.com
  /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/,
  // nombre arroba dominio punto com · nombre (at) dominio (dot) com
  new RegExp(`\\b[a-z0-9._-]{2,}\\s*${AT}\\s*[a-z0-9-]{2,}(?:\\s*${DOT}\\s*[a-z]{2,})+`),
  // nombre arroba gmail · nombre (at) hotmail: "arroba" seguido de palabra ya es un contacto
  /\b[a-z0-9._-]{2,}\s*(?:arroba|[\(\[\{]\s*at\s*[\)\]\}])\s*[a-z0-9-]{2,}/,
];

// ---------------------------------------------------------------------------
// Teléfono
// ---------------------------------------------------------------------------

/** Racha de dígitos con separadores típicos de un teléfono (espacio, punto, guion, paréntesis). */
const DIGIT_RUN = /\d(?:(?:[ \t .\-]|\) ?|\( ?| \()?\d)*/g;

const DIGIT_WORDS = "(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)";

function hasPhone(plain: string): boolean {
  for (const m of plain.matchAll(DIGIT_RUN)) {
    const run = m[0];
    const digits = run.replace(/\D/g, "");
    const start = m.index ?? 0;
    const before = plain.slice(Math.max(0, start - 6), start);
    const hasPlus = /\+\s*\(?\s*$/.test(before);
    // Con prefijo internacional (+XX o 00XX) basta una longitud de teléfono.
    if ((hasPlus || digits.startsWith("00")) && digits.length >= 9 && digits.length <= 15) return true;
    // Español: 9 cifras que empiezan por 6, 7, 8 o 9, con o sin 34 / 0034 delante.
    const national = digits.replace(/^(?:0034|34)(?=[6-9]\d{8}$)/, "");
    if (/^[6-9]\d{8}$/.test(national)) return true;
  }
  // Escrito con letras: "seis cero cero uno dos tres cuatro cinco seis".
  return new RegExp(`(?:\\b${DIGIT_WORDS}\\b[\\s,.\\-]*){8,}`).test(plain);
}

// ---------------------------------------------------------------------------
// DNI / NIE
// ---------------------------------------------------------------------------

const DNI_LETTERS = "trwagmyfpdxbnjzsqvhlcke";
const ID_PATTERNS: RegExp[] = [
  // 12345678Z · 12.345.678-Z · 12 345 678 Z
  new RegExp(`(?<![a-z0-9])\\d{2}[. ]?\\d{3}[. ]?\\d{3}[ -]?[${DNI_LETTERS}](?![a-z0-9])`),
  // X1234567L · X-1234567-L · Y 1234567 L
  /(?<![a-z0-9])[xyz][ .-]?\d{7}[ .-]?[a-z](?![a-z0-9])/,
];

// ---------------------------------------------------------------------------
// IBAN y tarjetas
// ---------------------------------------------------------------------------

function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}

function hasIban(plain: string): boolean {
  const upper = plain.toUpperCase();
  // ES + 22 cifras (con espacios o guiones entre grupos): clarísimo, sin validar el dígito de control.
  for (const m of upper.matchAll(/(?<![A-Z0-9])ES\d{2}(?:[ -]?\d){20}(?!\d)/g)) if (m) return true;
  // Otros países: grupos de 4 y dígito de control correcto (mod 97).
  for (const m of upper.matchAll(/(?<![A-Z0-9])[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){2,7}(?:[ -]?[A-Z0-9]{1,3})?(?![A-Z0-9])/g)) {
    const clean = m[0].replace(/[ -]/g, "");
    if (clean.length >= 15 && clean.length <= 34 && mod97(clean) === 1) return true;
  }
  return false;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function hasCard(plain: string): boolean {
  for (const m of plain.matchAll(/\d(?:[ -]?\d)*/g)) {
    const run = m[0];
    const digits = run.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    // Grupos de al menos 4 cifras (4-4-4-4, 4-6-5…) o todo seguido: así una racha de fechas no cuenta.
    const groups = run.split(/[ -]/);
    if (groups.length > 1 && groups.some((g) => g.length < 4)) continue;
    if (luhn(digits)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Canales de contacto externos
// ---------------------------------------------------------------------------

const SOCIAL_DOMAINS = [
  "wa\\.me", "api\\.whatsapp\\.com", "chat\\.whatsapp\\.com", "whatsapp\\.com",
  "t\\.me", "telegram\\.(?:me|org|dog)", "instagram\\.com", "instagr\\.am", "ig\\.me",
  "facebook\\.com", "fb\\.me", "fb\\.com", "m\\.me", "messenger\\.com",
  "tiktok\\.com", "snapchat\\.com", "signal\\.(?:me|group)", "discord\\.(?:gg|com)",
  "twitter\\.com", "x\\.com", "linktr\\.ee", "linkedin\\.com", "bit\\.ly",
];

const SOCIAL_PATTERNS: RegExp[] = [
  new RegExp(`(?<![a-z0-9.-])(?:https?:\\/\\/)?(?:www\\.)?(?:${SOCIAL_DOMAINS.join("|")})(?![a-z0-9-])`),
  // Usuario suelto tipo @nombre.apellido (no se confunde con un email: no hay nada pegado delante).
  /(?<![a-z0-9._%+-])@[a-z0-9][a-z0-9._]{2,}/,
];

// ---------------------------------------------------------------------------
// Direcciones exactas
// ---------------------------------------------------------------------------

const STREET_TYPES = [
  "calle", "c\\/", "cl\\.?", "avenida", "avda\\.?", "avd\\.?", "av\\.", "paseo", "plaza", "pza\\.?", "pl\\.",
  "camino", "carretera", "ctra\\.?", "travesia", "ronda", "rua", "praza", "estrada", "urbanizacion", "glorieta",
  "callejon", "avenida", "via",
];

/** Después del número de portal NO puede venir una unidad: «Calle Real 2 habitaciones» no es una dirección. */
const NOT_A_PORTAL_NUMBER =
  "(?!\\s*(?:€|euros?\\b|m\\b|m2|m²|metros|min\\b|mins\\b|minutos|horas?\\b|habitaciones|habitacion|hab\\b|banos?\\b|dormitorios?|personas|plantas?\\b|paradas?|km\\b|kilometros|anos|meses|dias|\\d))";

const NUM = "(?:n(?:[.\\s]*[º°o])?\\.?\\s*|num(?:ero)?\\.?\\s*)?";
// Nombre de calle de 1 a 4 palabras, con o sin coma, y número.
const STREET_PATTERN = new RegExp(
  `(?<![a-z0-9])(?:${STREET_TYPES.join("|")})\\s*(?:[a-zñ.'-]+\\s+){0,4}?[a-zñ.'-]+\\s*,?\\s*${NUM}\\d{1,4}(?:\\s*[-/]\\s*\\d{1,3})?(?![\\d,.]*\\d)${NOT_A_PORTAL_NUMBER}`,
);

const ORDINAL = "[º°ª]";
// Los patrones de piso y puerta distinguen mayúsculas (se evalúan sobre el texto sin minúsculas forzadas).
const FLOOR_DOOR_PATTERNS: RegExp[] = [
  // 3º A · 4ºB · 1º izquierda · 2º dcha
  new RegExp(`(?<![A-Za-z0-9])\\d{1,2}\\s*${ORDINAL}\\s*[,.\\- ]?\\s*(?:[A-Z]\\b|izq(?:uierda|da)?\\b|izda\\b|dcha\\b|drcha\\b|derecha\\b|centro\\b|ext(?:erior)?\\b|int(?:erior)?\\b)`),
  // 3º b (minúscula) solo si no es una palabra normal que sigue ("1º a la derecha")
  new RegExp(`(?<![A-Za-z0-9])\\d{1,2}\\s*${ORDINAL}\\s*[a-d]\\b(?!\\s+(?:la|el|los|las|de|del|y|o|en|con|por|para|al|un|una)\\b)`),
  // piso 3, puerta B · planta 2 puerta 4 · escalera 1, piso 2
  /\b(?:piso|planta|escalera|esc\.|portal)\s+\d{1,2}\s*[ºª°]?\s*[,.\- ]\s*(?:puerta|pta\.?|letra|escalera|esc\.|piso|portal)\b/i,
  // puerta B · puerta 12 · pta. 3 · portal 4 · escalera B (la letra, en mayúscula, o número)
  /\b(?:[Pp]uerta|[Pp]ta\.|[Pp]ortal|[Ee]scalera|[Ee]sc\.)\s+(?:\d{1,2}[A-Z]?|[A-Z])\b/,
  // piso 3B · planta 2 A
  /\b(?:[Pp]iso|[Pp]lanta)\s+\d{1,2}\s*[A-Z]\b/,
];

function hasAddress(plain: string, lower: string): boolean {
  if (STREET_PATTERN.test(lower)) return true;
  return FLOOR_DOOR_PATTERNS.some((re) => re.test(plain));
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Tipos de dato personal encontrados en el texto (nunca el dato), en orden fijo. [] si no hay. */
export function findPersonalData(text: string): PersonalDataKind[] {
  const plain = stripAccents(text);
  const lower = plain.toLowerCase();
  const found = new Set<PersonalDataKind>();
  if (hasPhone(lower)) found.add("phone");
  if (EMAIL_PATTERNS.some((re) => re.test(lower))) found.add("email");
  if (ID_PATTERNS.some((re) => re.test(lower))) found.add("id");
  if (hasIban(lower) || hasCard(lower)) found.add("payment");
  if (SOCIAL_PATTERNS.some((re) => re.test(lower))) found.add("social");
  if (hasAddress(plain, lower)) found.add("address");
  return KIND_ORDER.filter((k) => found.has(k));
}

/** Mensaje en castellano claro: qué quitar y por qué. No repite el dato. */
export function personalDataMessage(kinds: PersonalDataKind[], context: PersonalDataContext): string {
  const list = kinds.map((k) => KIND_LABEL[k]);
  const what = list.length > 1 ? `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}` : list[0];
  return `${PERSONAL_DATA_PREFIX} ${what}. Quítalo. ${WHY[context]}`;
}

/** Mensaje de error si el texto lleva datos personales; null si está limpio. */
export function personalDataError(text: string, context: PersonalDataContext): string | null {
  const kinds = findPersonalData(text);
  return kinds.length ? personalDataMessage(kinds, context) : null;
}

/** Zod: texto libre sin datos personales (para reseñas, respuestas y biografía). */
export function withoutPersonalData<T extends z.ZodType<string | null>>(schema: T, context: PersonalDataContext) {
  return schema.superRefine((value, ctx) => {
    if (!value) return;
    const message = personalDataError(value, context);
    if (message) ctx.addIssue({ code: "custom", message });
  });
}

/**
 * Esquema del texto público de un anuncio. Lo usa listingTextErrors() (cliente
 * y servidor, que es el que manda) y el aviso en vivo del asistente.
 */
export const listingPersonalDataSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    zones: z.array(z.string()),
    neighborhood: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    for (const [field, text] of [
      ["title", v.title],
      ["description", v.description],
      ["zones", v.zones.join(", ")],
      ["neighborhood", v.neighborhood ?? ""],
    ] as const) {
      const message = personalDataError(text, "listing");
      if (message) ctx.addIssue({ code: "custom", path: [field], message });
    }
  });
