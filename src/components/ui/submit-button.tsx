"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 font-medium text-brand-foreground " +
  "hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function SubmitButton({ children, pendingText }: { children: ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={buttonClass} disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
