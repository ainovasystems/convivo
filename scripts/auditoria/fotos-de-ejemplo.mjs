// SOLO desarrollo local: sube una foto de ejemplo (degradado generado) a cada
// anuncio activo que no tenga fotos, para que Lighthouse mida una portada con
// imágenes reales. No toca el seed ni producción.
// Uso: node scripts/auditoria/fotos-de-ejemplo.mjs   (con .env.local cargado)
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import sharp from "sharp";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("Solo contra el Supabase local.");
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const res = await fetch(`${url}/rest/v1/listings?select=id,owner_id,kind,title,photos&status=eq.active&kind=neq.seeking`, { headers });
const listings = await res.json();
for (const [i, l] of listings.entries()) {
  if (l.photos.length) continue;
  const hue = (i * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},40%,70%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},45%,40%)"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#g)"/><rect x="300" y="500" width="1000" height="500" fill="rgba(255,255,255,.35)"/></svg>`;
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer();
  const path = `${l.owner_id}/${l.id}/${randomUUID()}.webp`;
  const up = await fetch(`${url}/storage/v1/object/listing-photos/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "image/webp" },
    body: buf,
  });
  if (!up.ok) throw new Error(await up.text());
  const patch = await fetch(`${url}/rest/v1/listings?id=eq.${l.id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ photos: [path] }),
  });
  if (!patch.ok) throw new Error(await patch.text());
  console.log("foto añadida:", l.title);
}
