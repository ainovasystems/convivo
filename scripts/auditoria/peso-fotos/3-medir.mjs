import { createRequire } from "node:module";
const { chromium, devices } = createRequire(`${process.cwd()}/`)("@playwright/test");
const BASE = process.env.BASE_URL ?? "http://localhost:3400";
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error("Solo contra la web local.");
process.loadEnvFile(".env.local");
const H = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
const [l] = await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/listings?select=id,owner_id&status=eq.active&kind=eq.room&limit=1`, { headers: H })).json();
const pages = { "Búsqueda (/anuncios)": "/anuncios", "Ficha de anuncio": `/anuncios/${l.id}`, "Perfil público": `/perfil/${l.owner_id}` };
const browser = await chromium.launch();
const out = [];
for (const [devName, dev] of [["móvil (Pixel 7)", devices["Pixel 7"]], ["escritorio", devices["Desktop Chrome"]]]) {
  for (const [name, path] of Object.entries(pages)) {
    for (const mode of ["al entrar", "bajando hasta el final"]) {
      const ctx = await browser.newContext({ ...dev });
      const page = await ctx.newPage();
      const imgs = [];
      page.on("response", async (r) => {
        if (r.request().resourceType() !== "image") return;
        let bytes = 0;
        try { bytes = (await r.body()).length; } catch {}
        const u = new URL(r.url());
        imgs.push({ w: u.searchParams.get("w"), direct: !u.pathname.startsWith("/_next/image"), bytes, src: u.pathname.startsWith("/_next/image") ? u.searchParams.get("url") : u.pathname });
      });
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      if (mode !== "al entrar") {
        for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(150); }
        // En la ficha, deslizar la galería entera.
        await page.evaluate(() => document.querySelectorAll("ul[aria-label^='Fotos de'] li").forEach((li) => li.scrollIntoView()));
        await page.waitForLoadState("networkidle");
      }
      const photos = imgs.filter((i) => /listing-photos|avatars/.test(i.src ?? ""));
      const total = photos.reduce((a, b) => a + b.bytes, 0);
      out.push({ dispositivo: devName, pagina: name, momento: mode, fotos: photos.length, KB: Math.round(total / 1024), anchos: [...new Set(photos.map((p) => p.w ?? "original"))].join(","), directas: photos.filter((p) => p.direct).length, otras_imagenes_KB: Math.round(imgs.filter((i) => !/listing-photos|avatars/.test(i.src ?? "")).reduce((a, b) => a + b.bytes, 0) / 1024) });
      await ctx.close();
    }
  }
}
console.table(out);
await browser.close();
