import { expect, test, type Page } from "@playwright/test";

import { requireSupabase } from "./support";

// Servidor 1 (baseURL): web de pruebas, indexación APAGADA.
// Servidor 2 (puerto 3100): indexación ENCENDIDA y URL pública conocida. Ver playwright.config.ts.
const ON = `http://localhost:${process.env.PORT_INDEXING ?? 3100}`;
const SITE = "https://convivo.example.test";

const PUBLIC_PAGES = ["/", "/anuncios", "/habitaciones/lugo", "/pisos/lugo", "/privacidad", "/entrar"];

async function metaRobots(page: Page) {
  return page.locator('meta[name="robots"]').getAttribute("content");
}

test.describe("indexación apagada (web de pruebas)", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} lleva noindex en la cabecera y en el <meta>`, async ({ page, request }) => {
      const res = await request.get(path);
      expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
      await page.goto(path);
      expect(await metaRobots(page)).toMatch(/noindex/);
    });
  }

  test("robots.txt bloquea todo y no anuncia el sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toMatch(/Disallow: \/\s*$/m);
    expect(text).not.toMatch(/Allow: \//);
    expect(text).not.toMatch(/Sitemap:/i);
  });

  test("sitemap.xml está vacío", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("<loc>");
  });
});

test.describe("indexación encendida", () => {
  test.use({ baseURL: ON });

  test("robots.txt permite lo público, cierra lo privado y apunta al sitemap con la URL pública", async ({ request }) => {
    const text = await (await request.get("/robots.txt")).text();
    expect(text).toMatch(/Allow: \//);
    for (const p of ["/admin", "/perfil", "/mensajes", "/contratos", "/api/"]) expect(text).toContain(`Disallow: ${p}`);
    expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  test("las páginas públicas ya no llevan noindex", async ({ page, request }) => {
    for (const path of ["/", "/habitaciones/lugo", "/pisos/lugo"]) {
      expect((await request.get(path)).headers()["x-robots-tag"], path).toBeUndefined();
    }
    await page.goto("/habitaciones/lugo");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test("los perfiles de personas y las zonas privadas siguen con noindex", async ({ request }) => {
    for (const path of ["/perfil/a0000000-0000-4000-8000-000000000001", "/entrar", "/registro", "/estado"]) {
      expect((await request.get(path)).headers()["x-robots-tag"], path).toBe("noindex, nofollow");
    }
  });

  test("la búsqueda filtrada no se indexa pero la limpia sí", async ({ request }) => {
    expect((await request.get("/anuncios?ciudad=Lugo")).headers()["x-robots-tag"]).toBe("noindex, follow");
    expect((await request.get("/anuncios")).headers()["x-robots-tag"]).toBeUndefined();
  });

  test("el sitemap lista portada, páginas de ciudad y anuncios con la URL pública", async ({ request }) => {
    requireSupabase();
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    for (const city of ["lugo", "a-coruna", "madrid", "barcelona"]) {
      expect(xml).toContain(`<loc>${SITE}/habitaciones/${city}</loc>`);
      expect(xml).toContain(`<loc>${SITE}/pisos/${city}</loc>`);
    }
    expect(xml).toMatch(new RegExp(`<loc>${SITE}/anuncios/[0-9a-f-]{36}</loc>`));
    // Ninguna URL de fuera de la variable pública, ni perfiles de personas.
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.every((l) => l.startsWith(SITE))).toBe(true);
    expect(locs.some((l) => l.includes("/perfil"))).toBe(false);
  });

  test("la ficha de un anuncio lleva canonical, Open Graph con foto o tarjeta, y JSON-LD sin dirección", async ({ page, request }) => {
    requireSupabase();
    const xml = await (await request.get("/sitemap.xml")).text();
    const id = xml.match(/\/anuncios\/([0-9a-f-]{36})</)![1];
    await page.goto(`/anuncios/${id}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/anuncios/${id}`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https?:\/\/.+/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    // El precio va en la descripción (la tarjeta de WhatsApp la muestra).
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /€\/mes/);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length).toBeGreaterThan(0);
    const data = JSON.parse(blocks[0]) as Array<Record<string, unknown>>;
    expect(JSON.stringify(data)).toContain(`${SITE}/anuncios/${id}`);
    const raw = blocks.join("");
    for (const forbidden of ["streetAddress", "postalCode", "latitude", "longitude", '"geo"']) expect(raw).not.toContain(forbidden);
  });
});

test.describe("páginas de ciudad", () => {
  test.beforeEach(() => requireSupabase());

  test("/habitaciones/lugo muestra anuncios de Lugo, con título, h1, canonical y JSON-LD", async ({ page }) => {
    await page.goto("/habitaciones/lugo");
    await expect(page).toHaveTitle(/Habitaciones en alquiler en Lugo.*pisos compartidos.*Convivo/i);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lugo");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Lugo/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/habitaciones\/lugo$/);
    const cards = page.getByRole("article");
    expect(await cards.count()).toBeGreaterThan(0);
    // Solo habitaciones y solo de Lugo.
    for (const t of await cards.allTextContents()) {
      expect(t).toMatch(/Habitación/);
      expect(t).toMatch(/Lugo/);
    }
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "[]");
    expect(JSON.stringify(ld)).toContain("CollectionPage");
  });

  test("cada ciudad del piloto tiene su página de habitaciones y de pisos", async ({ page }) => {
    for (const [slug, name] of [["lugo", "Lugo"], ["a-coruna", "A Coruña"], ["madrid", "Madrid"], ["barcelona", "Barcelona"]]) {
      for (const seg of ["habitaciones", "pisos"]) {
        const res = await page.goto(`/${seg}/${slug}`);
        expect(res?.status(), `${seg}/${slug}`).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
      }
    }
  });

  test("una ciudad que no es del piloto devuelve 404", async ({ page }) => {
    expect((await page.goto("/habitaciones/valencia"))?.status()).toBe(404);
    expect((await page.goto("/pisos/no-existe"))?.status()).toBe(404);
  });

  test("sin anuncios no se muestra vacía: mensaje útil y enlaces a publicar y a «busco»", async ({ page }) => {
    // El seed no trae pisos enteros activos en Barcelona.
    await page.goto("/pisos/barcelona");
    await expect(page.getByRole("heading", { name: /Todavía no hay pisos publicados en Barcelona/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Publicar un anuncio" })).toHaveAttribute("href", "/publicar");
    await expect(page.getByRole("link", { name: /busco|Ver quién busca/i }).first()).toBeVisible();
  });

  test("las fotos de los anuncios llevan texto alternativo descriptivo", async ({ page }) => {
    await page.goto("/habitaciones/lugo");
    const imgs = page.locator("article img");
    const n = await imgs.count();
    for (let i = 0; i < n; i++) await expect(imgs.nth(i)).toHaveAttribute("alt", /Habitación en .+/);
  });

  test("la tarjeta para compartir de una ciudad es una imagen", async ({ request }) => {
    const res = await request.get("/og/ciudad/habitaciones/lugo");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    expect((await request.get("/og/ciudad/habitaciones/valencia")).status()).toBe(404);
  });

  test("la home enlaza a las páginas de ciudad del piloto", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Lugo", exact: true })).toHaveAttribute("href", "/habitaciones/lugo");
  });
});
