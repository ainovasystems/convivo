import { expect, test, type Page } from "@playwright/test";

import { requireSupabase } from "./support";

async function login(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("convivo-dev-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
}

test.describe("anuncios", () => {
  requireSupabase();

  test("publicar una habitación con foto y encontrarla en el listado", async ({ page }) => {
    const title = `Habitación e2e ${Date.now()}`;
    await login(page, "farid@convivo.test");

    await page.goto("/publicar");
    await page.getByRole("button", { name: /^Habitación/ }).click();
    await expect(page).toHaveURL(/\/publicar\/[0-9a-f-]{36}\?paso=datos/);

    await page.getByLabel("Título").fill(title);
    await page.getByLabel("Descripción").fill("Habitación luminosa con escritorio, a cinco minutos del metro y con buena convivencia.");
    await page.getByLabel("Provincia").selectOption("Ourense");
    await page.getByLabel("Ciudad").fill("Ourense");
    await page.getByLabel("Barrio o zona").fill("O Couto");
    await page.getByLabel("Precio (€/mes)").fill("275");
    await page.getByLabel("Disponible desde").fill("2026-01-15");
    await page.getByLabel("¿Amueblado?").selectOption("yes");
    await page.getByLabel("¿Se admiten mascotas?").selectOption("yes");
    await page.getByLabel("Calle y número").fill("Rúa do Paseo 1");
    await page.getByLabel("Código postal").fill("32003");
    // Autoguardado del borrador.
    await expect(page.getByRole("status").filter({ hasText: "Guardado." })).toBeVisible();

    await page.getByRole("button", { name: "Siguiente →" }).click();
    await page.getByLabel(/Añadir fotos/).setInputFiles("tests/e2e/fixtures/piso.png");
    await expect(page.getByText("1 foto(s) añadida(s).")).toBeVisible();
    await expect(page.getByText("Portada", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Siguiente →" }).click();
    await expect(page.getByText("Todo listo.")).toBeVisible();
    await page.getByRole("button", { name: "Publicar anuncio" }).click();

    await expect(page).toHaveURL(/\/anuncios\/[0-9a-f-]{36}\?publicado=1/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Rúa do Paseo 1")).toBeVisible(); // el dueño ve la dirección
    const listingUrl = page.url().split("?")[0];

    // Búsqueda con filtros en la URL.
    await page.goto("/anuncios?tipo=room&provincia=Ourense&precio_max=300&mascotas=1&amueblado=1");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await page.goto("/anuncios?tipo=room&provincia=Ourense&precio_max=250");
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);

    // Un anónimo ve el anuncio pero no la dirección exacta.
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
    await page.goto(listingUrl);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Rúa do Paseo 1")).toHaveCount(0);
    await expect(page.getByText(/La dirección exacta se comparte/)).toBeVisible();
  });

  test("el asistente rechaza requisitos discriminatorios y ya no ofrece el campo de convivencia", async ({ page }) => {
    await login(page, "farid@convivo.test");
    await page.goto("/publicar");
    await page.getByRole("button", { name: /^Habitación/ }).click();
    await expect(page).toHaveURL(/\/publicar\/[0-9a-f-]{36}\?paso=datos/);

    const description = page.getByLabel("Descripción");
    await description.fill("Habitación muy luminosa en piso reformado. Solo españoles.");
    await expect(page.getByText(/No se pueden poner requisitos por origen/)).toBeVisible();
    await expect(description).toHaveAttribute("aria-invalid", "true");

    // Lo que se escribe en la descripción sigue siendo libre; el campo cerrado ya no existe.
    await description.fill("Habitación muy luminosa en piso reformado. Solo chicas.");
    await expect(page.getByText(/No se pueden poner requisitos por origen/)).toHaveCount(0);
    await expect(description).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("¿Con quién buscáis convivir?")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Guardado." })).toBeVisible();
  });

  test("el formulario de filtros escribe los filtros en la URL", async ({ page }) => {
    await page.goto("/anuncios");
    await expect(page.getByLabel("Convivencia")).toHaveCount(0);
    await page.getByLabel("Tipo").selectOption("flat");
    await page.getByLabel("Provincia").selectOption("A Coruña");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/tipo=flat/);
    await expect(page).toHaveURL(/provincia=A\+Coru%C3%B1a|provincia=A%20Coru%C3%B1a/);
    await expect(page.getByRole("link", { name: "Piso de 2 habitaciones con vistas a Riazor" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Elviña/ })).toHaveCount(0);
  });

  test("mis anuncios: pausar retira el anuncio del listado y reactivar lo devuelve", async ({ page }, testInfo) => {
    // Modifica un anuncio compartido del seed: solo en un proyecto para no pisarse en paralelo.
    test.skip(testInfo.project.name !== "escritorio", "Solo en escritorio");
    await login(page, "gemma@convivo.test");
    await page.goto("/mis-anuncios");
    const item = page.getByRole("listitem").filter({ hasText: "Habitación tranquila en Gràcia" });
    await item.getByRole("button", { name: "Pausar" }).click();
    await expect(item.getByText("Pausado")).toBeVisible();
    await page.goto("/anuncios?provincia=Barcelona");
    await expect(page.getByRole("link", { name: "Habitación tranquila en Gràcia" })).toHaveCount(0);

    await page.goto("/mis-anuncios");
    await item.getByRole("button", { name: "Reactivar" }).click();
    await expect(item.getByText("Publicado")).toBeVisible();
  });
});
