export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-6 px-4 py-8 sm:py-12" aria-busy="true">
      <span className="sr-only">Cargando tu perfil…</span>
      <div className="h-8 w-56 rounded bg-border" />
      <div className="size-28 shrink-0 rounded-full bg-border" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 rounded bg-border" />
      ))}
    </div>
  );
}
