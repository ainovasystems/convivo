import { expect, test } from "@playwright/test";

test("la home muestra la marca, el buscador y la navegación", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Convivo/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tu próximo hogar");
  await expect(page.getByRole("search", { name: "Buscar vivienda" })).toBeVisible();
  // En móvil la navegación es una barra de pestañas inferior; en escritorio, la cabecera.
  const nav = page.getByRole("navigation", { name: isMobile ? "Navegación principal" : "Principal" });
  await expect(nav.getByRole("link", { name: "Buscar" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Publicar/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
});

test("el buscador de la home lleva al listado filtrado", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("¿En qué ciudad?").fill("Lugo");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/anuncios\?ciudad=Lugo/);
});
