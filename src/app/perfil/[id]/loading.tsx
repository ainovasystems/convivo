export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-8 px-4 py-8 sm:py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando perfil…</span>
      <div className="flex gap-5">
        <div className="size-28 shrink-0 rounded-full bg-border" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="h-7 w-48 rounded bg-border" />
          <div className="h-4 w-64 rounded bg-border" />
          <div className="h-4 w-40 rounded bg-border" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-5 w-32 rounded bg-border" />
        <div className="h-4 w-full rounded bg-border" />
        <div className="h-4 w-5/6 rounded bg-border" />
      </div>
      <div className="h-32 rounded-2xl bg-border" />
    </div>
  );
}
