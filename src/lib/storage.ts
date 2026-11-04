import { getPublicEnv } from "@/lib/env";

/** URL pública de un objeto de un bucket público. */
export function publicStorageUrl(bucket: "avatars" | "listing-photos", path: string): string {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encoded}`;
}
