import { formatRating } from "@/lib/reviews/labels";

/** Nota con estrellas y texto accesible ("4,5 de 5"). */
export function Rating({ value, count, size = "md" }: { value: number; count?: number; size?: "sm" | "md" }) {
  const full = Math.round(value);
  return (
    <span className={"inline-flex items-center gap-1.5 " + (size === "sm" ? "text-sm" : "text-base")}>
      <span aria-hidden="true" className="tracking-tight text-amber-500">
        {"★".repeat(full)}
        <span className="text-border">{"★".repeat(5 - full)}</span>
      </span>
      <span className="font-semibold">{formatRating(value)}</span>
      <span className="sr-only">de 5</span>
      {count !== undefined ? (
        <span className="text-muted">
          ({count} {count === 1 ? "reseña" : "reseñas"})
        </span>
      ) : null}
    </span>
  );
}
