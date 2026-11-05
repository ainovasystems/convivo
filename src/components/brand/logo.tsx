/**
 * Logotipo: un tejado sencillo sobre la "o" (hogar) + wordmark en minúsculas,
 * redondeado y cercano, como las marcas de app actuales.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M8 15.5 16 9l8 6.5" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="19.5" r="4.6" fill="none" stroke="#fff" strokeWidth="2.6" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="text-xl font-extrabold tracking-tight text-brand">convivo</span>
    </span>
  );
}
