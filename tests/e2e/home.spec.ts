import { expect, test } from "@playwright/test";

test("la home muestra la cabecera y la propuesta de valor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Convivo" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Anuncios" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Publicar" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Comparte piso",
  );
});
