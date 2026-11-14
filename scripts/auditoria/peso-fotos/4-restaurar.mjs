import { readFileSync } from "node:fs";
process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("solo local");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const before = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const l of before) {
  const [now] = await (await fetch(`${url}/rest/v1/listings?select=photos&id=eq.${l.id}`, { headers: H })).json();
  const extra = now.photos.filter((p) => !l.photos.includes(p));
  if (extra.length) await fetch(`${url}/storage/v1/object/listing-photos`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: extra }) });
  await fetch(`${url}/rest/v1/listings?id=eq.${l.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ photos: l.photos }) });
}
const owner = before[0].owner_id;
const [p] = await (await fetch(`${url}/rest/v1/profiles?select=avatar_path&id=eq.${owner}`, { headers: H })).json();
if (p.avatar_path) {
  await fetch(`${url}/storage/v1/object/avatars`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: [p.avatar_path] }) });
  await fetch(`${url}/rest/v1/profiles?id=eq.${owner}`, { method: "PATCH", headers: H, body: JSON.stringify({ avatar_path: null }) });
}
const left = await (await fetch(`${url}/rest/v1/listings?select=id&photos=neq.{}`, { headers: H })).json();
console.log("restaurado; anuncios con fotos ahora:", left.length);
