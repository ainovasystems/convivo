import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Mi cuenta y mis datos", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/cuenta");

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Mi cuenta y mis datos</h1>
        <p className="mt-2 text-muted">
          Cuenta: <span className="font-semibold text-foreground">{user.email}</span>.{" "}
          <Link href="/perfil/editar" className="font-semibold text-brand underline">
            Editar mi perfil
          </Link>
        </p>
      </div>

      <section aria-labelledby="exportar" className="space-y-3 rounded-3xl border border-border bg-background p-5 shadow-[var(--shadow-card)]">
        <h2 id="exportar" className="text-lg font-bold">
          Descargar mis datos
        </h2>
        <p className="text-sm text-muted">
          Un archivo JSON con tu perfil, tus anuncios (con su dirección), tus conversaciones, tus estancias, las reseñas que
          has escrito y las ya publicadas sobre ti.
        </p>
        {/* Enlace normal (no next/link): es una descarga, no una página. */}
        <a
          href="/api/mis-datos"
          download
          className="inline-flex rounded-full border border-brand px-5 py-2.5 font-bold text-brand hover:bg-brand-soft"
        >
          Descargar mis datos
        </a>
      </section>

      <section aria-labelledby="borrar" className="space-y-4 rounded-3xl border border-red-200 bg-red-50/60 p-5">
        <h2 id="borrar" className="text-lg font-bold text-red-900">
          Borrar mi cuenta
        </h2>
        <div className="space-y-2 text-sm text-red-950">
          <p>Es definitivo y no se puede deshacer. Al borrarla:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Se borran tu perfil, tu foto, tus conversaciones, tus avisos y las fotos de tus anuncios.</li>
            <li>Tus anuncios se borran. Si alguno tiene estancias registradas, se cierra y se quita su dirección.</li>
            <li>
              <strong>Las reseñas no se borran: se desvinculan de tu cuenta.</strong> Las que escribiste y las que
              recibiste se quedan, pero en lugar de tu nombre aparece «Usuario eliminado». Así no desaparece la
              reputación que otras personas ganaron contigo y las valoraciones siguen siendo fiables.
            </li>
            <li>
              Ten en cuenta que quien convivió contigo puede deducir que una reseña era tuya por la estancia a la que
              corresponde.
            </li>
          </ul>
          <p>Si quieres guardar una copia, descarga antes tus datos.</p>
        </div>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
