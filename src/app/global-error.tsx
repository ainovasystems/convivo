"use client";

/** Último recurso: si falla incluso el layout. Sin dependencias para que siempre se pinte. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem", color: "#2b1d14" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Algo se ha torcido</h1>
        <p style={{ color: "#6f5e50" }}>No hemos podido cargar Convivo. Prueba otra vez en unos segundos.</p>
        <button
          type="button"
          onClick={reset}
          style={{ marginTop: "1.5rem", background: "#7b4b2a", color: "#fff", border: 0, borderRadius: 999, padding: "0.75rem 1.5rem", fontWeight: 700 }}
        >
          Reintentar
        </button>
        {error.digest ? <p style={{ marginTop: "1.5rem", fontSize: 12, color: "#6f5e50" }}>Código del error: {error.digest}</p> : null}
      </body>
    </html>
  );
}
