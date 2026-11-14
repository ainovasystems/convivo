import { expect, test, type Browser } from "@playwright/test";

import { requireSupabase, uniqueEmail } from "./support";

// Habitación en Elviña (A Coruña) del seed, de Diego.
const LISTING = "/anuncios/b0000000-0000-4000-8000-000000000005";

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Email").fill(uniqueEmail("contrato"));
  await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
  await page.getByLabel("Tengo 18 años o más.").check();
  await page.getByLabel(/Acepto las condiciones/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/perfil\/editar/);
  return page;
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

async function mailpitSubjects(): Promise<string[]> {
  const base = process.env.MAILPIT_URL;
  if (!base) return [];
  const res = await fetch(`${base}/api/v1/messages?limit=200`);
  const json = (await res.json()) as { messages: Array<{ Subject: string }> };
  return json.messages.map((m) => m.Subject);
}

test.describe("contrato firmado en Convivo", () => {
  requireSupabase();

  test("el casero lo prepara, firman los dos y la estancia queda confirmada", async ({ browser }, info) => {
    test.skip(info.project.name === "movil", "Un navegador basta para el circuito completo.");
    const suffix = Math.random().toString(36).slice(2, 7);
    const guestName = `Lara ${suffix}`;
    const guestLegal = `Lara ${suffix} Pérez Gómez`;
    const guest = await newUser(browser, guestName);

    await guest.goto(LISTING);
    await guest.getByLabel(/Escribe a Diego/).fill("Hola Diego, soy estudiante y me interesa la habitación para todo el curso.");
    await guest.getByRole("button", { name: "Me interesa" }).click();
    await expect(guest).toHaveURL(/\/mensajes\/[0-9a-f-]{36}$/);
    const conversation = guest.url();
    await expect(guest.getByText(/el anunciante podrá enviarte el contrato/)).toHaveCount(0);

    const host = await login(browser, "diego@convivo.test");
    await host.goto(conversation);
    await host.getByRole("button", { name: "Aceptar interés" }).click();
    await expect(host.getByText(/Interés\s+aceptado/)).toBeVisible();
    await host.reload();
    await host.getByRole("button", { name: "Preparar contrato" }).click();
    await expect(host).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
    const contractUrl = host.url();

    // Viene rellenado desde el anuncio; el casero completa los nombres legales.
    await expect(host.getByLabel("Renta (€/mes)")).toHaveValue("330");
    await host.getByLabel(/Tu nombre y apellidos/).fill("Diego Fernández Castro");
    await host.getByLabel(/Nombre y apellidos de la parte arrendataria/).fill(guestLegal);
    await expect(host.getByRole("region", { name: "Vista previa" }).getByText(guestLegal).first()).toBeVisible();
    await host.getByRole("button", { name: "Enviar para firmar" }).click();
    await expect(host.getByText("Pendiente de firma").first()).toBeVisible();
    await expect.poll(mailpitSubjects).toContainEqual(expect.stringContaining("te ha enviado un contrato para firmar"));

    // El inquilino lo ve desde el chat y firma.
    await guest.goto(conversation);
    await guest.getByRole("link", { name: "Ver contrato" }).click();
    await expect(guest).toHaveURL(contractUrl);
    await guest.getByLabel("Escribe tu nombre completo").fill("Lara Otra");
    await guest.getByLabel(/He leído el contrato completo/).check();
    await guest.getByRole("button", { name: "Firmar" }).click();
    await expect(guest.getByRole("alert").filter({ hasText: "tal como aparece en el contrato" })).toBeVisible();
    await guest.getByLabel("Escribe tu nombre completo").fill(guestLegal.toLowerCase());
    await guest.getByRole("button", { name: "Firmar" }).click();
    await expect(guest.getByText("Ya has firmado. Falta que firme la otra parte.")).toBeVisible();

    // Firma el casero: contrato cerrado y estancia activa.
    await host.reload();
    await host.getByLabel("Escribe tu nombre completo").fill("Diego Fernández Castro");
    await host.getByLabel(/He leído el contrato completo/).check();
    await host.getByRole("button", { name: "Firmar" }).click();
    await expect(host.getByText("Firmado por las dos partes.")).toBeVisible();
    await expect(host.getByRole("button", { name: /Descargar o imprimir/ })).toBeVisible();
    await expect.poll(mailpitSubjects).toContainEqual(expect.stringContaining("Contrato firmado"));

    // Ayuda con la fianza: solo el casero, plegada (A Coruña → versión de Galicia).
    const help = host.getByTestId("deposit-help");
    await expect(help.getByText(/Instituto Galego da Vivenda e Solo/)).toBeHidden();
    await help.getByText("¿Ayuda con la fianza?").click();
    await expect(help.getByText(/gratuito y no genera intereses/)).toBeVisible();
    await expect(help.getByText(/no lo hemos confirmado/)).toBeVisible();
    await expect(help.getByText(/consulta el organismo de vivienda/)).toBeVisible();
    await guest.goto(contractUrl);
    await expect(guest.getByTestId("deposit-help")).toHaveCount(0);
    await expect(guest.getByText("¿Ayuda con la fianza?")).toHaveCount(0);

    // Inventario de entrada: el inquilino añade un elemento con foto y confirma; luego el casero.
    await guest.goto(contractUrl);
    await guest.getByRole("link", { name: "Inventario de entrada" }).click();
    await guest.getByRole("button", { name: "Empezar el inventario" }).click();
    await guest.getByLabel("Zona").fill("Habitación");
    await guest.getByLabel("Elemento", { exact: true }).fill("Colchón");
    await guest.getByLabel("Estado").selectOption("good");
    await guest.getByLabel(/Fotos/).setInputFiles("tests/e2e/fixtures/piso.png");
    await expect(guest.getByAltText("Foto 1 sin guardar")).toBeVisible();
    await guest.getByRole("button", { name: "Añadir al inventario" }).click();
    await expect(guest.getByAltText("Colchón, foto 1")).toBeVisible();
    await guest.getByRole("button", { name: /Confirmo que el inventario es correcto/ }).click();
    await expect(guest.getByText("Ya lo has confirmado.")).toBeVisible();
    await expect.poll(mailpitSubjects).toContainEqual(expect.stringContaining("inventario de entrada por revisar"));

    await host.goto(`${contractUrl}/inventario/entrada`);
    await expect(host.getByAltText("Colchón, foto 1")).toBeVisible();
    await host.getByRole("button", { name: /Confirmo que el inventario es correcto/ }).click();
    await expect(host.getByText(/Confirmado por las dos partes el/)).toBeVisible();
    await expect(host.getByRole("button", { name: "Quitar" })).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Añadir al inventario" })).toHaveCount(0);

    // Salida: se copian los elementos de la entrada y se compara.
    await host.goto(`${contractUrl}/inventario/salida`);
    await host.getByRole("button", { name: "Empezar el inventario" }).click();
    await host.getByRole("button", { name: /Copiar los elementos del inventario de entrada/ }).click();
    await expect(host.getByText("A la entrada: Buen estado")).toBeVisible();

    await guest.goto("/mis-estancias");
    await expect(guest.getByText("Activa", { exact: true })).toBeVisible();
    await guest.goto("/contratos");
    await expect(guest.getByText("Firmado", { exact: true })).toBeVisible();
  });

  test("fuera de Galicia no hay contrato de habitación: aviso claro, y la estancia sigue en el chat", async ({ browser }, info) => {
    test.skip(info.project.name === "movil", "Un navegador basta.");
    const guest = await newUser(browser, `Mar ${Math.random().toString(36).slice(2, 7)}`);
    // Habitación en Chamberí (Madrid), de Farid.
    await guest.goto("/anuncios/b0000000-0000-4000-8000-000000000008");
    await guest.getByLabel(/Escribe a Farid/).fill("Hola Farid, trabajo cerca y me interesa mucho la habitación de Chamberí.");
    await guest.getByRole("button", { name: "Me interesa" }).click();
    await expect(guest).toHaveURL(/\/mensajes\/[0-9a-f-]{36}$/);
    const conversation = guest.url();

    const host = await login(browser, "farid@convivo.test");
    await host.goto(conversation);
    await host.getByRole("button", { name: "Aceptar interés" }).click();
    await expect(host.getByText(/Interés\s+aceptado/)).toBeVisible();
    await host.reload();
    const section = host.getByRole("region", { name: "Contrato" });
    await expect(section.getByText(/todavía no está disponible fuera de Galicia/)).toBeVisible();
    await expect(section.getByText(/las reseñas funcionan igual/)).toBeVisible();
    await expect(host.getByRole("button", { name: "Preparar contrato" })).toHaveCount(0);
    // La estancia se puede proponer igualmente desde el chat.
    await expect(host.getByRole("heading", { name: "Estancia" })).toBeVisible();
  });
});
