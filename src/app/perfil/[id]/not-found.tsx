import Link from "next/link";

export default function ProfileNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Perfil no encontrado</h1>
      <p className="mt-2 text-muted">Puede que el enlace esté mal o que la cuenta se haya eliminado.</p>
      <Link href="/anuncios" className="mt-6 inline-block font-medium text-brand underline">
        Ver anuncios
      </Link>
    </div>
  );
}
