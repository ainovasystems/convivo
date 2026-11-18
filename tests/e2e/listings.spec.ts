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

  test("el asistente rechaza teléfonos, emails y direcciones exactas, pero no precios ni superficies", async ({ page }) => {
    await login(page, "farid@convivo.test");
    await page.goto("/publicar");
    await page.getByRole("button", { name: /^Habitación/ }).click();
    await expect(page).toHaveURL(/\/publicar\/[0-9a-f-]{36}\?paso=datos/);
    await expect(page.getByText("No incluyas teléfonos, emails ni direcciones exactas: usa el chat.")).toBeVisible();

    const description = page.getByLabel("Descripción");
    await description.fill("Habitación de 12 m² por 450 € al mes, disponible desde el 1 de septiembre de 2026.");
    await expect(page.getByText(/Parece que el texto incluye/)).toHaveCount(0);

    await description.fill("Habitación luminosa, llámame al 600 123 456 y la vemos.");
    await expect(page.getByText(/Parece que el texto incluye un número de teléfono/)).toBeVisible();
    await expect(page.getByText(/el contacto va por el chat de Hommie/)).toBeVisible();
    // El aviso no repite el dato. Se mira el propio aviso y no `getByText` en toda la página: React
    // copia el valor del campo controlado en el texto del <textarea>, así que «600 123 456» salía
    // siempre una vez (el campo, no el aviso).
    const aviso = page.locator("#description-error");
    await expect(aviso).toContainText("Parece que el texto incluye");
    await expect(aviso).not.toContainText("600");
    await expect(aviso).not.toContainText("123");
    await expect(description).toHaveAttribute("aria-invalid", "true");

    await description.fill("Habitación luminosa, vive en la calle Mayor, 12 y la vemos.");
    await expect(page.getByText(/una dirección exacta/)).toBeVisible();

    await page.getByLabel("Título").fill("Habitación, escribe a ana@gmail.com");
    await expect(page.getByText(/un email/)).toBeVisible();
    await expect(page.locator("#title-error")).not.toContainText("ana@gmail.com");
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

  test("la ficha repite la llamada a contactar tras «Datos clave» solo en móvil (sin barra pegajosa)", async ({ page }) => {
    // El enlace repetido es `lg:hidden` (decisión 63): en móvil hay dos (tras los datos clave y en el
    // bloque de contacto) y en escritorio solo el del bloque lateral, porque el otro está oculto.
    const isMobile = (page.viewportSize()?.width ?? 1280) < 1024;
    const datos = page.getByRole("region", { name: "Datos clave" });

    // Sin sesión: «Entra para contactar» lleva a entrar y vuelve a la ficha.
    await page.goto("/anuncios/b0000000-0000-4000-8000-000000000005");
    await expect(datos).toBeVisible();
    const entra = page.getByRole("link", { name: "Entra para contactar" });
    await expect(entra).toHaveCount(isMobile ? 2 : 1);
    if (isMobile) {
      // El primero (en el orden del documento) es el repetido, y queda por debajo de «Datos clave».
      await expect(entra.first()).toHaveAttribute("href", /\/entrar\?next=\/anuncios\/b0000000-0000-4000-8000-000000000005/);
      const [d, c] = [await datos.boundingBox(), await entra.first().boundingBox()];
      expect(c!.y).toBeGreaterThan(d!.y);
    }

    // Con sesión (quien no es el dueño): en móvil, «Me interesa» lleva al formulario de más abajo (#contactar).
    await login(page, "farid@convivo.test");
    await page.goto("/anuncios/b0000000-0000-4000-8000-000000000005");
    await expect(datos).toBeVisible();
    const meInteresa = page.getByRole("link", { name: "Me interesa" });
    await expect(meInteresa).toHaveCount(isMobile ? 1 : 0);
    if (isMobile) await expect(meInteresa).toHaveAttribute("href", "#contactar");
    await expect(page.locator("#contactar")).toBeVisible();
  });

  test("la búsqueda arranca con los filtros plegados y, al buscar, resume y deja chips que se quitan", async ({ page }) => {
    await page.goto("/anuncios");
    const panel = page.getByRole("region", { name: "Filtros de búsqueda" });
    await expect(panel.getByText("Sin filtros")).toBeVisible();
    // Plegado: los campos no se ven hasta desplegar el panel.
    await expect(page.getByLabel("Tipo")).toBeHidden();
    await expect(page.getByRole("link", { name: /Elviña/ })).toBeVisible(); // los resultados, arriba
    await panel.getByText("Filtros y orden").click();
    await expect(page.getByLabel("Convivencia")).toHaveCount(0);
    await page.getByLabel("Tipo").selectOption("flat");
    await page.getByLabel("Provincia").selectOption("A Coruña");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/tipo=flat/);
    await expect(page).toHaveURL(/provincia=A\+Coru%C3%B1a|provincia=A%20Coru%C3%B1a/);
    await expect(page.getByRole("link", { name: "Piso de 2 habitaciones con vistas a Riazor" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Elviña/ })).toHaveCount(0);

    // Vuelve plegado, con el resumen y los chips de lo aplicado.
    await expect(page.getByLabel("Tipo")).toBeHidden();
    await expect(panel.getByText("Piso entero · A Coruña")).toBeVisible();
    await page.getByRole("link", { name: "Quitar filtro: Piso entero" }).click();
    await expect(page).not.toHaveURL(/tipo=/);
    await expect(page).toHaveURL(/provincia=/);
    await expect(page.getByRole("link", { name: "Quitar filtro: Piso entero" })).toHaveCount(0);
  });

  test("auditoría I4: una página de la búsqueda que no existe enseña la última, nunca un error", async ({ page }) => {
    for (const url of ["/anuncios?pagina=99", "/anuncios?tipo=flat&pagina=7"]) {
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await expect(page.getByText("Algo se ha torcido")).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: /No hay página (99|7): no hay más anuncios/ })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Anuncios" })).toBeVisible();
      await expect(page.locator("main ul li a").first()).toBeVisible();
    }
    // Sin resultados y con una página imposible: el mensaje de siempre, no un error.
    const empty = await page.goto("/anuncios?ciudad=Zamora&pagina=5");
    expect(empty?.status()).toBe(200);
    await expect(page.getByText("No hay anuncios con estos filtros.")).toBeVisible();
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
