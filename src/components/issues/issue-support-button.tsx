"use client";

import { useState } from "react";
import { Check, Loader2, ThumbsUp, Undo2 } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";

export function IssueSupportButton({
  issueId,
  initialCount,
  initialSupported,
  authenticated,
  className,
}: {
  issueId: string;
  initialCount: number;
  initialSupported: boolean;
  authenticated: boolean;
  className?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [supported, setSupported] = useState(initialSupported);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/issues/${encodeURIComponent(issueId)}/support`,
        { method: supported ? "DELETE" : "POST" },
      );
      const data = (await response.json()) as {
        support?: { support_count: number; supported_by_me: boolean };
        error?: { message?: string };
      };
      if (!response.ok || !data.support) {
        setMessage(data.error?.message ?? "No pudimos actualizar tu apoyo.");
        return;
      }
      setCount(data.support.support_count);
      setSupported(data.support.supported_by_me);
      setMessage(
        data.support.supported_by_me
          ? "Gracias. Tu apoyo quedó registrado."
          : "Retiramos tu apoyo de este caso.",
      );
    } catch {
      setMessage("Hubo un problema de conexión. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={supported}
        className={cn(
          buttonStyles({ variant: supported ? "secondary" : "primary", size: "lg" }),
          "w-full",
        )}
      >
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : supported ? (
          <Check className="h-5 w-5" aria-hidden />
        ) : (
          <ThumbsUp className="h-5 w-5" aria-hidden />
        )}
        {supported ? "Apoyas este caso" : "Apoyar este caso"}
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold tabular-nums">
          {formatNumber(count)}
        </span>
      </button>

      {supported ? (
        <p className="mt-2 flex items-start justify-center gap-1 text-[11px] text-navy-500">
          <Undo2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {authenticated
            ? "Puedes retirar tu apoyo en cualquier momento."
            : "Inicia sesión para poder retirar tu apoyo."}
        </p>
      ) : (
        <p className="mt-2 text-center text-[11px] text-navy-500">
          Un apoyo por persona. Ayuda a priorizar el caso.
        </p>
      )}
      {message ? (
        <p role="status" className="mt-2 text-center text-[11px] font-medium text-navy-600">
          {message}
        </p>
      ) : null}
    </div>
  );
}
