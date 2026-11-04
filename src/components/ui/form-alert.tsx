import type { FormState } from "@/lib/forms";

/** Mensaje global de un formulario, anunciado por lectores de pantalla. */
export function FormAlert({ state }: { state: FormState }) {
  if (!state.message) return <div role="status" aria-live="polite" className="sr-only" />;
  const isError = state.status === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={
        "rounded-md border px-3 py-2 text-sm " +
        (isError
          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100")
      }
    >
      {state.message}
    </div>
  );
}
