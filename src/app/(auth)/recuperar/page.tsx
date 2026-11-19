import type { Metadata } from "next";
import Link from "next/link";

import { PasswordResetRequestForm } from "@/components/auth/password-reset-request-form";
import { RECOVERY_EXPIRED_MESSAGE } from "@/lib/account/password-recovery";

export const metadata: Metadata = { title: "Recuperar la contraseña", robots: { index: false } };

export default async function PasswordResetRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const expired = params.error === "enlace";

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{expired ? "Pide otro enlace" : "¿Olvidaste tu contraseña?"}</h1>
      <p className="mt-2 text-muted">
        Escribe el email de tu cuenta y te enviamos un enlace para elegir una contraseña nueva. Sirve también si hasta ahora
        entrabas solo con el enlace por email y quieres ponerte una contraseña.
      </p>
      {expired ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {RECOVERY_EXPIRED_MESSAGE}
        </p>
      ) : null}
      <div className="mt-8">
        <PasswordResetRequestForm />
      </div>
      <p className="mt-6 text-sm text-muted">
        ¿Te has acordado?{" "}
        <Link href="/entrar" className="inline-block py-2 font-medium text-brand underline">
          Volver a entrar
        </Link>
      </p>
    </>
  );
}
