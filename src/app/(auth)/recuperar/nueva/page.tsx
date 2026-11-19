import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NewPasswordForm } from "@/components/auth/new-password-form";
import { RECOVERY_EXPIRED_PATH } from "@/lib/account/password-recovery";
import { getRecoveryUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Elige una contraseña nueva", robots: { index: false } };

/**
 * Destino del enlace del email de recuperación (pasando por /auth/callback).
 * Solo se ve con la sesión que abre ese enlace: sin ella, o pasado el margen,
 * se vuelve a la pantalla de pedir otro.
 */
export default async function NewPasswordPage() {
  const user = await getRecoveryUser();
  if (!user) redirect(RECOVERY_EXPIRED_PATH);

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Elige una contraseña nueva</h1>
      <p className="mt-2 text-muted">
        {user.email ? (
          <>
            Es para la cuenta <strong className="font-semibold text-foreground">{user.email}</strong>.{" "}
          </>
        ) : null}
        Al guardarla entrarás directamente.
      </p>
      <div className="mt-8">
        <NewPasswordForm />
      </div>
    </>
  );
}
