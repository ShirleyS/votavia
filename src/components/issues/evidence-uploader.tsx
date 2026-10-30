"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function EvidenceUploader({ issueId }: { issueId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Adjunta una fotografía.");
      return;
    }
    setPending(true);
    try {
      const form = new FormData();
      form.set("payload", JSON.stringify({ kind: "citizen_followup", caption: caption.trim() || null }));
      form.set("photo", file);
      const response = await fetch(`/api/issues/${encodeURIComponent(issueId)}/evidence`, {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "No pudimos subir la evidencia.");
      setFile(null);
      setCaption("");
      setDone(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos subir la evidencia.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setDone(false);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-3 py-2.5 text-left text-xs font-semibold text-navy-600 hover:border-royal-300 hover:text-royal-700",
          file && "border-royal-300 bg-royal-50 text-royal-800",
        )}
      >
        {file ? <Camera className="h-4 w-4" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">
          {file ? file.name : "Agregar foto de seguimiento"}
        </span>
        <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>

      <label htmlFor={`evidence-caption-${issueId}`} className="sr-only">
        Descripción de la evidencia
      </label>
      <input
        id={`evidence-caption-${issueId}`}
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        maxLength={240}
        placeholder="Describe qué muestra la foto (opcional)"
        className={inputStyles}
      />

      <Button type="submit" size="sm" disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? "Subiendo…" : "Publicar evidencia"}
      </Button>

      {error ? (
        <p role="alert" className="text-[11px] font-medium text-rose-600">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-[11px] font-medium text-emerald-700">
          Evidencia publicada con tu atribución.
        </p>
      ) : null}
    </form>
  );
}
