import type { Metadata } from "next";

import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Estado del servicio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Check = { label: string; ok: boolean; detail: string; fix?: string };

/**
 * Diagnóstico para quien despliega la app: dice qué falta sin enseñar nunca
 * el valor de ninguna clave (solo si existe o no).
 */
async function runChecks(): Promise<Check[]> {
  const env = process.env;
  const checks: Check[] = [
    {
      label: "Dirección de Supabase",
      ok: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
      detail: env.NEXT_PUBLIC_SUPABASE_URL ? "Configurada" : "No configurada",
      fix: "Añade en Vercel la variable projecturl (o NEXT_PUBLIC_SUPABASE_URL) y vuelve a publicar.",
    },
    {
      label: "Clave pública de Supabase",
      ok: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      detail: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Configurada" : "No configurada",
      fix: "Añade en Vercel la variable publickey (sb_publishable_…) y vuelve a publicar.",
    },
    {
      label: "Clave secreta de Supabase",
      ok: Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.secretkey),
      detail: env.SUPABASE_SERVICE_ROLE_KEY || env.secretkey ? "Configurada" : "No configurada (los emails y avisos no funcionarán)",
      fix: "Añade en Vercel la variable secretkey (sb_secret_…).",
    },
    {
      label: "Dirección pública de la web",
      ok: Boolean(env.NEXT_PUBLIC_SITE_URL),
      detail: env.NEXT_PUBLIC_SITE_URL ?? "No configurada (se deduce de la dirección visitada)",
      fix: "Añade en Vercel la variable siteurl con https://tu-web.vercel.app y vuelve a publicar.",
    },
    {
      label: "Secreto de la tarea diaria",
      ok: Boolean(env.CRON_SECRET),
      detail: env.CRON_SECRET
        ? "CRON_SECRET configurado"
        : env.cronsecret
          ? "Existe cronsecret, pero Vercel solo lanza la tarea sola si se llama CRON_SECRET"
          : "No configurado",
      fix: "Opcional por ahora: los avisos de reseña no se enviarán solos.",
    },
  ];

  if (!hasPublicEnv()) return checks;

  const supabase = await createClient();

  const listings = await supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active");
  checks.push({
    label: "Conexión con la base de datos",
    ok: !listings.error,
    detail: listings.error ? `Error: ${listings.error.message}` : `Correcta · ${listings.count ?? 0} anuncios activos`,
    fix: listings.error?.message.includes("does not exist") || listings.error?.code === "PGRST205"
      ? "Falta instalar la base de datos: pega supabase/instalar-base-de-datos.sql en el SQL Editor de Supabase y pulsa Run."
      : "Revisa que projecturl y publickey sean del mismo proyecto de Supabase.",
  });

  // Objetos de la última migración: si existen, la instalación está completa.
  const latest = await supabase.from("review_responses").select("review_id", { head: true, count: "exact" });
  const fn = await supabase.rpc("review_criteria_for", { p_relationship: "tenant_to_listing" });
  const complete = !latest.error && !fn.error;
  checks.push({
    label: "Instalación completa de la base de datos",
    ok: complete,
    detail: complete ? "Todas las tablas y funciones están" : `Incompleta: ${(latest.error ?? fn.error)?.message}`,
    fix: "Vuelve a ejecutar supabase/instalar-base-de-datos.sql en un proyecto de Supabase nuevo o vacío.",
  });

  const auth = await supabase.auth.getClaims();
  checks.push({
    label: "Inicio de sesión",
    ok: !auth.error,
    detail: auth.error ? `Error: ${auth.error.message}` : auth.data?.claims ? "Funciona (tienes la sesión iniciada)" : "Funciona (no has iniciado sesión)",
  });

  return checks;
}

export default async function StatusPage() {
  const checks = await runChecks();
  const allOk = checks.every((c) => c.ok);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-extrabold">Estado del servicio</h1>
        <p className="mt-1 text-muted">
          Comprobación técnica de la configuración. No muestra el valor de ninguna clave, solo si está.
        </p>
      </div>
      <p
        className={
          "rounded-2xl px-4 py-3 font-semibold " +
          (allOk ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200")
        }
      >
        {allOk ? "✅ Todo en orden." : "⚠️ Hay cosas por revisar (abajo, en naranja)."}
      </p>
      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.label} className="rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow-card)]">
            <p className="font-bold">
              <span aria-hidden="true">{c.ok ? "✅" : "⚠️"}</span> {c.label}
            </p>
            <p className="mt-1 break-words text-sm text-muted">{c.detail}</p>
            {!c.ok && c.fix ? <p className="mt-2 text-sm font-medium text-brand">Cómo arreglarlo: {c.fix}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
