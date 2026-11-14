import { expect, test, type Browser, type Page } from "@playwright/test";

import { requireSupabase, uniqueEmail } from "./support";

// Habitación en Elviña (A Coruña) del seed, de Diego.
const LISTING = "/anuncios/b0000000-0000-4000-8000-000000000005";
const ADDRESS = "Rúa da Fraga 3";

async function newUserPage(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Email").fill(uniqueEmail("flujo"));
  await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
  await page.getByLabel("Tengo 18 años o más.").check();
  await page.getByLabel(/Acepto las condiciones/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/perfil\/editar/);
  return page;
}

async function loginPage(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("convivo-dev-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  return page;
}

async function mailpitSubjects(): Promise<string[]> {
  const base = process.env.MAILPIT_URL;
  if (!base) return [];
  const res = await fetch(`${base}/api/v1/messages?limit=200`);
  const json = (await res.json()) as { messages: Array<{ Subject: string }> };
  return json.messages.map((m) => m.Subject);
}

test.describe("interés → conversación → estancia confirmada", () => {
  requireSupabase();

  test("flujo completo con dos usuarios", async ({ browser }) => {
    const guestName = `Inés ${Math.random().toString(36).slice(2, 7)}`;
    const guest: Page = await newUserPage(browser, guestName);

    // 1. El inquilino muestra interés con un mensaje.
    await guest.goto(LISTING);
    await expect(guest.getByText(ADDRESS)).toHaveCount(0);
    await guest.getByLabel(/Escribe a Diego/).fill("Corto");
    await guest.getByRole("button", { name: "Me interesa" }).click();
    await expect(guest.getByText("Cuéntale algo más: mínimo 20 caracteres")).toBeVisible();
    await guest
      .getByLabel(/Escribe a Diego/)
      .fill("Hola Diego, soy estudiante de Informática en Elviña y busco habitación para el próximo mes.");
    await guest.getByRole("button", { name: "Me interesa" }).click();
    await expect(guest).toHaveURL(/\/mensajes\/[0-9a-f-]{36}$/);
    const conversationUrl = guest.url();
    await expect(guest.getByRole("note").filter({ hasText: "Nunca pagues antes de ver el piso." })).toBeVisible();

    // 2. El propietario lo ve en su bandeja con contador de no leídos y le llega un email.
    const host = await loginPage(browser, "diego@convivo.test");
    await expect(host.getByRole("link", { name: /Mensajes.*sin leer|sin leer.*Mensajes/ }).first()).toBeVisible();
    await host.goto("/mensajes");
    await host.getByRole("link", { name: new RegExp(`${guestName}.*sin leer`) }).click();
    await expect(host).toHaveURL(conversationUrl);
    await expect(host.getByRole("region", { name: "Mensajes" }).getByText(/soy estudiante de Informática/)).toBeVisible();
    await expect.poll(mailpitSubjects).toContainEqual(expect.stringContaining(`${guestName} está interesado/a`));

    // 3. Mensajes en tiempo real (sin recargar la página del propietario).
    const live = `¿Tiene escritorio? (${guestName})`;
    await guest.getByLabel("Escribe un mensaje").fill(live);
    await guest.getByRole("button", { name: "Enviar" }).click();
    await expect(host.getByRole("region", { name: "Mensajes" }).getByText(live)).toBeVisible();

    // 4. El propietario acepta: se desbloquea la dirección para el inquilino.
    await host.getByRole("button", { name: "Aceptar interés" }).click();
    await expect(host.getByText(/Interés\s+aceptado/)).toBeVisible();
    await expect(guest.getByText(/ha aceptado tu interés/)).toBeVisible(); // llega por Realtime
    await guest.goto(LISTING);
    await expect(guest.getByText(ADDRESS)).toBeVisible();

    // 5. El inquilino propone la estancia y el propietario la confirma.
    await guest.goto(conversationUrl);
    await guest.getByLabel("Fecha de entrada").fill("2026-12-01");
    await guest.getByRole("button", { name: "Proponer estancia" }).click();
    await expect(guest.getByText("Pendiente de confirmar")).toBeVisible();
    await expect(guest.getByText("Falta que confirme Diego Fernández.")).toBeVisible();

    await host.goto(conversationUrl);
    await host.getByRole("button", { name: "Confirmar estancia" }).click();
    await expect(host.getByText("Activa", { exact: true })).toBeVisible();

    await guest.goto("/mis-estancias");
    await expect(guest.getByText("Activa", { exact: true })).toBeVisible();
    await expect.poll(mailpitSubjects).toContainEqual(expect.stringContaining("ha aceptado tu interés"));
    await expect.poll(mailpitSubjects).toContainEqual(expect.stringContaining(`${guestName} propone una estancia`));
  });

  test("no se puede mostrar interés en un anuncio propio", async ({ browser }) => {
    const host = await loginPage(browser, "diego@convivo.test");
    await host.goto(LISTING);
    await expect(host.getByText("Es tu anuncio.")).toBeVisible();
    await expect(host.getByRole("button", { name: "Me interesa" })).toHaveCount(0);
  });
});
