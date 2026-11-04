import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false } };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-2 text-muted">
        Gratis. Con tu perfil podrás publicar anuncios, contactar y, tras convivir, dejar y recibir reseñas.
      </p>
      <div className="mt-8">
        <SignUpForm />
      </div>
    </>
  );
}
