import { getCityPageData } from "@/lib/listings/queries";
import { cityPageCopy, CITY_PAGE_KINDS, findSeoCity, isCityPageSegment } from "@/lib/seo/cities";
import { ogCard } from "@/lib/seo/og-card";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ segmento: string; slug: string }> }) {
  const { segmento, slug } = await params;
  const city = findSeoCity(slug);
  if (!city || !isCityPageSegment(segmento)) return new Response("No encontrado", { status: 404 });
  const data = await getCityPageData(city.name, CITY_PAGE_KINDS[segmento].kind);
  const copy = cityPageCopy(segmento, city.name, data.total, data.minPrice);
  return ogCard({
    kicker: city.province,
    title: copy.h1,
    subtitle: data.total ? `${data.total} ${data.total === 1 ? "anuncio" : "anuncios"}` : "Publica el primero",
    badge: data.minPrice !== null ? `Desde ${Math.round(data.minPrice)} €/mes` : null,
  });
}
