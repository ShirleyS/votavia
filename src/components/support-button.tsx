"use client";

import { useState } from "react";
import { Check, ThumbsUp } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

export function SupportButton({
  caseId,
  initialCount,
  initialSupported,
  size = "md",
  className,
}: {
  caseId: string;
  initialCount: number;
  initialSupported: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [supported, setSupported] = useState(initialSupported);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSupport() {
    if (pending) return;
    if (supported) {
      setMessage("Ya apoyaste este reporte desde este dispositivo.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as
        | { support?: { support_count: number } }
        | { error?: { message?: string } };
      if (!response.ok) {
        setMessage(("error" in data && data.error?.message) || "No pudimos registrar tu apoyo.");
        return;
      }
      if ("support" in data && data.support) {
        setCount(data.support.support_count);
        setSupported(true);
        setMessage("¡Gracias! Tu apoyo quedó registrado.");
      }
    } catch {
      setMessage("Hubo un problema de conexión. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <button
        type="button"
        onClick={handleSupport}
        disabled={pending || supported}
        aria-pressed={supported}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors disabled:cursor-default",
          size === "lg" ? "h-12 px-6 text-base" : size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-5 text-sm",
          supported
            ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
            : "bg-royal-600 text-white hover:bg-royal-700",
        )}
      >
        {supported ? <Check className="h-4 w-4" aria-hidden /> : <ThumbsUp className="h-4 w-4" aria-hidden />}
        {supported ? "Ya apoyas este reporte" : pending ? "Registrando…" : "Apoyar este reporte"}
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">{formatNumber(count)}</span>
      </button>
      <p aria-live="polite" className="min-h-4 text-xs text-navy-500">
        {message}
      </p>
    </div>
  );
}
