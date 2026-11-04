import Link from "next/link";

import { PAGE_SIZE, serializeFilters, type ListingFilters } from "@/lib/listings/filters";

export function Pagination({ filters, total }: { filters: ListingFilters; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(filters.pagina ?? 1, pages);
  if (pages <= 1) return null;

  const href = (page: number) => `/anuncios${serializeFilters({ ...filters, pagina: page })}`;
  const linkClass = "rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-brand";

  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-2">
      {current > 1 ? (
        <Link href={href(current - 1)} className={linkClass} rel="prev">
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">
        Página {current} de {pages}
      </span>
      {current < pages ? (
        <Link href={href(current + 1)} className={linkClass} rel="next">
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
