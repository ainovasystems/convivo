// SOLO local. Sube 4 fotos «realistas» (ruido + desenfoque: comprimen como una foto de verdad)
// a cada anuncio activo de habitación o piso, y guarda lo que había para restaurarlo.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
process.loadEnvFile(".env.local");
const sharp = createRequire(`${process.cwd()}/`)("sharp");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("solo local");
const H = { apikey: key, Authorization: `Bearer ${key}` };
const listings = await (await fetch(`${url}/rest/v1/listings?select=id,owner_id,photos&status=eq.active&kind=neq.seeking`, { headers: H })).json();
writeFileSync(process.argv[2], JSON.stringify(listings));
let sizes = [];
for (const l of listings) {
  const paths = [];
  for (let k = 0; k < 4; k++) {
    // Imagen «tipo foto»: ruido gaussiano a baja resolución, ampliado y desenfocado (bordes y texturas).
    const small = await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 140, g: 110, b: 90 }, noise: { type: "gaussian", mean: 120, sigma: 60 } } }).png().toBuffer();
    const buf = await sharp(small).resize(1600, 1200, { kernel: "cubic" }).blur(0.6).webp({ quality: 82 }).toBuffer();
    sizes.push(buf.length);
    const path = `${l.owner_id}/${l.id}/${randomUUID()}.webp`;
    const up = await fetch(`${url}/storage/v1/object/listing-photos/${path}`, { method: "POST", headers: { ...H, "Content-Type": "image/webp" }, body: buf });
    if (!up.ok) throw new Error(await up.text());
    paths.push(path);
  }
  const r = await fetch(`${url}/rest/v1/listings?id=eq.${l.id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ photos: paths }) });
  if (!r.ok) throw new Error(await r.text());
}
console.log(`anuncios: ${listings.length}, fotos: ${sizes.length}, tamaño medio original: ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length / 1024)} KB`);
