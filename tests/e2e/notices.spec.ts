import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { requireSupabase } from "./support";

const ANA = "a0000000-0000-4000-8000-000000000001";
const BRAIS = "a0000000-0000-4000-8000-000000000002";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function mailpitSubjects(): Promise<string[]> {
  const base = process.env.MAILPIT_URL;
  if (!base) return [];
  const res = await fetch(`${base}/api/v1/messages?limit=200`);
  const json = (await res.json()) as { messages: Array<{ Subject: string }> };
  return json.messages.map((m) => m.Subject);
}

test.describe("canal público de denuncias (DSA)", () => {
  requireSupabase();
  test.skip(({ browserName }) => !process.env.SUPABASE_SERVICE_ROLE_KEY || browserName !== "chromium");

  test("alguien sin cuenta notifica un anuncio, recibe acuse y el admin decide con motivo", async ({ browser }, info) => {
    test.skip(info.project.name === "movil", "Basta con un navegador para el circuito de moderación.");
    const admin = adminClient();
    const title = `Habitación para notificar ${Date.now()}`;
    const { data: listing } = await admin
      .from("listings")
      .insert({
        owner_id: BRAIS, kind: "room", status: "active", title,
        description: "Habitación exterior y luminosa en piso reformado, cerca de todo.",
        city: "Lugo", province: "Lugo", monthly_rent: 300, available_from: "2027-01-10", current_flatmates: 1,
      })
      .select("id")
      .single();

    // 1. Una persona sin cuenta lo notifica desde la ficha.
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`/anuncios/${listing!.id}`);
    await anon.getByRole("link", { name: /Notificar este anuncio/ }).click();
    await expect(anon.getByLabel("Enlace al contenido")).toHaveValue(`/anuncios/${listing!.id}`);
    await anon.getByLabel("Motivo").selectOption("fraud");
    await anon.getByLabel("Qué es ilegal y por qué").fill("Me pidieron la fianza por Western Union antes de ver la habitación.");
    await anon.getByLabel("Tu nombre").fill("Rosa Notificante");
    const email = `rosa.${Date.now()}@ejemplo.test`;
    await anon.getByLabel("Tu email").fill(email);
    await anon.getByLabel(/Declaro de buena fe/).check();
    await anon.getByRole("button", { name: "Enviar notificación" }).click();
    const status = anon.getByRole("status").filter({ hasText: "Tu referencia es" });
    await expect(status).toBeVisible();
    const reference = (await status.textContent())!.match(/referencia es ([0-9A-F]{8})/)![1];
    await expect.poll(mailpitSubjects).toContainEqual(`Hemos recibido tu notificación (ref. ${reference})`);

    // 2. El admin la ve con su plazo y la acepta cerrando el anuncio.
    await admin.from("admin_users").upsert({ user_id: ANA });
    const ana = await (await browser.newContext()).newPage();
    await ana.goto("/entrar");
    await ana.getByLabel("Email").fill("ana@convivo.test");
    await ana.getByLabel("Contraseña", { exact: true }).fill("convivo-dev-1234");
    await ana.getByRole("button", { name: "Entrar" }).click();
    await expect(ana.getByRole("button", { name: "Salir" })).toBeVisible();
    await ana.goto("/admin");
    const item = ana.getByRole("listitem").filter({ hasText: reference });
    await expect(item.getByText(/Responder antes del/)).toBeVisible();
    await item.getByLabel(/Motivo de la decisión/).fill("Pedir la fianza por Western Union antes de la visita es una estafa típica.");
    await item.getByLabel(/Cerrar el anuncio/).check();
    await item.getByRole("button", { name: "Es ilícito: actuar" }).click();
    await expect(ana.getByText("Decisión registrada y comunicada.")).toBeVisible();

    const { data: after } = await admin.from("listings").select("status").eq("id", listing!.id).single();
    expect(after?.status).toBe("closed");
    await expect.poll(mailpitSubjects).toContainEqual(`Decisión sobre tu notificación (ref. ${reference})`);
    await expect.poll(mailpitSubjects).toContainEqual(`Hemos retirado tu anuncio «${title}» en Convivo`);
  });

  test("valida el formulario y exige declarar la buena fe", async ({ page }) => {
    await page.goto("/denunciar");
    await expect(page.getByText("No hace falta tener cuenta")).toBeVisible();
    await page.getByRole("button", { name: "Enviar notificación" }).click();
    await expect(page.getByText("Tienes que confirmar que la información es correcta")).toBeVisible();
    await expect(page.getByText(/Explica qué es ilícito/)).toBeVisible();
  });
});
