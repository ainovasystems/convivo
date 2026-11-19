import { expect, test, type Page } from "@playwright/test";

import { requireSupabase, uniqueEmail } from "./support";

const SENT = /Si hay una cuenta con ese email, te hemos enviado un enlace para elegir una contraseña nueva/;
const EXPIRED = /ha caducado o ya se ha usado/;
const SUBJECT = "Cambia tu contraseña de Hommie";

type MailpitMessage = { ID: string; Subject: string };

/** Emails de recuperación que hay en el buzón local para esa dirección. */
async function recoveryEmails(email: string): Promise<MailpitMessage[]> {
  const base = process.env.MAILPIT_URL;
  if (!base) return [];
  const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const json = (await res.json()) as { messages: MailpitMessage[] };
  return json.messages.filter((m) => m.Subject === SUBJECT);
}

/** Espera el email, comprueba que está en español y devuelve el enlace del botón. */
async function recoveryLink(email: string): Promise<string> {
  await expect.poll(async () => (await recoveryEmails(email)).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const [latest] = await recoveryEmails(email);
  const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/message/${latest.ID}`);
  const { HTML } = (await res.json()) as { HTML: string };
  expect(HTML).toContain("Elegir una contraseña nueva");
  expect(HTML).toContain("Si no has sido tú, ignora este mensaje");
  const href = /href="([^"]*\/auth\/callback[^"]*)"/.exec(HTML)?.[1];
  expect(href, "el email lleva el enlace a /auth/callback").toBeTruthy();
  return href!.replaceAll("&amp;", "&");
}

async function register(page: Page, email: string, password: string) {
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill("Olvido E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Tengo 18 años o más.").check();
  await page.getByLabel(/Acepto las condiciones/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/perfil\/editar\?bienvenida=1/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();
}

async function askForLink(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviarme el enlace" }).click();
  await expect(page.getByRole("status").filter({ hasText: SENT })).toBeVisible();
}

test.describe("recuperar la contraseña (auditoría I12)", () => {
  requireSupabase();
  test.skip(!process.env.MAILPIT_URL, "Necesita el buzón local (MAILPIT_URL)");

  test("recorrido completo: pedir el enlace, elegir contraseña, entrar; el enlace no vale dos veces", async ({ page }) => {
    const email = uniqueEmail("olvido");
    await register(page, email, "contraseña-vieja-123");
    await signOut(page);

    // Desde «Entrar», junto a la contraseña.
    await page.goto("/entrar");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
    await askForLink(page, email);

    const link = await recoveryLink(email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/recuperar\/nueva$/);
    await expect(page.getByRole("heading", { name: "Elige una contraseña nueva" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Mismas reglas que en el registro, y las dos tienen que coincidir.
    await page.getByLabel("Contraseña nueva").fill("corta");
    await page.getByLabel("Repite la contraseña").fill("corta");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.locator("#password-error")).toHaveText("La contraseña debe tener al menos 8 caracteres");
    await page.getByLabel("Contraseña nueva").fill("contraseña-nueva-456");
    await page.getByLabel("Repite la contraseña").fill("contraseña-distinta-456");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.locator("#passwordConfirm-error")).toHaveText("Las dos contraseñas no coinciden");

    await page.getByLabel("Repite la contraseña").fill("contraseña-nueva-456");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Contraseña cambiada. Ya has entrado en tu cuenta." })).toBeVisible();
    // Con la sesión iniciada.
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();

    // El mismo enlace, otra vez: mensaje claro y forma de pedir otro, sin error técnico.
    await signOut(page);
    await page.goto(link);
    await expect(page).toHaveURL(/\/recuperar\?error=enlace$/);
    await expect(page.getByRole("alert").filter({ hasText: EXPIRED })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviarme el enlace" })).toBeVisible();

    // La contraseña vieja ya no vale; la nueva sí.
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-vieja-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "incorrectos" })).toBeVisible();
    await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-nueva-456");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();

    // Con la sesión de la contraseña (sin enlace del email) no se puede cambiar.
    await page.goto("/recuperar/nueva");
    await expect(page).toHaveURL(/\/recuperar\?error=enlace$/);
  });

  test("la respuesta es la misma si el email no tiene cuenta, y no se envía nada", async ({ page }) => {
    const email = uniqueEmail("nadie");
    await page.goto("/recuperar");
    await askForLink(page, email);
    expect(await recoveryEmails(email)).toHaveLength(0);
  });

  test("quien solo entraba con enlace por email puede ponerse una contraseña", async ({ page }) => {
    // Cuenta sin contraseña, creada como lo haría el panel de Supabase (solo en la BD local).
    const email = uniqueEmail("sinclave");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const created = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { display_name: "Sin Clave E2E" } }),
    });
    expect(created.ok).toBe(true);

    await page.goto("/recuperar");
    await askForLink(page, email);
    await page.goto(await recoveryLink(email));
    await page.getByLabel("Contraseña nueva").fill("mi-primera-contraseña-1");
    await page.getByLabel("Repite la contraseña").fill("mi-primera-contraseña-1");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Contraseña cambiada" })).toBeVisible();

    await signOut(page);
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("mi-primera-contraseña-1");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  });

  test("un enlace inventado lleva a pedir otro, no a una pantalla de error", async ({ page }) => {
    await page.goto("/auth/callback?token_hash=no-existe&type=recovery&next=%2Frecuperar%2Fnueva");
    await expect(page).toHaveURL(/\/recuperar\?error=enlace$/);
    await expect(page.getByRole("heading", { name: "Pide otro enlace" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: EXPIRED })).toBeVisible();
  });
});
