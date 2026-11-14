import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const sharp = createRequire(`${process.cwd()}/`)("sharp");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Solo contra el Supabase local.");
const H = { apikey: key, Authorization: `Bearer ${key}` };
const [l] = await (await fetch(`${url}/rest/v1/listings?select=owner_id&status=eq.active&kind=eq.room&limit=1`, { headers: H })).json();
const prof = await (await fetch(`${url}/rest/v1/profiles?select=avatar_path&id=eq.${l.owner_id}`, { headers: H })).json();
console.log("avatar antes:", prof[0].avatar_path);
const small = await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: 140, g: 110, b: 90 }, noise: { type: "gaussian", mean: 120, sigma: 60 } } }).png().toBuffer();
// Avatar tal como lo sube la web (sin recomprimir en el navegador): JPEG de móvil de 1200 px.
const buf = await sharp(small).resize(1200, 1200).blur(0.6).jpeg({ quality: 85 }).toBuffer();
const path = `${l.owner_id}/${randomUUID()}.jpg`;
const up = await fetch(`${url}/storage/v1/object/avatars/${path}`, { method: "POST", headers: { ...H, "Content-Type": "image/jpeg" }, body: buf });
if (!up.ok) throw new Error(await up.text());
const r = await fetch(`${url}/rest/v1/profiles?id=eq.${l.owner_id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ avatar_path: path }) });
if (!r.ok) throw new Error(await r.text());
console.log("avatar subido", Math.round(buf.length / 1024), "KB");
