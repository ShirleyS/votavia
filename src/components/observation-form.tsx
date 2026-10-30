"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OBSERVATION_META } from "@/lib/taxonomy";
import { OBSERVATION_KINDS, type ObservationKind } from "@/shared/votavia-contract";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function ObservationForm({ caseId, compact = false }: { caseId: string; compact?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<ObservationKind>("comment");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (body.trim().length < 3) {
      setError("Escribe al menos 3 caracteres.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body: body.trim() }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(data.error?.message ?? "No pudimos guardar tu observación.");
        return;
      }
      setBody("");
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Hubo un problema de conexión. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={cn("space-y-3", compact && "space-y-2.5")}>
      <fieldset>
        <legend className="sr-only">Tipo de observación</legend>
        <div className="grid grid-cols-2 gap-2">
          {OBSERVATION_KINDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setKind(value);
                setSuccess(false);
              }}
              aria-pressed={kind === value}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors",
                kind === value
                  ? "border-royal-400 bg-royal-50 text-royal-800"
                  : "border-line bg-white text-navy-700 hover:bg-navy-50",
              )}
            >
              {OBSERVATION_META[value].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-navy-500">{OBSERVATION_META[kind].helper}</p>
      </fieldset>

      <label htmlFor={`observacion-${caseId}`} className="sr-only">
        Tu observación
      </label>
      <textarea
        id={`observacion-${caseId}`}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setSuccess(false);
        }}
        maxLength={800}
        rows={compact ? 3 : 4}
        required
        placeholder="Cuéntanos qué observas. No incluyas datos personales."
        className={cn(inputStyles, "resize-y")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-navy-500">{body.length}/800</p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enviando…" : "Publicar observación"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-xs font-medium text-emerald-700">
          Gracias. Tu observación ya es parte del reporte.
        </p>
      ) : null}
    </form>
  );
}
