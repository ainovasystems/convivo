import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { requireSupabase, uniqueEmail } from "./support";

const DIEGO = "a0000000-0000-4000-8000-000000000004";
const ANA = "a0000000-0000-4000-8000-000000000001";
const ELVINA_ROOM = "b0000000-0000-4000-8000-000000000005";

/** Cliente service_role SOLO para preparar datos de prueba (fechas en el pasado). */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function login(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("convivo-dev-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  return page;
}

async function register(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Email").fill(uniqueEmail("e2e"));
  await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
  await page.getByLabel("Tengo 18 años o más.").check();
  await page.getByLabel(/Acepto las condiciones/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/perfil\/editar/);
  return page;
}

async function fillReview(page: Page, criteria: string[], body: string) {
  for (const c of criteria) {
    await page.getByRole("group", { name: c }).getByLabel("5 de 5").check({ force: true });
  }
  await page.getByRole("group", { name: "Valoración general" }).getByLabel("4 de 5").check({ force: true });
  await page.getByLabel("Tu experiencia").fill(body);
  await page.getByRole("button", { name: "Enviar reseña" }).click();
}

test.describe("reseñas con doble ciego", () => {
  // En serie: la prueba de la tarea programada comprueba idempotencia y no debe
  // coincidir con otra prueba que crea estancias a la vez.
  test.describe.configure({ mode: "serial" });
  requireSupabase();
  test.skip(({ browserName }) => !process.env.SUPABASE_SERVICE_ROLE_KEY || browserName !== "chromium");

  test("de la estancia a la reseña publicada, respondida, denunciada y moderada", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "escritorio", "Modifica datos compartidos del seed");
    test.setTimeout(90_000);
    const admin = adminClient();
    const tag = Math.random().toString(36).slice(2, 7);
    const guestName = `Rocío ${tag}`;

    // --- Inquilina nueva + estancia terminada hace 2 días (ventana abierta).
    const guest = await (await browser.newContext()).newPage();
    await guest.goto("/registro");
    await guest.getByLabel("Nombre").fill(guestName);
    await guest.getByLabel("Email").fill(uniqueEmail("resena"));
    await guest.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
    await guest.getByLabel("Tengo 18 años o más.").check();
    await guest.getByLabel(/Acepto las condiciones/).check();
    await guest.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(guest).toHaveURL(/\/perfil\/editar/);
    const guestId = (await guest.getByRole("link", { name: "Mi perfil", exact: true }).getAttribute("href"))!.split("/").pop()!;

    const day = 86_400_000;
    const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
    const { error } = await admin.from("stays").insert({
      listing_id: ELVINA_ROOM,
      host_id: DIEGO,
      guest_id: guestId,
      start_date: iso(-200).slice(0, 10),
      end_date: iso(-2).slice(0, 10),
      status: "ended",
      host_confirmed_at: iso(-200),
      guest_confirmed_at: iso(-200),
      activated_at: iso(-200),
      ended_at: iso(-2),
    });
    expect(error).toBeNull();

    // --- 1. La inquilina reseña a Diego: queda oculta (doble ciego).
    const guestText = `Diego fue muy atento durante toda la estancia y resolvió todo a tiempo. (${tag})`;
    await guest.goto("/mis-resenas");
    await guest.getByRole("link", { name: "Escribir reseña del propietario/a: Diego Fernández" }).click();
    await fillReview(guest, ["Comunicación", "Trato", "Cumplimiento", "Fianza"], guestText);
    await expect(guest.getByRole("status").filter({ hasText: /Se publicará cuando la otra parte opine o el/ })).toBeVisible();

    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`/perfil/${DIEGO}`);
    await expect(anon.getByText(guestText)).toHaveCount(0);

    // --- 2. Diego reseña a la inquilina: se publican las dos.
    const diego = await login(browser, "diego@convivo.test");
    await diego.goto("/mis-resenas");
    await diego.getByRole("link", { name: `Escribir reseña del inquilino/a: ${guestName}` }).click();
    await fillReview(
      diego,
      ["Puntualidad en el pago", "Cuidado de la vivienda", "Convivencia", "Comunicación"],
      `Inquilina ejemplar: puntual, cuidadosa y con muy buena comunicación. (${tag})`,
    );
    await expect(diego.getByRole("status").filter({ hasText: "ya es pública" })).toBeVisible();

    await anon.goto(`/perfil/${DIEGO}`);
    await expect(anon.getByText(guestText)).toBeVisible();
    await anon.goto(`/perfil/${guestId}`);
    await expect(anon.getByRole("region", { name: "Como inquilino/a" }).getByText(/Inquilina ejemplar/)).toBeVisible();

    // --- 3. Diego responde públicamente (una vez).
    await diego.goto(`/perfil/${DIEGO}`);
    await diego.waitForLoadState("networkidle"); // esperar a la hidratación antes de interactuar
    const card = diego.getByRole("listitem").filter({ hasText: guestText });
    await card.getByText("Responder públicamente").click();
    await card.getByLabel("Tu respuesta").fill(`¡Gracias, ${guestName}! Fue un placer.`);
    await card.getByRole("button", { name: "Publicar respuesta" }).click();
    // Al publicarse, la página se revalida y la respuesta sustituye al formulario.
    await expect(card.getByText("Respuesta de la persona reseñada")).toBeVisible({ timeout: 20_000 });
    await anon.goto(`/perfil/${DIEGO}`);
    await expect(anon.getByText(`¡Gracias, ${guestName}! Fue un placer.`)).toBeVisible();

    // --- 4. Un tercero la denuncia por datos personales: se oculta.
    // Usuario nuevo en cada ejecución: hay un límite de 10 denuncias al día.
    const brais = await register(browser, `Testigo ${tag}`);
    await brais.goto(`/perfil/${DIEGO}`);
    await brais.waitForLoadState("networkidle");
    const reported = brais.getByRole("listitem").filter({ hasText: guestText });
    await reported.getByText("Denunciar reseña").click();
    await reported.getByLabel("Motivo").selectOption("personal_data");
    await reported.getByRole("button", { name: "Enviar denuncia" }).click();
    await expect(reported.getByText(/queda oculta hasta que la revisemos/)).toBeVisible();
    await anon.goto(`/perfil/${DIEGO}`);
    await expect(anon.getByText(guestText)).toHaveCount(0);

    // --- 5. Un admin la revisa y descarta la denuncia: vuelve a verse.
    await admin.from("admin_users").upsert({ user_id: ANA });
    const ana = await login(browser, "ana@convivo.test");
    await ana.goto("/admin");
    await ana.waitForLoadState("networkidle");
    const item = ana.getByRole("listitem").filter({ hasText: guestText });
    await item.getByLabel("Nota de la decisión").fill("No contiene datos personales");
    await item.getByRole("button", { name: "Descartar denuncia" }).click();
    // Confirmación o, tras refrescar, desaparece de la lista de denuncias abiertas.
    await expect(async () => {
      const done = (await item.count()) === 0 || (await ana.getByText("Denuncia descartada.").count()) > 0;
      expect(done).toBe(true);
    }).toPass();
    await anon.goto(`/perfil/${DIEGO}`);
    await expect(anon.getByText(guestText)).toBeVisible();

    // Un no admin recibe 404 en /admin.
    await brais.goto("/admin");
    await expect(brais.getByRole("heading", { name: "Moderación" })).toHaveCount(0);
  });

  test("la tarea de avisos exige el secreto y es idempotente", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "escritorio", "Una sola ejecución para comprobar la idempotencia");
    test.skip(!process.env.CRON_SECRET, "Necesita CRON_SECRET");
    expect((await request.get("/api/cron/review-windows")).status()).toBe(401);
    const auth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
    const first = await request.get("/api/cron/review-windows", { headers: auth });
    expect(first.status()).toBe(200);
    const second = await (await request.get("/api/cron/review-windows", { headers: auth })).json();
    expect(second.sent).toBe(0);
  });
});
