import type { MetadataRoute } from "next";

/** Permite «Añadir a pantalla de inicio» y abrir Hommie como una app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hommie",
    short_name: "Hommie",
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
