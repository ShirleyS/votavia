"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function ClaimReport({
  caseId,
  displayId,
  demoAuth,
  defaultEmail = "",
}: {
  caseId: string;
  displayId: string;
  demoAuth: boolean;
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Escribe un correo válido.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, email: email.trim() }),
      });
      const data = (await response.json()) as {
        link?: string;
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(data.error?.message ?? "No pudimos preparar el enlace.");
      setMessage(data.message ?? "Revisa tu correo para verificar el reporte.");
      if (data.link) setLink(data.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos preparar el enlace.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-royal-200 bg-royal-50/60 p-4">
      <p className="text-sm font-bold text-navy-900">¿Este reporte es tuyo?</p>
      <p className="mt-1 text-xs leading-relaxed text-navy-600">
        Verifica el correo con el que lo enviaste para vincularlo a tu cuenta y consultarlo en{" "}
        <span className="font-semibold">Mis reportes</span>. Folio: {displayId}.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label htmlFor={`claim-${caseId}`} className="sr-only">
          Correo del reporte
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" aria-hidden />
          <input
            id={`claim-${caseId}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@correo.mx"
            className={cn(inputStyles, "pl-9")}
          />
        </div>
        <button type="submit" disabled={pending} className={cn(buttonStyles({ size: "sm" }), "w-full")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {pending ? "Preparando enlace…" : "Vincular a mi cuenta"}
        </button>
      </form>
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
      {message ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-navy-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          {message}
        </p>
      ) : null}
      {link ? (
        <Link href={link} className={cn(buttonStyles({ size: "sm" }), "mt-2 w-full")}>
          Abrir mi enlace de acceso
        </Link>
      ) : null}
      {demoAuth ? (
        <p className="mt-2 text-[11px] text-navy-500">
          Modo demostración: no se envía correo real; el enlace se muestra aquí.
        </p>
      ) : null}
    </div>
  );
}
