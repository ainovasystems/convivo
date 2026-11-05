import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">🔑</p>
      <h1 className="mt-4 text-2xl font-extrabold">Esta puerta no lleva a ningún sitio</h1>
      <p className="mt-2 text-muted">La página que buscas no existe o ya no está disponible.</p>
      <Link href="/anuncios" className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-bold text-brand-foreground hover:bg-brand-strong">
        Buscar vivienda
      </Link>
    </div>
  );
}
