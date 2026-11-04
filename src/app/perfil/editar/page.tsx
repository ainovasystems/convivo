import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { ProfileForm } from "@/components/profile/profile-form";
import { getCurrentUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile/queries";

export const metadata: Metadata = { title: "Editar perfil", robots: { index: false } };

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/perfil/editar");

  const [profile, params] = await Promise.all([getProfile(user.id), searchParams]);
  if (!profile) redirect("/");

  const welcome = params.bienvenida === "1";

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{welcome ? "¡Bienvenido/a a Convivo!" : "Editar perfil"}</h1>
        <p className="mt-2 text-muted">
          {welcome
            ? "Completa tu perfil: los perfiles con foto y presentación reciben muchas más respuestas."
            : "Lo que pongas aquí es público. No incluyas teléfono, dirección ni datos sensibles."}
        </p>
      </div>
      <section aria-label="Foto de perfil">
        <AvatarUploader name={profile.display_name} path={profile.avatar_path} />
      </section>
      <ProfileForm
        initial={{
          id: profile.id,
          displayName: profile.display_name,
          bio: profile.bio,
          city: profile.city,
          occupation: profile.occupation,
          ageRange: profile.age_range,
          languages: profile.languages,
          roles: profile.roles,
          habits: profile.habits,
        }}
      />
    </div>
  );
}
