import type { MetadataRoute } from "next";

/** Permite «Añadir a pantalla de inicio» y abrir Convivo como una app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Convivo",
    short_name: "Convivo",
    description: "Pisos, habitaciones y compañeros con reseñas reales.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7b4b2a",
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
