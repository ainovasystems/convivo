import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createDraft } from "@/app/publicar/actions";
import { getCurrentUser } from "@/lib/auth";
import { KIND_DESCRIPTIONS, KIND_LABELS, LISTING_KINDS } from "@/lib/listings/options";
import { getMyListings } from "@/lib/listings/queries";

export const metadata: Metadata = { title: "Publicar anuncio", robots: { index: false } };

export default async function PublishPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/publicar");
  const drafts = (await getMyListings(user.id)).filter((l) => l.status === "draft");

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Publicar un anuncio</h1>
        <p className="mt-2 text-muted">Paso 1 de 4: ¿qué quieres publicar?</p>
      </div>

      <form action={createDraft}>
        <fieldset className="space-y-3">
          <legend className="sr-only">Tipo de anuncio</legend>
          {LISTING_KINDS.map((kind) => (
            <button
              key={kind}
              type="submit"
              name="kind"
              value={kind}
              className="block w-full rounded-lg border border-border p-4 text-left hover:border-brand focus-visible:outline-2"
            >
              <span className="block font-semibold">{KIND_LABELS[kind]}</span>
              <span className="block text-sm text-muted">{KIND_DESCRIPTIONS[kind]}</span>
            </button>
          ))}
        </fieldset>
      </form>

      {drafts.length ? (
        <section aria-labelledby="borradores" className="space-y-3">
          <h2 id="borradores" className="text-lg font-semibold">
            O continúa un borrador
          </h2>
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/publicar/${d.id}?paso=datos`} className="block rounded-md border border-border px-4 py-3 hover:border-brand">
                  <span className="font-medium">{d.title || "Sin título"}</span>
                  <span className="ml-2 text-sm text-muted">· {KIND_LABELS[d.kind]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
