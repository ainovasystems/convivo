import { z } from "zod";

import { getListingDetail } from "@/lib/listings/queries";
import { KIND_LABELS, priceText } from "@/lib/listings/options";
import { ogCard } from "@/lib/seo/og-card";

// Datos en vivo: nunca se prerrenderiza.
export const dynamic = "force-dynamic";

const idSchema = z.uuid();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return new Response("No encontrado", { status: 404 });
  const detail = await getListingDetail(id);
  // RLS ya oculta lo que no es público; un anuncio no activo no tiene tarjeta.
  if (!detail || detail.listing.status !== "active" || detail.listing.kind === "seeking") {
    return new Response("No encontrado", { status: 404 });
  }
  const l = detail.listing;
  return ogCard({
    kicker: KIND_LABELS[l.kind],
    title: l.title,
    subtitle: [l.neighborhood, l.city].filter(Boolean).join(", "),
    badge: priceText(l),
  });
}
