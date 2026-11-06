import type { Metadata } from "next";
import Link from "next/link";

import { NoticeForm } from "@/components/moderation/notice-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Notificar contenido ilegal",
  description: "Avísanos de un anuncio, perfil o reseña de Convivo que creas que es ilegal. No hace falta tener cuenta.",
};

export default async function NoticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:py-12">
      <div className="space-y-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Notificar contenido ilegal</h1>
        <p className="text-muted">
          Si un anuncio, un perfil o una reseña de Convivo te parece ilegal (difamación, datos personales, discriminación,
          estafa…), cuéntanoslo. <strong>No hace falta tener cuenta</strong>: también puedes usar este formulario si eres,
          por ejemplo, un casero al que han reseñado.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Te enviaremos un acuse de recibo con una referencia.</li>
          <li>Una persona del equipo la revisará en un máximo de 72 horas.</li>
          <li>Te contaremos la decisión y sus motivos. Si retiramos el contenido, también se lo explicaremos a quien lo publicó.</li>
        </ul>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          Si alguien está en peligro, llama al <strong>112</strong>. Este formulario no es un servicio de emergencias.
        </p>
      </div>
      <NoticeForm url={first(params.url)} reviewId={first(params.resena)} email={user?.email ?? ""} />
      <p className="text-sm text-muted">
        Trataremos tus datos solo para gestionar la notificación. Más información en la{" "}
        <Link href="/privacidad" className="font-semibold text-brand underline">
          política de privacidad
        </Link>
        .
      </p>
    </div>
  );
}
