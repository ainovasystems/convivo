import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser } from "@playwright/test";

import { requireSupabase, uniqueEmail } from "./support";

/** Arreglos de la auditoría 3: registro (I10), retirada de una reseña propia (I11) y denuncias (I13). */

const DIEGO = "a0000000-0000-4000-8000-000000000004";
const ANA = "a0000000-0000-4000-8000-000000000001";
const ELVINA_ROOM = "b0000000-0000-4000-8000-000000000005";
const SIGN_UP_SENT = "Te hemos enviado un email para continuar. Abre el enlace para confirmar tu cuenta.";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function mailpitSubjects(): Promise<string[]> {
  const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/messages?limit=200`);
  const json = (await res.json()) as { messages: Array<{ Subject: string }> };
  return json.messages.map((m) => m.Subject);
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

test.describe("registro sin enumeración de cuentas (I10)", () => {
  requireSupabase();

  test("con un email que ya tiene cuenta sale el mensaje único, con salida a entrar y a recuperar la contraseña", async ({ page }) => {
    // Cuenta nueva en cada ejecución: hay un límite de 3 registros por email y hora.
    const email = uniqueEmail("repetido");
    const fill = async (name: string) => {
      await page.goto("/registro");
      await page.getByLabel("Nombre").fill(name);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
      await page.getByLabel("Tengo 18 años o más.").check();
      await page.getByLabel(/Acepto las condiciones/).check();
      await page.getByRole("button", { name: "Crear cuenta" }).click();
    };
    await fill("Primera Vez");
    // En local la confirmación de email está desactivada: se entra directamente.
    await expect(page).toHaveURL(/\/perfil\/editar/);
    await page.context().clearCookies();

    // Alguien vuelve a registrarse con ese mismo email.
    await fill("Segunda Vez");

    // El mismo texto que ve quien se registra con un email nuevo (ver tests/unit/audit-block3.test.ts).
    await expect(page.getByRole("status").filter({ hasText: SIGN_UP_SENT })).toBeVisible();
    await expect(page.getByText(/Ya existe una cuenta/)).toHaveCount(0);
    await expect(page.getByText(/No hemos podido crear la cuenta/)).toHaveCount(0);
    await expect(page).toHaveURL(/\/registro$/);
    // Quien ya tenía cuenta no se queda sin salida.
    await expect(page.getByRole("link", { name: "entra desde aquí" })).toHaveAttribute("href", "/entrar");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
  });
});

test.describe("denuncias: solo enlaces de Hommie (I13)", () => {
  requireSupabase();

  test("un enlace ajeno o un texto no se envían y se dice qué falta; un enlace de la web, sí", async ({ page, baseURL }) => {
    await page.goto("/denunciar");
    await page.waitForLoadState("networkidle");
    const link = page.getByLabel("Enlace al contenido");
    const sent = page.getByRole("status").filter({ hasText: "Tu referencia es" });

    // Aviso inmediato al salir del campo.
    await link.fill("https://www.google.com/");
    await link.blur();
    await expect(page.locator("#url-error")).toContainText("Ese enlace no es de Hommie");

    await page.getByLabel("Qué es ilegal y por qué").fill("Me pidieron la fianza por adelantado antes de ver la habitación.");
    await page.getByLabel("Tu nombre").fill("Rosa Notificante");
    await page.getByLabel("Tu email").fill(uniqueEmail("denuncia"));
    await page.getByLabel(/Declaro de buena fe/).check();

    // El servidor tampoco lo acepta: no hay referencia y el campo sigue marcado.
    await page.getByRole("button", { name: "Enviar notificación" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "la notificación no se ha enviado" })).toBeVisible();
    await expect(page.locator("#url-error")).toContainText("Ese enlace no es de Hommie");
    await expect(sent).toHaveCount(0);
    await expect(link).toHaveValue("https://www.google.com/");
    await page.waitForLoadState("networkidle");

    // Un texto que no es un enlace.
    await link.fill("el anuncio de la habitación de Lugo");
    await page.getByLabel("Motivo").selectOption("fraud");
    await page.getByLabel("Qué es ilegal y por qué").fill("Me pidieron la fianza por adelantado antes de ver la habitación.");
    await page.getByLabel(/Declaro de buena fe/).check();
    await page.getByRole("button", { name: "Enviar notificación" }).click();
    await expect(page.locator("#url-error")).toContainText("Eso no es un enlace");
    await expect(sent).toHaveCount(0);

    // Con un enlace de esta web, se registra.
    await link.fill(`${baseURL}/anuncios/${ELVINA_ROOM}`);
    await page.getByLabel("Motivo").selectOption("fraud");
    await page.getByLabel("Qué es ilegal y por qué").fill("Me pidieron la fianza por adelantado antes de ver la habitación.");
    await page.getByLabel(/Declaro de buena fe/).check();
    await page.getByRole("button", { name: "Enviar notificación" }).click();
    await expect(sent).toBeVisible();
  });
});

test.describe("solicitar la retirada de una reseña propia (I11)", () => {
  requireSupabase();
  test.skip(({ browserName }) => !process.env.SUPABASE_SERVICE_ROLE_KEY || browserName !== "chromium");

  test("la autora la solicita con motivo, la reseña sigue igual, y el admin primero la rechaza y después la retira", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "escritorio", "Basta con un navegador para el circuito de moderación.");
    test.setTimeout(120_000);
    const admin = adminClient();
    const tag = Math.random().toString(36).slice(2, 7);

    // --- Inquilina nueva, con una estancia terminada y su reseña escrita.
    const guest = await (await browser.newContext()).newPage();
    await guest.goto("/registro");
    await guest.getByLabel("Nombre").fill(`Noa ${tag}`);
    await guest.getByLabel("Email").fill(uniqueEmail("retirada"));
    await guest.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
    await guest.getByLabel("Tengo 18 años o más.").check();
    await guest.getByLabel(/Acepto las condiciones/).check();
    await guest.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(guest).toHaveURL(/\/perfil\/editar/);
    const guestId = (await guest.getByRole("link", { name: "Mi perfil", exact: true }).getAttribute("href"))!.split("/").pop()!;

    const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();
    const { error } = await admin.from("stays").insert({
      listing_id: ELVINA_ROOM, host_id: DIEGO, guest_id: guestId,
      start_date: iso(-200).slice(0, 10), end_date: iso(-2).slice(0, 10), status: "ended",
      host_confirmed_at: iso(-200), guest_confirmed_at: iso(-200), activated_at: iso(-200), ended_at: iso(-2),
    });
    expect(error).toBeNull();

    const text = `Diego fue muy atento durante toda la estancia y resolvió todo a tiempo. (${tag})`;
    await guest.goto("/mis-resenas");
    await guest.getByRole("link", { name: "Escribir reseña del propietario/a: Diego Fernández" }).click();
    for (const c of ["Comunicación", "Trato", "Cumplimiento", "Fianza"]) {
      await guest.getByRole("group", { name: c }).getByLabel("5 de 5").check({ force: true });
    }
    await guest.getByRole("group", { name: "Valoración general" }).getByLabel("4 de 5").check({ force: true });
    await guest.getByLabel("Tu experiencia").fill(text);
    await guest.getByRole("button", { name: "Enviar reseña" }).click();
    await expect(guest).toHaveURL(/\/mis-resenas\?enviada=/);
    await guest.waitForLoadState("networkidle");

    // --- 1. Solicita la retirada: sin motivo no se envía; con motivo, sí. La reseña NO se borra.
    const mine = guest.getByRole("listitem").filter({ hasText: text });
    await mine.getByText("Solicitar retirada").click();
    await mine.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(mine.getByText(/Explica por qué quieres retirarla/)).toBeVisible();
    await mine.getByLabel("¿Por qué quieres retirarla?").fill("Me equivoqué de persona al escribirla.");
    await mine.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(mine.getByText(/Solicitud enviada|Retirada solicitada el/)).toBeVisible();
    await guest.reload();
    await expect(mine.getByText(/Retirada solicitada el .* Pendiente de revisión/)).toBeVisible();
    await expect(mine.getByText(text)).toBeVisible();
    await expect(mine.getByText("Solicitar retirada", { exact: true })).toHaveCount(0);
    const review = async () =>
      (await admin.from("reviews").select("id, body, deleted_at, deletion_reason").eq("author_id", guestId).single()).data!;
    expect(await review()).toMatchObject({ body: text, deleted_at: null });

    // --- 2. El admin la ve con el resto de casos y la rechaza con motivo.
    await admin.from("admin_users").upsert({ user_id: ANA });
    const ana = await login(browser, "ana@convivo.test");
    await ana.goto("/admin");
    await ana.waitForLoadState("networkidle");
    const item = ana.getByRole("listitem").filter({ hasText: text });
    await expect(item.getByText("Solicitud de retirada de quien escribió la reseña")).toBeVisible();
    await expect(item.getByText("«Me equivoqué de persona al escribirla.»")).toBeVisible();
    await item.getByLabel(/Motivo de la decisión/).fill("La reseña describe una estancia real.");
    let decided = ana.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin");
    await item.getByRole("button", { name: "Rechazar solicitud" }).click();
    expect((await decided).ok()).toBe(true);
    const requests = async () =>
      (await admin.from("reports").select("status").eq("reporter_id", guestId).order("created_at")).data?.map((r) => r.status);
    await expect.poll(requests).toEqual(["dismissed"]);
    expect(await review()).toMatchObject({ body: text, deleted_at: null });

    // La autora recibe la decisión en la app (y por email) y la reseña sigue ahí.
    await guest.goto("/avisos");
    await expect(guest.getByText("No hemos retirado tu reseña")).toBeVisible();
    await expect(guest.getByText(/La reseña describe una estancia real\./)).toBeVisible();
    if (process.env.MAILPIT_URL) await expect.poll(mailpitSubjects).toContainEqual("No hemos retirado tu reseña en Hommie");
    await guest.goto("/mis-resenas");
    await guest.waitForLoadState("networkidle");
    await expect(mine.getByText(text)).toBeVisible();
    await expect(mine.getByText(/no la hemos retirado/)).toBeVisible();

    // --- 3. Lo vuelve a pedir y ahora el admin la retira.
    await mine.getByText("Solicitar retirada").click();
    await mine.getByLabel("¿Por qué quieres retirarla?").fill("Confundí el piso: la estancia que describo fue en otro anuncio.");
    await mine.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect.poll(requests).toEqual(["dismissed", "open"]);

    await ana.goto("/admin");
    await ana.waitForLoadState("networkidle");
    await item.getByLabel(/Motivo de la decisión/).fill("Confirmado: la reseña era de otra estancia.");
    decided = ana.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin");
    await item.getByRole("button", { name: "Retirar reseña" }).click();
    expect((await decided).ok()).toBe(true);
    await expect.poll(requests).toEqual(["dismissed", "resolved"]);
    const removed = await review();
    expect(removed.body).toBeNull();
    expect(removed.deleted_at).not.toBeNull();
    expect(removed.deletion_reason).toBe("Retirada a petición de quien la escribió: Confirmado: la reseña era de otra estancia.");

    await guest.goto("/mis-resenas");
    const gone = guest.getByRole("listitem").filter({ hasText: "Retirada a petición de quien la escribió" });
    await expect(gone.getByText("Eliminada", { exact: true })).toBeVisible();
    await expect(guest.getByText(text)).toHaveCount(0);
    await expect(gone.getByText("Solicitar retirada")).toHaveCount(0);
    await guest.goto("/avisos");
    await expect(guest.getByText("Hemos retirado tu reseña, como solicitaste")).toBeVisible();
    await expect(guest.getByText("Hemos eliminado una de tus reseñas")).toHaveCount(0);
    if (process.env.MAILPIT_URL) await expect.poll(mailpitSubjects).toContainEqual("Hemos retirado tu reseña en Hommie");
  });
});
