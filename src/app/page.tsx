import Link from "next/link";

const FEATURES = [
  {
    title: "Habitaciones y pisos",
    text: "Publica o encuentra una habitación en piso compartido o un piso entero.",
  },
  {
    title: "Busco compañero",
    text: "Cuenta qué buscas y deja que te encuentren quienes encajan contigo.",
  },
  {
    title: "Reseñas de verdad",
    text: "Solo se puede opinar tras una estancia confirmada por ambas partes.",
  },
] as const;

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:py-20">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Comparte piso con gente de confianza
        </h1>
        <p className="mt-4 text-lg text-muted">
          Perfiles, anuncios y reseñas que solo se escriben después de haber
          convivido de verdad.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/anuncios"
            className="rounded-md bg-brand px-5 py-3 font-medium text-brand-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver anuncios
          </Link>
          <Link
            href="/publicar"
            className="rounded-md border border-border px-5 py-3 font-medium hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Publicar anuncio
          </Link>
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="mt-16">
        <h2 id="como-funciona" className="sr-only">
          Cómo funciona
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-lg border border-border p-5"
            >
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted">{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
