"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SeedSummary {
  cases: number;
  issues: number;
  supports: number;
  verifications: number;
  evidence: number;
  events: number;
  organization: string;
}

type Status = "idle" | "loading" | "done" | "error";

/**
 * Demo control: seeds the illustrative dataset, signs in the demo account and
 * unlocks the government console in a single click.
 */
export function DemoSeedButton({ className }: { className?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<SeedSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = status === "done" || status === "error";

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setStatus("idle");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function seed() {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/demo/seed", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        summary?: SeedSummary;
        error?: { message?: string };
      };
      if (!response.ok || !data.ok || !data.summary) {
        throw new Error(data.error?.message ?? "No pudimos preparar la demostración.");
      }
      setSummary(data.summary);
      setStatus("done");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos preparar la demostración.");
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={seed}
        disabled={status === "loading"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-royal-200 bg-royal-50 px-3 py-2 text-sm font-semibold text-royal-700 transition-colors hover:bg-royal-100 disabled:cursor-wait disabled:opacity-70",
          className,
        )}
        title="Cargar datos de demostración"
      >
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
        <span className="hidden sm:inline">{status === "loading" ? "Preparando…" : "Demo"}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-seed-title"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[var(--shadow-float)]"
          >
            <div className="flex items-start justify-between gap-4">
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl",
                  status === "done" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
                )}
              >
                {status === "done" ? (
                  <CheckCircle2 className="h-6 w-6" aria-hidden />
                ) : (
                  <X className="h-6 w-6" aria-hidden />
                )}
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setStatus("idle")}
                className="rounded-full p-1.5 text-navy-500 hover:bg-navy-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {status === "done" && summary ? (
              <>
                <h2 id="demo-seed-title" className="mt-4 text-xl font-extrabold text-navy-900">
                  Demo lista
                </h2>
                <p className="mt-1 text-sm text-navy-600">
                  Cargamos un expediente completo de {summary.organization} y una sesión de
                  demostración.
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Reportes", value: summary.cases },
                    { label: "Apoyos", value: summary.supports },
                    { label: "Verificaciones", value: summary.verifications },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl bg-navy-50 px-2 py-3">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-navy-500">
                        {item.label}
                      </dt>
                      <dd className="text-lg font-extrabold text-navy-900">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Link
                    href="/mis-reportes"
                    onClick={() => setStatus("idle")}
                    className={cn(buttonStyles({ size: "md" }), "flex-1 justify-center")}
                  >
                    Mis reportes <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <Link
                    href="/gobierno"
                    onClick={() => setStatus("idle")}
                    className={cn(buttonStyles({ variant: "secondary", size: "md" }), "flex-1 justify-center")}
                  >
                    Consola de gobierno
                  </Link>
                </div>
                <p className="mt-3 text-center text-[11px] text-navy-500">
                  Todos los registros están marcados como demostración.
                </p>
              </>
            ) : (
              <>
                <h2 id="demo-seed-title" className="mt-4 text-xl font-extrabold text-navy-900">
                  No se pudo cargar la demo
                </h2>
                <p className="mt-1 text-sm text-navy-600">{message}</p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={seed}
                    className={cn(buttonStyles({ size: "md" }), "flex-1 justify-center")}
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className={cn(buttonStyles({ variant: "ghost", size: "md" }), "flex-1 justify-center")}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
