import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { requireSupabase } from "./support";

const ANA = "a0000000-0000-4000-8000-000000000001";
const BRAIS = "a0000000-0000-4000-8000-000000000002";

/** Cliente service_role SOLO para preparar datos de prueba. */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test.describe("anti-fraude y registro de moderación", () => {
  requireSupabase();
  test.skip(({ browserName }) => !process.env.SUPABASE_SERVICE_ROLE_KEY || browserName !== "chromium");

  test("un anuncio con texto de estafa se marca, el admin lo cierra y queda registrado", async ({ page }, info) => {
    test.skip(info.project.name === "movil", "Basta con un navegador para el panel de admin.");
    const admin = adminClient();
    const title = `Piso céntrico ganga ${Date.now()}`;
    const { data: listing, error } = await admin
      .from("listings")
      .insert({
        owner_id: BRAIS,
        kind: "room",
        status: "active",
        title,
        description: "Habitación preciosa y amplia. Estoy en el extranjero por trabajo y te mando las llaves por mensajería.",
        city: "Lugo",
        province: "Lugo",
        monthly_rent: 300,
        available_from: "2027-01-10",
        current_flatmates: 1,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    await admin.from("admin_users").upsert({ user_id: ANA });

    // Sigue publicado: la marca no despublica.
    await page.goto(`/anuncios/${listing!.id}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.goto("/entrar");
    await page.getByLabel("Email").fill("ana@convivo.test");
    await page.getByLabel("Contraseña", { exact: true }).fill("convivo-dev-1234");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();

    await page.goto("/admin");
    const item = page.getByRole("listitem").filter({ hasText: title });
    await expect(item.getByText("Texto típico de estafa")).toBeVisible();
    await item.getByLabel("Nota de la decisión").fill("Estafa de las llaves por mensajería");
    await item.getByRole("button", { name: "Cerrar anuncio" }).click();
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
      await expect(page.getByText("«Estafa de las llaves por mensajería»").first()).toBeVisible();
    }).toPass();

    const { data: after } = await admin.from("listings").select("status").eq("id", listing!.id).single();
    expect(after?.status).toBe("closed");
  });
});
