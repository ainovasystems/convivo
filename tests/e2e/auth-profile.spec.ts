import { expect, test } from "@playwright/test";

import { requireSupabase, uniqueEmail } from "./support";

test.describe("registro → completar perfil → perfil público", () => {
  requireSupabase();

  test("un usuario nuevo se registra, completa su perfil y lo ve publicado", async ({ page }) => {
    const email = uniqueEmail("e2e");

    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("Marta E2E");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-segura-123");
    await page.getByLabel("Tengo 18 años o más.").check();
    await page.getByLabel(/Acepto las condiciones/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // Confirmación de email desactivada en local: entra directamente.
    await expect(page).toHaveURL(/\/perfil\/editar\?bienvenida=1/);
    await expect(page.getByRole("heading", { name: /Bienvenido/ })).toBeVisible();

    await page.getByLabel("Sobre ti").fill("Estudiante de Arquitectura. Ordenada, tranquila y me encanta cocinar.");
    await page.getByLabel("Ciudad").fill("A Coruña");
    await page.getByLabel("Ocupación").fill("Estudiante");
    await page.getByLabel("Rango de edad").selectOption("18-24");
    await page.getByLabel("Inquilino/a").check();
    await page.getByLabel("Gallego").check();
    await page.getByLabel("¿Fumas?").selectOption("no");
    await page.getByLabel("Nivel de limpieza").selectOption("5");
    await page.getByRole("button", { name: "Guardar perfil" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Perfil guardado" })).toBeVisible();

    await page.getByRole("link", { name: "Ver mi perfil público" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Marta E2E" })).toBeVisible();
    await expect(page.getByText("A Coruña · Estudiante · 18-24 años")).toBeVisible();
    await expect(page.getByText("Email verificado")).toBeVisible();
    await expect(page.getByText("No fumador/a")).toBeVisible();
    await expect(page.getByText("Limpieza: muy ordenado/a")).toBeVisible();
    await expect(page.getByText("Idiomas: Gallego")).toBeVisible();
    await expect(page.getByText("Aún no tiene reseñas como inquilino/a.")).toBeVisible();

    // Otra persona (anónima) ve el mismo perfil.
    const profileUrl = page.url();
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
    await page.goto(profileUrl);
    await expect(page.getByRole("heading", { level: 1, name: "Marta E2E" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar perfil" })).toHaveCount(0);
  });

  test("la validación en cliente avisa sin enviar el formulario", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("A");
    await page.getByLabel("Email").fill("no-es-un-email");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Tu nombre debe tener al menos 2 caracteres")).toBeVisible();
    await expect(page.getByText("Ese email no parece válido")).toBeVisible();
    await expect(page.getByText("Debes aceptar las condiciones")).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test("las rutas privadas redirigen a /entrar y vuelven tras el login", async ({ page }) => {
    await page.goto("/perfil/editar");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fperfil%2Feditar/);
    await page.getByLabel("Email").fill("ana@convivo.test");
    await page.getByLabel("Contraseña", { exact: true }).fill("convivo-dev-1234");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/perfil\/editar$/);
    await expect(page.getByLabel("Nombre")).toHaveValue("Ana Varela");
  });

  test("credenciales incorrectas muestran un error genérico", async ({ page }) => {
    await page.goto("/entrar");
    // Email inventado: los fallos cuentan para el límite de intentos y no queremos bloquear a Ana.
    await page.getByLabel("Email").fill(uniqueEmail("fallo"));
    await page.getByLabel("Contraseña", { exact: true }).fill("mala");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "incorrectos" })).toHaveText(
      "Email o contraseña incorrectos.",
    );
  });

  test("tras muchos fallos con una cuenta se bloquea con un mensaje genérico", async ({ page }, info) => {
    test.skip(info.project.name === "movil", "Basta con un navegador: cada pasada suma fallos a la IP local.");
    const email = uniqueEmail("bloqueo");
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(email);
    const password = page.getByLabel("Contraseña", { exact: true });
    for (let i = 0; i < 8; i++) {
      await password.fill(`mala-${i}`);
      await page.getByRole("button", { name: "Entrar" }).click();
      // Al terminar cada intento el formulario se vacía (la contraseña nunca se devuelve).
      await expect(password).toHaveValue("");
      await expect(page.getByRole("alert").filter({ hasText: "incorrectos" })).toBeVisible();
    }
    await page.getByLabel("Contraseña", { exact: true }).fill("otra-mala");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Demasiados intentos" })).toBeVisible();
  });

  test("el perfil público muestra reseñas publicadas separadas por rol", async ({ page }) => {
    await page.goto("/perfil/a0000000-0000-4000-8000-000000000002"); // Brais (seed)
    await expect(page.getByRole("heading", { level: 1, name: "Brais Lorenzo" })).toBeVisible();
    const asTenant = page.getByRole("region", { name: "Como inquilino/a" });
    await expect(asTenant.getByText(/pagó siempre puntual/)).toBeVisible();
    const asFlatmate = page.getByRole("region", { name: "Como compañero/a" });
    await expect(asFlatmate.getByText(/Respetaba mis horarios/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Como propietario/a" }).getByText("Aún no tiene reseñas")).toBeVisible();
  });

  test("la reseña pendiente (doble ciego) no aparece en el perfil", async ({ page }) => {
    await page.goto("/perfil/a0000000-0000-4000-8000-000000000004"); // Diego (seed)
    await expect(page.getByRole("heading", { level: 1, name: "Diego Fernández" })).toBeVisible();
    await expect(page.getByText(/Diego fue correcto/)).toHaveCount(0);
  });
});
