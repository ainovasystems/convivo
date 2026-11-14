export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-4 py-8" aria-busy="true">
      <span className="sr-only">Cargando anuncios…</span>
      <div className="h-[4.5rem] rounded-2xl bg-border" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-72 rounded-2xl bg-border" />
        ))}
      </div>
    </div>
  );
}
