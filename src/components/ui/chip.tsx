import type { ReactNode } from "react";

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold " +
        (tone === "success" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-brand-soft text-brand")
      }
    >
      {children}
    </span>
  );
}
