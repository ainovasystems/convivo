import { describe, expect, it } from "vitest";

import { cityPageCopy, citySlug, findSeoCity, isCityPageSegment, SEO_CITIES } from "@/lib/seo/cities";
import { isIndexingEnabled, isNeverIndexedPath, robotsTagFor, ROBOTS_DISALLOW } from "@/lib/seo/indexing";
import { breadcrumbJsonLd, cityPageJsonLd, listingJsonLd, serializeJsonLd, type ListingForLd } from "@/lib/seo/json-ld";
import { pageMetadata, shareablePhotoUrl, shorten } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/url";

const BASE = "https://convivo.test";

describe("indexación (una sola variable, apagada por defecto)", () => {
  it("está apagada sin variable, vacía o con valores raros", () => {
    expect(isIndexingEnabled({})).toBe(false);
    expect(isIndexingEnabled({ INDEXING_ENABLED: "" })).toBe(false);
    expect(isIndexingEnabled({ INDEXING_ENABLED: "false" })).toBe(false);
    expect(isIndexingEnabled({ INDEXING_ENABLED: "0" })).toBe(false);
    expect(isIndexingEnabled({ INDEXING_ENABLED: "quizá" })).toBe(false);
  });

  it("se enciende con true, 1 o si (sin distinguir mayúsculas) y admite el alias `indexing`", () => {
    expect(isIndexingEnabled({ INDEXING_ENABLED: "true" })).toBe(true);
    expect(isIndexingEnabled({ INDEXING_ENABLED: " TRUE " })).toBe(true);
    expect(isIndexingEnabled({ INDEXING_ENABLED: "1" })).toBe(true);
    expect(isIndexingEnabled({ indexing: "si" })).toBe(true);
  });

  it("el alias en minúscula manda sobre el estándar", () => {
    expect(isIndexingEnabled({ indexing: "false", INDEXING_ENABLED: "true" })).toBe(false);
    // ...pero un alias vacío no tapa a la variable estándar.
    expect(isIndexingEnabled({ indexing: "", INDEXING_ENABLED: "true" })).toBe(true);
  });

  it("apagada: TODO lleva noindex, nofollow", () => {
    for (const path of ["/", "/anuncios", "/anuncios/abc", "/habitaciones/lugo", "/perfil/x", "/robots.txt", "/sitemap.xml"]) {
      expect(robotsTagFor(path, "", false)).toBe("noindex, nofollow");
    }
  });

  it("encendida: lo público se indexa", () => {
    for (const path of ["/", "/anuncios", "/anuncios/abc", "/habitaciones/lugo", "/pisos/a-coruna", "/privacidad"]) {
      expect(robotsTagFor(path, "", true)).toBeNull();
    }
  });

  it("encendida: perfiles de personas y zonas privadas siguen con noindex", () => {
    for (const path of [
      "/perfil",
      "/perfil/a0000000-0000-4000-8000-000000000001",
      "/perfil/editar",
      "/publicar",
      "/publicar/123",
      "/mis-anuncios",
      "/mis-resenas",
      "/mensajes/1",
      "/contratos/1/inventario/entrada",
      "/admin",
      "/cuenta",
      "/entrar",
      "/registro",
      "/estado",
      "/api/mis-datos",
      "/og/inicio",
    ]) {
      expect(robotsTagFor(path, "", true), path).toBe("noindex, nofollow");
    }
  });

  it("encendida: la búsqueda con filtros no se indexa, pero sí se siguen sus enlaces", () => {
    expect(robotsTagFor("/anuncios", "?ciudad=Lugo", true)).toBe("noindex, follow");
    expect(robotsTagFor("/anuncios", "?pagina=2", true)).toBe("noindex, follow");
    expect(robotsTagFor("/anuncios", "", true)).toBeNull();
    expect(robotsTagFor("/anuncios", "?", true)).toBeNull();
  });

  it("no confunde prefijos: /perfilado no es /perfil, /anuncios/x no es privado", () => {
    expect(isNeverIndexedPath("/perfilado")).toBe(false);
    expect(isNeverIndexedPath("/mis-anuncios")).toBe(true);
    expect(isNeverIndexedPath("/habitaciones/lugo")).toBe(false);
  });

  it("robots.txt bloquea las mismas zonas privadas que el middleware", () => {
    for (const p of ["/admin", "/perfil", "/mensajes", "/contratos", "/api/"]) {
      expect(ROBOTS_DISALLOW.some((d) => p.startsWith(d))).toBe(true);
    }
  });
});

describe("páginas de ciudad", () => {
  it("son las cuatro del piloto, con slug sin tildes ni espacios", () => {
    expect(SEO_CITIES.map((c) => c.slug)).toEqual(["lugo", "a-coruna", "madrid", "barcelona"]);
    expect(SEO_CITIES.find((c) => c.slug === "a-coruna")).toMatchObject({ name: "A Coruña", province: "A Coruña" });
  });

  it("los slugs no se repiten y se pueden resolver", () => {
    expect(new Set(SEO_CITIES.map((c) => c.slug)).size).toBe(SEO_CITIES.length);
    expect(findSeoCity("lugo")?.name).toBe("Lugo");
    expect(findSeoCity("valencia")).toBeNull();
    expect(findSeoCity("Lugo")).toBeNull(); // el slug es en minúscula
  });

  it("citySlug normaliza", () => {
    expect(citySlug("Santiago de Compostela")).toBe("santiago-de-compostela");
    expect(citySlug("Vitoria-Gasteiz")).toBe("vitoria-gasteiz");
  });

  it("solo existen los tramos habitaciones y pisos", () => {
    expect(isCityPageSegment("habitaciones")).toBe(true);
    expect(isCityPageSegment("pisos")).toBe(true);
    expect(isCityPageSegment("constructor")).toBe(false);
    expect(isCityPageSegment("__proto__")).toBe(false);
  });

  it("el título y la descripción mencionan lo que se busca y la ciudad", () => {
    const rooms = cityPageCopy("habitaciones", "Lugo", 2, 290);
    expect(rooms.title).toMatch(/habitaciones/i);
    expect(rooms.title).toMatch(/pisos compartidos/i);
    expect(rooms.title).toContain("Lugo");
    expect(rooms.description).toContain("290 €/mes");
    expect(cityPageCopy("pisos", "Lugo", 1, null).description).not.toContain("desde");
  });

  it("sin anuncios, la descripción no inventa cifras y invita a publicar", () => {
    const d = cityPageCopy("habitaciones", "Madrid", 0, null).description;
    expect(d).not.toMatch(/\d/);
    expect(d).toMatch(/publica/i);
  });
});

const listing: ListingForLd = {
  id: "b0000000-0000-4000-8000-000000000001",
  kind: "room",
  title: "Habitación exterior",
  description: "Muy luminosa.",
  city: "Lugo",
  province: "Lugo",
  neighborhood: "Centro histórico",
  monthly_rent: 290,
  size_m2: 12,
  bedrooms: 3,
  bathrooms: 1,
  furnished: true,
  published_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
};

describe("datos estructurados", () => {
  it("un anuncio lleva precio, imagen y localidad con URLs desde la base", () => {
    const ld = listingJsonLd(BASE, listing, [`${BASE}/foto.jpg`], { count: 3, average: 4.26 })!;
    expect(ld["@type"]).toEqual(["Product", "Room"]);
    expect(ld.url).toBe(`${BASE}/anuncios/${listing.id}`);
    expect(ld.offers).toMatchObject({ price: 290, priceCurrency: "EUR" });
    expect(ld.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Lugo",
      addressRegion: "Lugo",
      addressCountry: "ES",
    });
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.3, reviewCount: 3 });
    expect(ld.image).toEqual([`${BASE}/foto.jpg`]);
  });

  it("NUNCA lleva dirección exacta, código postal ni coordenadas", () => {
    const text = JSON.stringify(listingJsonLd(BASE, listing, [], null));
    for (const forbidden of ["streetAddress", "postalCode", "geo", "latitude", "longitude", "address_line", "floor_door"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("un piso entero es Apartment; un «busco» no lleva datos estructurados", () => {
    expect(listingJsonLd(BASE, { ...listing, kind: "flat" }, [])!["@type"]).toEqual(["Product", "Apartment"]);
    expect(listingJsonLd(BASE, { ...listing, kind: "seeking" }, [])).toBeNull();
  });

  it("sin precio ni reseñas no inventa ofertas ni valoraciones", () => {
    const ld = listingJsonLd(BASE, { ...listing, monthly_rent: null }, [], { count: 0, average: 0 })!;
    expect(ld).not.toHaveProperty("offers");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("image");
  });

  it("la página de ciudad lista los anuncios y las migas llevan URLs absolutas", () => {
    const ld = cityPageJsonLd(BASE, { path: "/habitaciones/lugo", name: "Lugo", description: "d", items: [{ id: "x", title: "T" }] });
    expect(ld["@type"]).toBe("CollectionPage");
    expect(JSON.stringify(ld)).toContain(`${BASE}/anuncios/x`);
    const bc = breadcrumbJsonLd(BASE, [{ name: "Inicio", path: "/" }, { name: "Lugo", path: "/habitaciones/lugo" }]);
    expect(JSON.stringify(bc)).toContain(`${BASE}/habitaciones/lugo`);
  });

  it("ninguna URL sale escrita a mano: con otra base, cambian todas", () => {
    const text = JSON.stringify(listingJsonLd("https://otro.dominio", listing, [], null));
    expect(text).toContain("https://otro.dominio/anuncios/");
    expect(text).not.toContain("convivo.test");
  });

  it("serializeJsonLd impide cerrar el <script> desde un texto", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("metadatos", () => {
  it("pageMetadata fija canonical, Open Graph y tarjeta con URLs absolutas", () => {
    const m = pageMetadata({ baseUrl: BASE, title: "T", description: "D", path: "/habitaciones/lugo", image: "/og/x" });
    expect(m.alternates?.canonical).toBe(`${BASE}/habitaciones/lugo`);
    expect(m.openGraph).toMatchObject({ url: `${BASE}/habitaciones/lugo`, title: "T · Convivo", locale: "es_ES" });
    expect(m.openGraph?.images).toEqual([{ url: `${BASE}/og/x`, width: 1200, height: 630, alt: "T" }]);
    expect(m.twitter).toMatchObject({ card: "summary_large_image", images: [`${BASE}/og/x`] });
  });

  it("una foto de tamaño desconocido no declara medidas", () => {
    const m = pageMetadata({ baseUrl: BASE, title: "T", description: "D", path: "/a", image: "/foto", imageSized: false });
    expect(m.openGraph?.images).toEqual([{ url: `${BASE}/foto`, alt: "T" }]);
  });

  it("la foto para compartir pasa por el optimizador (JPEG de 1200 px)", () => {
    const u = shareablePhotoUrl(BASE, "https://x.supabase.co/storage/v1/object/public/listing-photos/a/b.webp");
    expect(u.startsWith(`${BASE}/_next/image?url=https%3A%2F%2Fx.supabase.co`)).toBe(true);
    expect(u).toContain("w=1200");
  });

  it("shorten corta en palabra entera", () => {
    expect(shorten("uno dos tres cuatro cinco", 14)).toBe("uno dos tres…");
    expect(shorten("corto", 14)).toBe("corto");
    expect(shorten("a  b\n c", 20)).toBe("a b c");
  });

  it("absoluteUrl no duplica barras", () => {
    expect(absoluteUrl("https://a.es/", "/x")).toBe("https://a.es/x");
    expect(absoluteUrl("https://a.es", "x")).toBe("https://a.es/x");
  });
});
