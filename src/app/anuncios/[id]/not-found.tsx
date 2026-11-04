import Link from "next/link";

export default function ListingNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Anuncio no disponible</h1>
      <p className="mt-2 text-muted">Puede que se haya cerrado o que el enlace no sea correcto.</p>
      <Link href="/anuncios" className="mt-6 inline-block font-medium text-brand underline">
        Ver otros anuncios
      </Link>
    </div>
  );
}
