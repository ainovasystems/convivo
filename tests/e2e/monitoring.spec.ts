import { expect, test } from "@playwright/test";

// Sentry está apagado si no hay DSN (el caso de las pruebas y de la web de pruebas
// sin configurar): no se descarga su código, no se conecta con Sentry y la CSP no
// le abre la puerta. La limpieza de datos personales se prueba en tests/unit/sentry.test.ts.
test.describe("Sentry apagado sin clave", () => {
  test.skip(!!process.env.NEXT_PUBLIC_SENTRY_DSN || !!process.env.sentrydsn, "Solo tiene sentido sin DSN");

  test("la web funciona y no habla con Sentry", async ({ page }) => {
    const sentryRequests: string[] = [];
    const errors: string[] = [];
    page.on("request", (r) => {
      if (/sentry/i.test(r.url())) sentryRequests.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-security-policy"]).not.toContain("sentry");
    await page.goto("/anuncios");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(await page.evaluate(() => "__SENTRY__" in window)).toBe(false);
    expect(sentryRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
});
