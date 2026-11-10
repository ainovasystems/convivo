// Auditoría de la Fase 7: capturas en móvil (375 px) y axe de TODAS las pantallas,
// públicas y con sesión. SOLO MIDE: no corrige nada.
//
// Necesita: Supabase local con el seed, la web arrancada (`npm run build && npm start`),
// .env.local cargado y axe-core instalado en una carpeta aparte:
//   AXE_PATH=/ruta/a/node_modules/axe-core/axe.min.js node scripts/auditoria/pantallas.mjs
// Crea datos de ejemplo en la base LOCAL (un contrato firmado y su inventario) para poder
// ver esas pantallas. Nunca contra producción: se niega si la URL no es local.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

import { chromium } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3000";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !/127\.0\.0\.1|localhost/.test(SB)) throw new Error("Solo contra el Supabase local.");
const AXE = readFileSync(process.env.AXE_PATH ?? "node_modules/axe-core/axe.min.js", "utf8");
const OUT = "docs/capturas-fase-7";
mkdirSync(OUT, { recursive: true });

const rest = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!r.ok) throw new Error(`${path}: ${await r.text()}`);
  return r.json();
};

const browser = await chromium.launch();
const ctx = async () =>
  browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "es-ES",
    bypassCSP: true, // solo para inyectar axe
  });

const results = [];
let n = 0;

async function shot(page, slug, titulo, { full = true } = {}) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
  const file = `${String(++n).padStart(2, "0")}-${slug}.png`;
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: full });
  await page.evaluate(AXE);
  const axe = await page.evaluate(() =>
    // eslint-disable-next-line no-undef
    axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }),
  );
  const horizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const smallTargets = await page.evaluate(() => {
    let c = 0;
    for (const el of document.querySelectorAll("a, button, input, select, textarea, summary")) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.width < 24 || r.height < 24) && getComputedStyle(el).visibility !== "hidden") c++;
    }
    return c;
  });
  results.push({
    file,
    slug,
    titulo,
    url: page.url().replace(BASE, ""),
    horizontalScroll,
    smallTargets,
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 2).map((x) => x.target.join(" ")),
    })),
  });
  console.log(file, titulo, "→", axe.violations.length, "tipos de fallo de axe");
}

async function login(page, email) {
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("convivo-dev-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: "Salir" }).waitFor();
}

const id = (q) => rest(q).then((r) => r[0]);
const listings = await rest("listings?select=id,kind,city,owner_id,status&status=eq.active");
const roomLugo = listings.find((l) => l.kind === "room" && l.city === "Lugo").id;
const flat = listings.find((l) => l.kind === "flat").id;
const seeking = listings.find((l) => l.kind === "seeking").id;

// ---------- Visitante (sin sesión) ----------
{
  const page = await (await ctx()).newPage();
  const pub = [
    ["inicio", "Inicio", "/"],
    ["buscar", "Búsqueda de anuncios", "/anuncios"],
    ["buscar-filtrada", "Búsqueda filtrada (Lugo, hasta 300 €)", "/anuncios?ciudad=Lugo&precio_max=300"],
    ["buscar-sin-resultados", "Búsqueda sin resultados", "/anuncios?ciudad=Zamora&precio_max=50"],
    ["ciudad-habitaciones-lugo", "Página de ciudad: habitaciones en Lugo", "/habitaciones/lugo"],
    ["ciudad-pisos-coruna", "Página de ciudad: pisos en A Coruña", "/pisos/a-coruna"],
    ["ciudad-vacia", "Página de ciudad sin anuncios (pisos en Barcelona)", "/pisos/barcelona"],
    ["ficha-habitacion", "Ficha de habitación (sin sesión)", `/anuncios/${roomLugo}`],
    ["ficha-piso", "Ficha de piso entero", `/anuncios/${flat}`],
    ["ficha-busco", "Ficha «busco compañero»", `/anuncios/${seeking}`],
    ["perfil-publico", "Perfil público", "/perfil/a0000000-0000-4000-8000-000000000001"],
    ["entrar", "Entrar", "/entrar"],
    ["registro", "Crear cuenta", "/registro"],
    ["privacidad", "Privacidad (borrador)", "/privacidad"],
    ["terminos", "Condiciones (borrador)", "/terminos"],
    ["denunciar", "Denunciar contenido (DSA)", "/denunciar"],
    ["estado", "Estado del servicio", "/estado"],
    ["404", "Página no encontrada", "/esta-pagina-no-existe"],
  ];
  for (const [slug, t, path] of pub) {
    await page.goto(BASE + path);
    await shot(page, slug, t);
  }
  // Menú de filtros en móvil ya abierto por defecto; error de validación en el registro
  await page.goto(`${BASE}/registro`);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await shot(page, "registro-errores", "Crear cuenta con errores de validación");
}

// ---------- Brais (inquilino de una estancia terminada) ----------
{
  const page = await (await ctx()).newPage();
  await login(page, "brais@convivo.test");
  for (const [slug, t, path] of [
    ["sesion-inicio", "Inicio con sesión iniciada", "/"],
    ["sesion-ficha-habitacion", "Ficha con sesión: formulario «Me interesa»", `/anuncios/${roomLugo}`],
    ["mis-resenas", "Mis reseñas", "/mis-resenas"],
    ["mis-estancias", "Mis estancias", "/mis-estancias"],
    ["mensajes", "Mensajes (bandeja)", "/mensajes"],
    ["perfil-editar", "Editar perfil", "/perfil/editar"],
    ["cuenta", "Mi cuenta y mis datos", "/cuenta"],
    ["contratos-vacio", "Mis contratos (vacío)", "/contratos"],
    ["publicar-tipo", "Publicar: elegir tipo", "/publicar"],
  ]) {
    await page.goto(BASE + path);
    await shot(page, slug, t);
  }
}

// ---------- Reseña pendiente: el primer usuario del seed que tenga alguna ----------
{
  for (const email of ["diego", "elena", "ana", "carla", "hugo", "gemma", "farid"]) {
    const page = await (await ctx()).newPage();
    await login(page, `${email}@convivo.test`);
    await page.goto(`${BASE}/mis-resenas`);
    const write = page.getByRole("link", { name: /^Escribir/ }).first();
    if (await write.count()) {
      await shot(page, "mis-resenas-pendientes", `Mis reseñas con reseñas pendientes (${email})`);
      await write.click();
      await shot(page, "resena-nueva", "Escribir una reseña");
      await page.close();
      break;
    }
    await page.close();
  }
}

// ---------- Ana (casera de Lugo; la hacemos admin para ver /admin) ----------
{
  await rest("admin_users", { method: "POST", body: JSON.stringify({ user_id: "a0000000-0000-4000-8000-000000000001" }), headers: { Prefer: "resolution=ignore-duplicates" } }).catch(() => {});
  const page = await (await ctx()).newPage();
  await login(page, "ana@convivo.test");
  for (const [slug, t, path] of [
    ["mis-anuncios", "Mis anuncios", "/mis-anuncios"],
    ["publicar-datos", "Asistente de publicación: datos", `/publicar/${roomLugo}?paso=datos`],
    ["publicar-fotos", "Asistente de publicación: fotos", `/publicar/${roomLugo}?paso=fotos`],
    ["publicar-revision", "Asistente de publicación: revisión", `/publicar/${roomLugo}?paso=revision`],
    ["perfil-propio", "Perfil propio", "/perfil"],
    ["admin", "Moderación (admin)", "/admin"],
  ]) {
    await page.goto(BASE + path);
    await shot(page, slug, t);
  }
  await page.goto(`${BASE}/publicar`);
  await page.getByRole("button", { name: /Habitación/ }).first().click();
  await page.waitForURL(/\/publicar\/[0-9a-f-]{36}/);
  await shot(page, "publicar-borrador-nuevo", "Asistente: borrador nuevo, vacío");
  await page.goto(page.url().replace(/paso=\w+/, "paso=revision").replace(/\?.*$/, "") + "?paso=revision");
  await shot(page, "publicar-con-errores", "Asistente: revisión de un borrador vacío (qué falta para publicar)");
}

// ---------- Circuito del contrato: Lara (inquilina nueva) y Diego (casero) ----------
{
  const suffix = Math.random().toString(36).slice(2, 7);
  const legal = `Lara ${suffix} Pérez Gómez`;
  const guest = await (await ctx()).newPage();
  await guest.goto(`${BASE}/registro`);
  await guest.getByLabel("Nombre").fill(`Lara ${suffix}`);
  await guest.getByLabel("Email").fill(`auditoria.${Date.now()}@convivo.test`);
  await guest.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
  await guest.getByLabel("Tengo 18 años o más.").check();
  await guest.getByLabel(/Acepto las condiciones/).check();
  await guest.getByRole("button", { name: "Crear cuenta" }).click();
  await guest.waitForURL(/\/perfil\/editar/);
  await shot(guest, "perfil-editar-nuevo", "Perfil recién creado (primer paso tras registrarse)");

  const L = `${BASE}/anuncios/b0000000-0000-4000-8000-000000000005`;
  await guest.goto(L);
  await guest.getByLabel(/Escribe a Diego/).fill("Hola Diego, soy estudiante y me interesa la habitación para todo el curso.");
  await guest.getByRole("button", { name: "Me interesa" }).click();
  await guest.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  const conv = guest.url();
  await shot(guest, "chat-pendiente", "Conversación (interesado, pendiente de respuesta)");

  const host = await (await ctx()).newPage();
  await login(host, "diego@convivo.test");
  await host.goto(conv);
  await host.getByRole("button", { name: "Aceptar interés" }).click();
  await host.getByText(/Interés\s+aceptado/).waitFor();
  await host.reload();
  await shot(host, "chat-aceptado", "Conversación (casero, interés aceptado)");
  await host.goto(`${BASE}/mensajes`);
  await shot(host, "mensajes-con-conversaciones", "Bandeja de mensajes con conversaciones");

  await host.goto(conv);
  await host.getByRole("button", { name: "Preparar contrato" }).click();
  await host.waitForURL(/\/contratos\/[0-9a-f-]{36}$/);
  const contract = host.url();
  await host.getByLabel(/Tu nombre y apellidos/).fill("Diego Fernández Castro");
  await host.getByLabel(/Nombre y apellidos de la parte arrendataria/).fill(legal);
  await shot(host, "contrato-borrador", "Contrato: editor del borrador (casero)");
  await host.getByRole("button", { name: "Enviar para firmar" }).click();
  await host.getByText("Pendiente de firma").first().waitFor();
  await shot(host, "contrato-enviado-casero", "Contrato enviado (vista del casero)");

  await guest.goto(contract);
  await shot(guest, "contrato-por-firmar", "Contrato por firmar (vista del inquilino)");
  await guest.getByLabel("Escribe tu nombre completo").fill(legal);
  await guest.getByLabel(/He leído el contrato completo/).check();
  await guest.getByRole("button", { name: "Firmar" }).click();
  await guest.getByText("Ya has firmado. Falta que firme la otra parte.").waitFor();
  await host.reload();
  await host.getByLabel("Escribe tu nombre completo").fill("Diego Fernández Castro");
  await host.getByLabel(/He leído el contrato completo/).check();
  await host.getByRole("button", { name: "Firmar" }).click();
  await host.getByText("Firmado por las dos partes.").waitFor();
  await shot(host, "contrato-firmado", "Contrato firmado por las dos partes (+ guía de la fianza)");
  await host.goto(`${BASE}/contratos`);
  await shot(host, "contratos-lista", "Mis contratos (con un contrato firmado)");

  await guest.goto(`${contract}/inventario/entrada`);
  await guest.getByRole("button", { name: "Empezar el inventario" }).click();
  await shot(guest, "inventario-vacio", "Inventario de entrada recién abierto");
  await guest.getByLabel("Zona").fill("Habitación");
  await guest.getByLabel("Elemento", { exact: true }).fill("Colchón");
  await guest.getByLabel("Estado").selectOption("good");
  await guest.getByLabel(/Fotos/).setInputFiles("tests/e2e/fixtures/piso.png");
  await guest.getByAltText("Foto 1 sin guardar").waitFor();
  await guest.getByRole("button", { name: "Añadir al inventario" }).click();
  await guest.getByAltText("Colchón, foto 1").waitFor();
  await shot(guest, "inventario-con-elementos", "Inventario de entrada con un elemento");
  await guest.getByRole("button", { name: /Confirmo que el inventario es correcto/ }).click();
  await guest.getByText("Ya lo has confirmado.").waitFor();
  await host.goto(`${contract}/inventario/entrada`);
  await host.getByRole("button", { name: /Confirmo que el inventario es correcto/ }).click();
  await host.getByText(/Confirmado por las dos partes el/).waitFor();
  await shot(host, "inventario-bloqueado", "Inventario de entrada confirmado y bloqueado");
  await host.goto(`${contract}/inventario/salida`);
  await host.getByRole("button", { name: "Empezar el inventario" }).click();
  await host.getByRole("button", { name: /Copiar los elementos del inventario de entrada/ }).click();
  await host.getByText("A la entrada: Buen estado").waitFor();
  await shot(host, "inventario-salida", "Inventario de salida con comparación");

  await guest.goto(`${BASE}/mis-estancias`);
  await shot(guest, "mis-estancias-activa", "Mis estancias con una estancia activa");
  await guest.goto(`${BASE}/cuenta`);
}

writeFileSync(`${OUT}/axe-resultados.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log("Hecho:", results.length, "pantallas");
