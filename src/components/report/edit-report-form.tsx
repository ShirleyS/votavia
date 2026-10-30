"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORY_META } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { CASE_CATEGORIES, type CaseCategory } from "@/shared/votavia-contract";

export function EditReportForm({
  caseId,
  displayId,
  initial,
  canWithdraw,
}: {
  caseId: string;
  displayId: string;
  initial: {
    title: string;
    description: string;
    category: CaseCategory;
    address_hint: string | null;
  };
  canWithdraw: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState<CaseCategory>(initial.category);
  const [addressHint, setAddressHint] = useState(initial.address_hint ?? "");
  const [pending, setPending] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (title.trim().length < 6) return setError("Escribe un título de al menos 6 caracteres.");
    if (description.trim().length < 15) return setError("Cuéntanos un poco más: al menos 15 caracteres.");
    setPending(true);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          address_hint: addressHint.trim() || null,
        }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "No pudimos guardar los cambios.");
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar los cambios.");
    } finally {
      setPending(false);
    }
  }

  async function withdraw() {
    setError(null);
    setWithdrawing(true);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/withdraw`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "No pudimos retirar el reporte.");
      router.push(`/reportes/${caseId}?retirado=1`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos retirar el reporte.");
      setConfirming(false);
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">{displayId}</p>
          <h2 className="mt-1 text-xl font-extrabold">Editar reporte</h2>
          <p className="mt-1 text-sm text-navy-500">
            Puedes corregir la información mientras el caso sigue en revisión. Los cambios quedan en
            el historial público.
          </p>
        </div>

        <fieldset>
          <legend className="block text-sm font-semibold text-navy-900">Categoría</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CASE_CATEGORIES.map((value) => {
              const meta = CATEGORY_META[value];
              const selected = category === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-sm",
                    selected
                      ? "border-royal-400 bg-royal-50 ring-1 ring-royal-200"
                      : "border-line bg-white hover:bg-navy-50/60",
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    value={value}
                    checked={selected}
                    onChange={() => setCategory(value)}
                    className="sr-only"
                  />
                  <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg", meta.chip)}>
                    <CategoryIcon category={value} className="h-4 w-4" />
                  </span>
                  <span className="font-semibold text-navy-800">{meta.shortLabel}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="edit-title" className="block text-sm font-semibold text-navy-900">
            Título
          </label>
          <input
            id="edit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={140}
            className={inputStyles}
          />
          <p className="text-xs text-navy-500">{title.length}/140</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="edit-description" className="block text-sm font-semibold text-navy-900">
            Descripción
          </label>
          <textarea
            id="edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={6}
            className={cn(inputStyles, "resize-y")}
          />
          <p className="text-xs text-navy-500">{description.length}/2000</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="edit-address" className="block text-sm font-semibold text-navy-900">
            Referencia (opcional)
          </label>
          <input
            id="edit-address"
            value={addressHint}
            onChange={(event) => setAddressHint(event.target.value)}
            maxLength={160}
            placeholder="Calle y número, entre calles…"
            className={inputStyles}
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Cambios guardados.
          </p>
        ) : null}

        <Button type="submit" disabled={pending} size="md">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>

      {canWithdraw ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-900">
            <Trash2 className="h-4 w-4" aria-hidden /> Retirar este reporte
          </p>
          <p className="mt-1 text-xs leading-relaxed text-rose-900/80">
            El reporte dejará de estar activo y se marcará como cerrado. No se borra: conservamos el
            historial para que las cuentas públicas sigan siendo honestas.
          </p>
          {confirming ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={withdraw}
                disabled={withdrawing}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {withdrawing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Sí, retirar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-semibold text-navy-800 ring-1 ring-inset ring-line"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
            >
              <TriangleAlert className="h-4 w-4" aria-hidden /> Quiero retirarlo
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
