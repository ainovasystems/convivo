import { ogCard } from "@/lib/seo/og-card";

export const dynamic = "force-dynamic";

export function GET() {
  return ogCard({
    kicker: "Pisos y habitaciones",
    title: "Tu próximo hogar, con gente de confianza",
    subtitle: "Perfiles y reseñas verificadas tras una estancia real",
  });
}
