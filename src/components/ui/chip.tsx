import type { ReactNode } from "react";

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm " +
        (tone === "success"
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-border bg-background")
      }
    >
      {children}
    </span>
  );
}
