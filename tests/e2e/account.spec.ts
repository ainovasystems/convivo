import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { requireSupabase, uniqueEmail } from "./support";

const PASSWORD = "contraseña-segura-123";

test.describe("RGPD: mis datos, borrar la cuenta y textos legales", () => {
  requireSupabase();

  test("descargar mis datos y borrar la cuenta (con confirmación)", async ({ page }) => {
    const email = uniqueEmail("rgpd");
    const name = `Lucía ${Math.random().toString(36).slice(2, 6)}`;
    await page.goto("/registro");
    await page.getByLabel("Nombre").fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByLabel(/Acepto las condiciones/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/perfil\/editar/);

    // Solo cookies de sesión de Supabase (por eso no hay banner de cookies).
    const cookies = await page.context().cookies();
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.filter((c) => !c.name.startsWith("sb-")).map((c) => c.name)).toEqual([]);

    await page.getByRole("link", { name: "Mi cuenta y mis datos" }).click();
    await expect(page).toHaveURL(/\/cuenta$/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Descargar mis datos" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^convivo-mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(data.cuenta.email).toBe(email);
    expect(data.perfil.display_name).toBe(name);
    expect(data).toHaveProperty("resenas_escritas");

    // Sin escribir BORRAR no se borra nada.
    await page.getByLabel("Para confirmar, escribe BORRAR").fill("borrar");
    await page.getByRole("button", { name: "Borrar mi cuenta para siempre" }).click();
    await expect(page.getByText("Escribe BORRAR en mayúsculas para confirmar")).toBeVisible();

    await page.getByLabel("Para confirmar, escribe BORRAR").fill("BORRAR");
    await page.getByRole("button", { name: "Borrar mi cuenta para siempre" }).click();
    await expect(page).toHaveURL(/\/\?cuenta=borrada$/);
    await expect(page.getByText("Tu cuenta se ha borrado")).toBeVisible();

    // Ya no se puede entrar con esa cuenta.
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "incorrectos" })).toBeVisible();
  });

  test("la descarga de datos exige sesión", async ({ request }) => {
    const res = await request.get("/api/mis-datos");
    expect(res.status()).toBe(401);
  });

  test("privacidad y condiciones son borradores enlazados desde el registro y el pie", async ({ page }) => {
    await page.goto("/registro");
    await expect(page.getByRole("link", { name: "política de privacidad" })).toHaveAttribute("href", "/privacidad");
    await expect(page.getByRole("link", { name: "condiciones de uso" })).toHaveAttribute("href", "/terminos");
    for (const [path, title] of [
      ["/privacidad", "Política de privacidad"],
      ["/terminos", "Condiciones de uso"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Borrador pendiente de revisión legal")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Pie de página" }).getByRole("link", { name: "Privacidad" })).toBeVisible();
    }
  });
});
