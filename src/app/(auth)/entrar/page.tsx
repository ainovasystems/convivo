import type { Metadata } from "next";

import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNextPath } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

const ERRORS: Record<string, string> = {
  enlace: "El enlace no es válido o ha caducado. Pide uno nuevo.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Entrar en Convivo</h1>
      <p className="mt-2 text-muted">Accede a tus anuncios, mensajes y reseñas.</p>
      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <div className="mt-8">
        <SignInForm next={next} />
      </div>
    </>
  );
}
