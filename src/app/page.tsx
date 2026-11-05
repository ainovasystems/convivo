import Link from "next/link";

import { BedIcon, HomeIcon, KeyIcon, SearchIcon, ShieldIcon, StarIcon, UsersIcon } from "@/components/brand/icons";
import { ListingCard } from "@/components/listings/listing-card";
import { hasPublicEnv } from "@/lib/env";
import { searchListings } from "@/lib/listings/queries";

const CITIES = ["Madrid", "Barcelona", "A Coruña", "Lugo", "Valencia", "Sevilla"];

const KINDS = [
  { tipo: "room", title: "Habitaciones", text: "En pisos compartidos, cerca de tu uni o tu curro.", Icon: BedIcon },
  { tipo: "flat", title: "Pisos enteros", text: "Para ir por libre o con tu grupo de amigos.", Icon: HomeIcon },
  { tipo: "seeking", title: "Compañeros", text: "Gente que busca piso o con quien compartir.", Icon: UsersIcon },
] as const;

const STEPS = [
  { title: "Encuentra", text: "Filtra por zona, precio y forma de vivir: mascotas, horarios, limpieza…" },
  { title: "Conoce", text: "Habla por el chat de Convivo y mira perfiles y reseñas antes de visitar." },
  { title: "Convive y opina", text: "Tras la estancia, os reseñáis mutuamente. Así se construye la confianza." },
];

async function latestListings() {
  if (!hasPublicEnv()) return [];
  try {
    return (await searchListings({})).items.slice(0, 6);
  } catch {
    return [];
  }
}

export default async function Home() {
  const listings = await latestListings();

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-brand text-brand-foreground">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60rem 30rem at 110% -10%, rgb(244 183 64 / 0.35), transparent 60%), radial-gradient(40rem 24rem at -10% 120%, rgb(0 0 0 / 0.25), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pb-24 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold ring-1 ring-white/20">
            <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
            Reseñas solo de quien ha convivido de verdad
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Tu próximo hogar, con gente <span className="text-accent">de confianza</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/85">
            Habitaciones, pisos y compañeros para estudiantes y jóvenes, con perfiles y reseñas reales.
          </p>

          <form
            method="get"
            action="/anuncios"
            className="mt-8 flex max-w-2xl flex-col gap-2 rounded-3xl bg-background p-2 text-foreground shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:rounded-full"
            role="search"
            aria-label="Buscar vivienda"
          >
            <label className="flex flex-1 items-center gap-2 rounded-full px-4 py-2">
              <SearchIcon className="size-5 shrink-0 text-muted" />
              <span className="sr-only">Ciudad</span>
              <input name="ciudad" placeholder="¿En qué ciudad?" className="w-full bg-transparent py-1 text-base outline-none placeholder:text-muted" />
            </label>
            <label className="sm:border-l sm:border-border">
              <span className="sr-only">Tipo</span>
              <select name="tipo" defaultValue="" className="w-full rounded-full bg-transparent px-4 py-2 text-base font-medium outline-none">
                <option value="">Todo</option>
                <option value="room">Habitación</option>
                <option value="flat">Piso entero</option>
                <option value="seeking">Compañeros</option>
              </select>
            </label>
            <button type="submit" className="rounded-full bg-accent px-6 py-3 font-bold text-accent-foreground hover:brightness-95">
              Buscar
            </button>
          </form>

          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Ciudades populares">
            {CITIES.map((c) => (
              <li key={c}>
                <Link
                  href={`/anuncios?ciudad=${encodeURIComponent(c)}`}
                  className="inline-block rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/20"
                >
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* QUÉ BUSCAS */}
      <section aria-labelledby="que-buscas" className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h2 id="que-buscas" className="text-2xl font-extrabold sm:text-3xl">
          ¿Qué estás buscando?
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {KINDS.map(({ tipo, title, text, Icon }) => (
            <li key={tipo}>
              <Link
                href={`/anuncios?tipo=${tipo}`}
                className="group flex h-full items-start gap-4 rounded-3xl border border-border bg-background p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-lift)]"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                  <Icon />
                </span>
                <span>
                  <span className="block text-lg font-bold">{title}</span>
                  <span className="mt-1 block text-sm text-muted">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* RECIÉN PUBLICADOS */}
      {listings.length ? (
        <section aria-labelledby="recientes" className="bg-surface py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex items-end justify-between gap-4">
              <h2 id="recientes" className="text-2xl font-extrabold sm:text-3xl">
                Recién publicados
              </h2>
              <Link href="/anuncios" className="font-bold text-brand hover:underline">
                Ver todos →
              </Link>
            </div>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l, i) => (
                <li key={l.id}>
                  <ListingCard listing={l} priority={i < 2} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* CÓMO FUNCIONA */}
      <section aria-labelledby="como-funciona" className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h2 id="como-funciona" className="text-2xl font-extrabold sm:text-3xl">
          Cómo funciona
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-extrabold text-accent-foreground">
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* CONFIANZA */}
      <section aria-labelledby="confianza" className="mx-auto max-w-6xl px-4 pb-12 sm:pb-16">
        <div className="grid gap-6 rounded-3xl bg-brand-soft p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-10">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-brand text-brand-foreground">
            <ShieldIcon className="size-8" />
          </span>
          <div>
            <h2 id="confianza" className="text-2xl font-extrabold">
              Reseñas que sí te puedes creer
            </h2>
            <p className="mt-2 max-w-2xl text-foreground/80">
              Solo puede opinar quien ha vivido de verdad en la casa, con la estancia confirmada por ambas partes. Las
              reseñas son a doble ciego: nadie ve la del otro hasta que los dos han opinado. Sin venganzas ni favores.
            </p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand">
              <StarIcon className="size-4" /> Inquilinos, propietarios y compañeros se valoran entre sí
            </p>
          </div>
        </div>
      </section>

      {/* CASEROS E INMOBILIARIAS */}
      <section aria-labelledby="caseros" className="mx-auto max-w-6xl px-4 pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-brand-strong p-8 text-brand-foreground sm:p-12">
          <div aria-hidden="true" className="absolute -right-10 -top-10 size-48 rounded-full bg-accent/20" />
          <span className="relative flex size-12 items-center justify-center rounded-2xl bg-white/10">
            <KeyIcon />
          </span>
          <h2 id="caseros" className="relative mt-4 text-2xl font-extrabold sm:text-3xl">
            ¿Tienes una habitación o un piso libre?
          </h2>
          <p className="relative mt-2 max-w-xl text-white/85">
            Para particulares e inmobiliarias. Publica gratis en minutos y elige inquilino viendo su perfil y sus reseñas.
          </p>
          <Link
            href="/publicar"
            className="relative mt-6 inline-block rounded-full bg-background px-6 py-3 font-bold text-brand hover:bg-brand-soft"
          >
            Publicar gratis
          </Link>
        </div>
      </section>
    </div>
  );
}
