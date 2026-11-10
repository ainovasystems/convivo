import { ImageResponse } from "next/og";

/**
 * Tarjeta para compartir (WhatsApp, redes): 1200×630, marrón de marca, título
 * y precio. Se usa cuando un anuncio no tiene foto y en las páginas de ciudad.
 * Solo dibuja lo que recibe: nunca dirección exacta.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export function ogCard({
  kicker,
  title,
  subtitle,
  badge,
}: {
  kicker: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
}) {
  const long = title.length > 60;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#7b4b2a",
          color: "#ffffff",
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 1, textTransform: "uppercase", color: "#f4b740" }}>
            {kicker}
          </div>
          <div style={{ display: "flex", fontSize: 40 }}>Convivo</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: long ? 56 : 74, lineHeight: 1.1 }}>{title}</div>
          {subtitle ? <div style={{ display: "flex", fontSize: 36, color: "#f3e6d8" }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 28, color: "#f3e6d8" }}>Vivienda compartida con reseñas verificadas</div>
          {badge ? (
            <div
              style={{
                display: "flex",
                background: "#f4b740",
                color: "#2b1a0e",
                fontSize: 46,
                padding: "10px 32px",
                borderRadius: 999,
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
