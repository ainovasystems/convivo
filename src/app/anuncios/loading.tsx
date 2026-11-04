export default function Loading() {
  return (
    <div className="mx-auto grid max-w-6xl animate-pulse gap-8 px-4 py-8 lg:grid-cols-[260px_1fr]" aria-busy="true">
      <span className="sr-only">Cargando anuncios…</span>
      <div className="hidden space-y-3 lg:block">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 rounded bg-border" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-72 rounded-lg bg-border" />
        ))}
      </div>
    </div>
  );
}
