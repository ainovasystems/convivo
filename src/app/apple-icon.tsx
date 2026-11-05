import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icono para «Añadir a pantalla de inicio» en iPhone (PNG generado). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#7b4b2a" }}>
        <svg viewBox="0 0 32 32" width="180" height="180">
          <path d="M8 15.5 16 9l8 6.5" fill="none" stroke="#f4b740" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="19.5" r="4.6" fill="none" stroke="#fff" strokeWidth="2.6" />
        </svg>
      </div>
    ),
    size,
  );
}
