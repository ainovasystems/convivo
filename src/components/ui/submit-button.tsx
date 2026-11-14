"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 font-bold text-brand-foreground shadow-[var(--shadow-card)] " +
  "transition hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-red-700 px-6 py-3 font-bold text-white shadow-[var(--shadow-card)] " +
  "transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

export function SubmitButton({
  children,
  pendingText,
  tone,
}: {
  children: ReactNode;
  pendingText: string;
  /** «danger»: acción destructiva, en rojo. */
  tone?: "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={tone === "danger" ? dangerButtonClass : buttonClass} disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
