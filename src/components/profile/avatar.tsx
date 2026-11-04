import Image from "next/image";

import { publicStorageUrl } from "@/lib/storage";

const SIZES = { sm: 40, md: 64, lg: 112 } as const;

export function Avatar({
  name,
  path,
  size = "md",
}: {
  name: string;
  path: string | null;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  if (path) {
    return (
      <Image
        src={publicStorageUrl("avatars", path)}
        alt={`Foto de ${name}`}
        width={px}
        height={px}
        className="shrink-0 rounded-full border border-border object-cover"
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-semibold text-brand"
      style={{ width: px, height: px, fontSize: px / 2.6 }}
    >
      {initials || "?"}
    </span>
  );
}
