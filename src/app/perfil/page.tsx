import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

/** /perfil -> tu perfil público. */
export default async function MyProfileRedirect() {
  const user = await getCurrentUser();
  redirect(user ? `/perfil/${user.id}` : "/entrar?next=/perfil");
}
