"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail, Sparkles } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function LoginForm({
  next,
  demoAuth,
}: {
  next: string;
  demoAuth: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [demoPending, setDemoPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Escribe un correo válido.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      const data = (await response.json()) as {
        mode?: string;
        link?: string;
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(data.error?.message ?? "No pudimos enviar el enlace.");
      setMessage(data.message ?? "Revisa tu correo para abrir el enlace de acceso.");
      if (data.link) setLink(data.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos enviar el enlace.");
    } finally {
      setPending(false);
    }
  }

  async function enterDemo() {
    setError(null);
    setDemoPending(true);
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "No pudimos iniciar la sesión de demostración.");
      }
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos iniciar la sesión.");
    } finally {
      setDemoPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={sendLink} className="space-y-3">
        <div className="space-y-2">
          <label htmlFor="login-email" className="block text-sm font-semibold text-navy-900">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" aria-hidden />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@correo.mx"
              className={cn(inputStyles, "pl-9")}
              required
            />
          </div>
          <p className="text-xs text-navy-500">
            Te enviamos un enlace de un solo uso. No necesitas contraseña.
          </p>
        </div>
        <button type="submit" disabled={pending} className={cn(buttonStyles({ size: "lg" }), "w-full")}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Mail className="h-5 w-5" aria-hidden />}
          {pending ? "Enviando enlace…" : "Enviarme un enlace de acceso"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <div className="rounded-xl bg-royal-50 p-3 text-sm text-royal-900" role="status">
          <p>{message}</p>
          {link ? (
            <a
              href={link}
              className={cn(buttonStyles({ size: "sm" }), "mt-3 w-full")}
            >
              Abrir mi enlace de acceso <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}

      {demoAuth ? (
        <>
          <div className="flex items-center gap-3 py-1" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">o</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            onClick={enterDemo}
            disabled={demoPending}
            className={cn(buttonStyles({ variant: "secondary", size: "md" }), "w-full")}
          >
            {demoPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            Entrar con una cuenta de demostración
          </button>
          <p className="text-center text-[11px] text-navy-500">
            Sin proveedor de correo configurado, el enlace se muestra en pantalla y los datos viven
            en este entorno.
          </p>
        </>
      ) : null}
    </div>
  );
}
