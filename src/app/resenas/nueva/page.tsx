import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ReviewForm } from "@/components/reviews/review-form";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/reviews/labels";
import { getReviewFormContext } from "@/lib/reviews/queries";

export const metadata: Metadata = { title: "Escribir reseña", robots: { index: false } };

const paramsSchema = z.object({ estancia: z.uuid(), sujeto: z.uuid() });

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/mis-resenas");
  const parsed = paramsSchema.safeParse(await searchParams);
  const task = parsed.success ? await getReviewFormContext(user.id, parsed.data.estancia, parsed.data.sujeto) : null;

  if (!task) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">No puedes escribir esta reseña</h1>
        <p className="mt-2 text-muted">
          Puede que ya la hayas escrito, que la ventana para reseñar esté cerrada o que no formes parte de esa estancia.
        </p>
        <Link href="/mis-resenas" className="mt-6 inline-block font-medium text-brand underline">
          Ver mis reseñas
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">{task.title}</p>
        <h1 className="text-2xl font-bold tracking-tight">{task.subjectName}</h1>
        <p className="mt-2 text-muted">Puedes escribirla hasta el {formatDate(task.closesAt)}.</p>
      </div>
      <ReviewForm
        stayId={task.stayId}
        subjectType={task.subjectType}
        subjectId={task.subjectId}
        relationship={task.relationship}
      />
    </div>
  );
}
