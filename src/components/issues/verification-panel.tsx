"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CheckCircle2,
  CircleSlash,
  Loader2,
  ShieldQuestion,
  ThumbsDown,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import type { CommunityVerificationSummary, VerificationVerdict } from "@/shared/votavia-contract";

const OPTIONS: Array<{
  verdict: VerificationVerdict;
  label: string;
  helper: string;
  icon: typeof BadgeCheck;
  tone: string;
}> = [
  {
    verdict: "confirmed",
    label: "Sigue el problema",
    helper: "El problema continúa en el lugar.",
    icon: CheckCircle2,
    tone: "border-amber-300 bg-amber-50 text-amber-900",
  },
  {
    verdict: "verified_resolved",
    label: "Ya se resolvió",
    helper: "Vi el lugar y el problema ya no está.",
    icon: BadgeCheck,
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
  {
    verdict: "disputed",
    label: "No está resuelto",
    helper: "Se reportó como resuelto, pero no es así.",
    icon: ThumbsDown,
    tone: "border-rose-300 bg-rose-50 text-rose-900",
  },
];

export function VerificationPanel({
  issueId,
  initial,
  authenticated,
  loginHref,
}: {
  issueId: string;
  initial: CommunityVerificationSummary;
  authenticated: boolean;
  loginHref: string;
}) {
  const [summary, setSummary] = useState(initial);
  const [pending, setPending] = useState<VerificationVerdict | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(verdict: VerificationVerdict) {
    if (pending) return;
    setPending(verdict);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/issues/${encodeURIComponent(issueId)}/verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verdict }),
        },
      );
      const data = (await response.json()) as {
        verification?: CommunityVerificationSummary;
        error?: { message?: string };
      };
      if (!response.ok || !data.verification) {
        setMessage(data.error?.message ?? "No pudimos registrar tu verificación.");
        return;
      }
      setSummary(data.verification);
      setMessage("Gracias. Tu verificación quedó registrada.");
    } catch {
      setMessage("Hubo un problema de conexión. Intenta de nuevo.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
          {formatNumber(summary.verified_resolved)} resolvieron
        </span>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
          {formatNumber(summary.confirmed)} confirman
        </span>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
          {formatNumber(summary.disputed)} disputan
        </span>
      </div>

      {authenticated ? (
        <div className="mt-3 space-y-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = summary.my_verdict === option.verdict;
            return (
              <button
                key={option.verdict}
                type="button"
                onClick={() => submit(option.verdict)}
                disabled={Boolean(pending)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left text-xs transition-colors",
                  active ? option.tone : "border-line bg-white hover:bg-navy-50/60",
                )}
              >
                {pending === option.verdict ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                <span>
                  <span className="block font-bold">{option.label}</span>
                  <span className="mt-0.5 block opacity-80">{option.helper}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3">
          <p className="flex items-start gap-1.5 text-xs text-navy-500">
            <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Inicia sesión para confirmar o disputar el resultado.
          </p>
          <Link href={loginHref} className={cn(buttonStyles({ size: "sm" }), "mt-2 w-full")}>
            Entrar para verificar
          </Link>
        </div>
      )}

      {summary.my_verdict ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-navy-600">
          <CheckCircle2 className="h-3 w-3" aria-hidden /> Ya registraste tu verificación.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-[11px] text-navy-600">
          {message}
        </p>
      ) : null}
      {summary.disputed > summary.verified_resolved ? (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-rose-700">
          <CircleSlash className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          La comunidad reporta que el problema no está resuelto.
        </p>
      ) : null}
    </div>
  );
}
