"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Crosshair,
  ImagePlus,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trash2,
  ThumbsUp,
  Users,
} from "lucide-react";
import { CaseMap, type MapCase } from "@/components/map/case-map";
import { CategoryIcon } from "@/components/category-icon";
import { buttonStyles } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import {
  CATEGORY_META,
  COLONIA_CENTROIDS,
  COLONIAS,
  CUAUHTEMOC_CENTER,
  STATUS_META,
} from "@/lib/taxonomy";
import { cn, distanceMeters, formatDistance } from "@/lib/utils";
import {
  CASE_CATEGORIES,
  type Case,
  type CaseCategory,
  type DraftDuplicateCandidate,
  type RelatedReport,
} from "@/shared/votavia-contract";

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const STEPS = ["Categoría", "Descripción", "Ubicación", "Fotos y contacto"] as const;
const STEP_HINTS = [
  "Elige la categoría del problema.",
  "Cuéntanos qué pasa.",
  "Marca el punto en el mapa.",
  "Adjunta fotos y tu contacto.",
] as const;

function nearestColonia(point: { latitude: number; longitude: number }) {
  let best = COLONIAS[0] as string;
  let bestMeters = Number.POSITIVE_INFINITY;
  for (const [name, centroid] of Object.entries(COLONIA_CENTROIDS)) {
    const meters = distanceMeters(point, { latitude: centroid.lat, longitude: centroid.lng });
    if (meters < bestMeters) {
      best = name;
      bestMeters = meters;
    }
  }
  return best;
}

function fieldError(message: string) {
  return Object.assign(new Error(message), { status: 422 });
}

const RELATIONSHIP_META: Record<
  DraftDuplicateCandidate["relationship"],
  { label: string; chip: string }
> = {
  same_problem: { label: "Mismo problema", chip: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" },
  related_problem: { label: "Problema relacionado", chip: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200" },
  uncertain: { label: "Posible coincidencia", chip: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200" },
};

/** Max characters the observations endpoint accepts. */
const MAX_OBSERVATION_CHARS = 800;

export function ReportWizard({
  initialEmail,
  authenticated,
  demoAuth,
}: {
  initialEmail: string;
  authenticated: boolean;
  demoAuth: boolean;
}) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<CaseCategory | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [safety, setSafety] = useState(false);
  const [accessibility, setAccessibility] = useState(false);
  const [picked, setPicked] = useState<{ latitude: number; longitude: number } | null>(null);
  const [colonia, setColonia] = useState("");
  const [addressHint, setAddressHint] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState(initialEmail);
  const [nearby, setNearby] = useState<RelatedReport[]>([]);
  const [similar, setSimilar] = useState<DraftDuplicateCandidate[]>([]);
  const [comparison, setComparison] = useState<{
    method: "model" | "deterministic";
    model: string;
    fallback: boolean;
    evaluated: number;
  } | null>(null);
  const [confirmJoin, setConfirmJoin] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<{
    case_id: string;
    display_id: string;
    title: string;
  } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Case | null>(null);
  const [claimLink, setClaimLink] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const previews = useMemo(
    () => files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
    };
  }, [previews]);

  // Deterministic nearby lookup: the dependable baseline, always available.
  useEffect(() => {
    if (!picked) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          lat: String(picked.latitude),
          lng: String(picked.longitude),
          radius: "350",
        });
        if (category) params.set("category", category);
        const response = await fetch(`/api/cases/nearby?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("nearby");
        const data = (await response.json()) as { results?: RelatedReport[] };
        if (!controller.signal.aborted) setNearby(data.results ?? []);
      } catch {
        // Keep whatever we already have; the wizard stays usable.
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [picked, category]);

  // Advisory AI pass. Optional: on any failure we silently keep the
  // deterministic nearby results and reporting continues normally.
  useEffect(() => {
    if (!picked || !category) return;
    if (description.trim().length < 10) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setChecking(true);
      try {
        const response = await fetch("/api/cases/duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            description: description.trim(),
            title: title.trim() || null,
            category,
            latitude: picked.latitude,
            longitude: picked.longitude,
            colonia: colonia || null,
          }),
        });
        if (!response.ok) throw new Error("analysis");
        const data = (await response.json()) as {
          analysis?: {
            duplicates?: DraftDuplicateCandidate[];
            comparison?: {
              method: "model" | "deterministic";
              model: string;
              fallback: boolean;
              evaluated: number;
            } | null;
          } | null;
        };
        if (controller.signal.aborted) return;
        setSimilar(data.analysis?.duplicates ?? []);
        setComparison(data.analysis?.comparison ?? null);
      } catch {
        // Ignore: AI is advisory and must never block reporting.
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }, 700);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [picked, category, description, title, colonia]);

  const nearbyResults = picked && category ? nearby : [];
  const mapCases: MapCase[] = nearbyResults.flatMap((item) =>
    typeof item.latitude === "number" && typeof item.longitude === "number"
      ? [
          {
            case_id: item.case_id,
            display_id: item.display_id,
            title: item.title,
            colonia: "",
            category: item.category,
            status: item.status,
            support_count: item.support_count,
            latitude: item.latitude,
            longitude: item.longitude,
          },
        ]
      : [],
  );

  function choosePoint(point: { latitude: number; longitude: number }) {
    setPicked(point);
    setColonia(nearestColonia(point));
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setError("Tu navegador no comparte la ubicación. Marca el punto en el mapa.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        if (
          point.latitude < 19.2 ||
          point.latitude > 19.6 ||
          point.longitude < -99.35 ||
          point.longitude > -98.95
        ) {
          setError("Tu ubicación parece estar fuera de Cuauhtémoc. Marca el punto en el mapa.");
        } else {
          choosePoint(point);
        }
        setLocating(false);
      },
      () => {
        setError("No pudimos leer tu ubicación. Marca el punto en el mapa.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const next = [...files];
    for (const file of incoming) {
      if (next.length >= MAX_PHOTOS) {
        setError(`Puedes adjuntar máximo ${MAX_PHOTOS} fotografías.`);
        break;
      }
      if (!ACCEPTED.includes(file.type)) {
        setError("Solo aceptamos fotografías JPG, PNG o WEBP.");
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError("Cada fotografía debe pesar menos de 5 MB.");
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  }

  async function joinCase(item: DraftDuplicateCandidate) {
    if (joining) return;
    setJoining(item.case_id);
    setJoinError(null);
    try {
      const support = await fetch(`/api/cases/${encodeURIComponent(item.case_id)}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!support.ok) throw new Error("support");

      // The citizen's own words become context on the existing case, so the
      // report is not lost when it joins an already-open one.
      const body = description.trim().slice(0, MAX_OBSERVATION_CHARS);
      if (body.length >= 10) {
        await fetch(`/api/cases/${encodeURIComponent(item.case_id)}/observations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "comment", body }),
        }).catch(() => null);
      }

      setJoined({ case_id: item.case_id, display_id: item.display_id, title: item.title });
      setSimilar([]);
      setConfirmJoin(null);
    } catch {
      setJoinError("No pudimos sumar tu reporte a ese caso. Intenta de nuevo o crea uno nuevo.");
    } finally {
      setJoining(null);
    }
  }

  function goNext() {
    setError(null);
    if (step === 0 && !category) return setError("Elige la categoría que mejor describa el problema.");
    if (step === 1) {
      if (title.trim().length < 6) return setError("Escribe un título de al menos 6 caracteres.");
      if (description.trim().length < 15) {
        return setError("Cuéntanos un poco más: al menos 15 caracteres.");
      }
    }
    if (step === 2) {
      if (!picked) return setError("Marca el punto exacto en el mapa.");
      if (!colonia.trim()) return setError("Elige la colonia del reporte.");
    }
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!category || !picked) return setError("Falta la categoría o la ubicación.");
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return setError("Revisa el correo: no parece válido.");
    }
    setSubmitting(true);
    try {
      const payload = {
        category,
        title: title.trim(),
        description: description.trim(),
        latitude: picked.latitude,
        longitude: picked.longitude,
        colonia: colonia.trim(),
        address_hint: addressHint.trim() || null,
        has_safety_concern: safety,
        has_accessibility_concern: accessibility,
        email: email.trim() || undefined,
      };
      const form = new FormData();
      form.set("payload", JSON.stringify(payload));
      for (const file of files) form.append("photos", file);

      const response = await fetch("/api/cases", { method: "POST", body: form });
      const data = (await response.json()) as
        | { case: Case }
        | { error?: { message?: string; details?: unknown } };
      if (!response.ok || !("case" in data)) {
        const message = "error" in data ? data.error?.message : null;
        throw fieldError(message ?? "No pudimos registrar el reporte. Intenta de nuevo.");
      }
      setCreated(data.case);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos registrar el reporte. Intenta de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function claimReport() {
    if (!created || !email.trim()) return;
    setClaimPending(true);
    setClaimMessage(null);
    try {
      const response = await fetch("/api/auth/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: created.case_id, email: email.trim() }),
      });
      const data = (await response.json()) as {
        mode?: string;
        link?: string;
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(data.error?.message ?? "No pudimos preparar tu enlace.");
      setClaimMessage(data.message ?? null);
      if (data.link) setClaimLink(data.link);
      else setClaimed(true);
    } catch (cause) {
      setClaimMessage(cause instanceof Error ? cause.message : "No pudimos preparar tu enlace.");
    } finally {
      setClaimPending(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-line bg-white p-6 text-center shadow-[var(--shadow-card)] sm:p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold">Reporte recibido</h2>
          <p className="mt-2 text-sm text-navy-500">
            Guarda tu folio para dar seguimiento. Tu reporte ya aparece en el mapa público.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy-50 px-4 py-2 text-lg font-extrabold tabular-nums text-navy-900">
            {created.display_id}
          </p>
          <p className="mt-3 text-base font-bold text-navy-900">{created.title}</p>
          <p className="text-sm text-navy-500">{created.colonia} · Ubicación registrada</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href={`/reportes/${created.case_id}`} className={buttonStyles({ size: "md" })}>
              Ver mi reporte <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            {authenticated ? (
              <Link href="/mis-reportes" className={buttonStyles({ variant: "secondary" })}>
                Ir a mis reportes
              </Link>
            ) : null}
          </div>

          {!authenticated && email.trim() ? (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-left">
              <p className="text-sm font-bold text-navy-900">Guarda este reporte en tu cuenta</p>
              <p className="mt-1 text-xs text-navy-500">
                Verifica tu correo para que puedas consultarlo y recibir actualizaciones. Sin cuenta,
                también puedes dar seguimiento con tu folio.
              </p>
              {!claimLink && !claimed ? (
                <button
                  type="button"
                  onClick={claimReport}
                  disabled={claimPending}
                  className={cn(buttonStyles({ variant: "outline", size: "sm" }), "mt-3")}
                >
                  {claimPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
                  Enviar enlace de acceso
                </button>
              ) : null}
              {claimed ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <Check className="h-4 w-4" aria-hidden /> Reporte vinculado a tu cuenta.
                </p>
              ) : null}
              {claimMessage ? <p className="mt-2 text-xs text-navy-600">{claimMessage}</p> : null}
              {claimLink ? (
                <Link
                  href={claimLink}
                  className={cn(buttonStyles({ size: "sm" }), "mt-3")}
                >
                  Abrir mi enlace de acceso
                </Link>
              ) : null}
              {demoAuth ? (
                <p className="mt-2 text-[11px] text-navy-500">
                  Modo demostración: no se envía correo real; el enlace se muestra aquí.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0" aria-label="Pasos del reporte">
          {STEPS.map((label, index) => {
            const active = index === step;
            const done = index < step;
            return (
              <li key={label} className="flex items-center gap-2 sm:flex-1 sm:pr-1">
                <button
                  type="button"
                  onClick={() => {
                    if (index < step) setStep(index);
                  }}
                  aria-current={active ? "step" : undefined}
                  disabled={index > step}
                  className="group flex items-start gap-2.5 text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold tabular-nums transition-colors",
                      active
                        ? "border-royal-600 bg-royal-600 text-white shadow-[0_10px_20px_-12px_rgba(36,84,224,.9)]"
                        : done
                          ? "border-royal-600 bg-white text-royal-700"
                          : "border-line bg-white text-navy-500",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
                  </span>
                  <span className="pt-1">
                    <span
                      className={cn(
                        "block text-[13.5px] font-bold leading-tight",
                        active ? "text-navy-900" : done ? "text-navy-800" : "text-navy-500",
                      )}
                    >
                      {label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 hidden max-w-[19ch] text-[11px] leading-snug sm:block",
                        active ? "text-navy-500" : "text-navy-500/70",
                      )}
                    >
                      {STEP_HINTS[index]}
                    </span>
                  </span>
                </button>
                {index < STEPS.length - 1 ? (
                  <span
                    className={cn(
                      "hidden h-px flex-1 sm:block",
                      done ? "bg-royal-200" : "bg-line",
                    )}
                    aria-hidden
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
          {step === 0 ? (
            <section aria-labelledby="paso-categoria">
              <h2 id="paso-categoria" className="text-xl font-extrabold">
                ¿Qué tipo de problema es?
              </h2>
              <p className="mt-1 text-sm text-navy-500">
                Elegir bien la categoría ayuda a que llegue al equipo correcto.
              </p>
              <fieldset className="mt-5">
                <legend className="sr-only">Categoría del problema</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {CASE_CATEGORIES.map((value) => {
                    const meta = CATEGORY_META[value];
                    const selected = category === value;
                    return (
                      <label
                        key={value}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-all",
                          selected
                            ? "border-royal-400 bg-royal-50 ring-1 ring-royal-200"
                            : "border-line bg-white hover:-translate-y-0.5 hover:border-royal-200 hover:shadow-[var(--shadow-card)]",
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
                        <span className={cn("mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.chip)}>
                          <CategoryIcon category={value} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-navy-900">{meta.label}</span>
                          <span className="mt-0.5 block text-xs leading-snug text-navy-500">
                            {meta.description}
                          </span>
                        </span>
                        {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-royal-700" aria-hidden /> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="paso-descripcion" className="space-y-5">
              <div>
                <h2 id="paso-descripcion" className="text-xl font-extrabold">
                  Describe el problema
                </h2>
                <p className="mt-1 text-sm text-navy-500">
                  Sé específico: qué pasa, desde cuándo y a quién afecta.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="title" className="block text-sm font-semibold text-navy-900">
                  Título breve
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={140}
                  placeholder="Ej. Bache profundo frente a la escuela"
                  className={inputStyles}
                />
                <p className="text-xs text-navy-500">{title.length}/140</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="block text-sm font-semibold text-navy-900">
                  ¿Qué está pasando?
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder="Cuéntanos qué ves, qué riesgo representa y cualquier detalle que ayude a localizarlo."
                  className={cn(inputStyles, "resize-y")}
                />
                <p className="text-xs text-navy-500">{description.length}/2000 · mínimo 15 caracteres</p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-navy-900">¿Hay algún riesgo?</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm hover:bg-navy-50/50">
                  <input
                    type="checkbox"
                    checked={safety}
                    onChange={(event) => setSafety(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line text-royal-600"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-navy-900">
                      <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden /> Riesgo de seguridad
                    </span>
                    <span className="mt-0.5 block text-xs text-navy-500">
                      Puede provocar accidentes o pone en riesgo a las personas.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm hover:bg-navy-50/50">
                  <input
                    type="checkbox"
                    checked={accessibility}
                    onChange={(event) => setAccessibility(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line text-royal-600"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-navy-900">
                      <Users className="h-4 w-4 text-teal-600" aria-hidden /> Barrera de accesibilidad
                    </span>
                    <span className="mt-0.5 block text-xs text-navy-500">
                      Impide el paso a personas con discapacidad, carriolas o adultos mayores.
                    </span>
                  </span>
                </label>
              </fieldset>
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="paso-ubicacion">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="paso-ubicacion" className="text-xl font-extrabold">
                    Marca la ubicación
                  </h2>
                  <p className="mt-1 text-sm text-navy-500">
                    Toca el mapa en el punto exacto. No compartimos tu ubicación en tiempo real.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={locateMe}
                  disabled={locating}
                  className={buttonStyles({ variant: "outline", size: "sm" })}
                >
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <LocateFixed className="h-4 w-4" aria-hidden />
                  )}
                  Usar mi ubicación
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="colonia" className="block text-sm font-semibold text-navy-900">
                    Colonia
                  </label>
                  <select
                    id="colonia"
                    value={colonia}
                    onChange={(event) => setColonia(event.target.value)}
                    className={inputStyles}
                  >
                    <option value="">Elige tu colonia</option>
                    {COLONIAS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="address_hint" className="block text-sm font-semibold text-navy-900">
                    Referencia (opcional)
                  </label>
                  <input
                    id="address_hint"
                    value={addressHint}
                    onChange={(event) => setAddressHint(event.target.value)}
                    maxLength={160}
                    placeholder="Calle y número, entre calles…"
                    className={inputStyles}
                  />
                </div>
              </div>

              <CaseMap
                className="mt-4 h-[340px]"
                pickMode
                picked={picked}
                onPick={choosePoint}
                cases={mapCases}
                center={picked ? [picked.latitude, picked.longitude] : [CUAUHTEMOC_CENTER.lat, CUAUHTEMOC_CENTER.lng]}
                zoom={picked ? 16 : 13.4}
              />

              {picked ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-navy-600">
                  <Crosshair className="h-3.5 w-3.5 text-royal-600" aria-hidden />
                  Punto marcado: {picked.latitude.toFixed(5)}, {picked.longitude.toFixed(5)}
                </p>
              ) : (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-navy-500">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> Aún no has marcado el punto.
                </p>
              )}

              <div aria-live="polite" className="mt-4 space-y-3">
                {joined ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> Tu reporte quedó sumado al caso{" "}
                      {joined.display_id}
                    </p>
                    <p className="mt-1 text-xs text-emerald-900/80">
                      Registramos tu apoyo y publicamos tu descripción como observación del caso. Cada
                      persona que lo confirma le da más fuerza.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/reportes/${joined.case_id}`}
                        className={buttonStyles({ variant: "primary", size: "sm" })}
                      >
                        Ver el caso <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setJoined(null)}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        Seguir con un reporte nuevo
                      </button>
                    </div>
                  </div>
                ) : similar.length ? (
                  <div className="rounded-2xl border border-royal-200 bg-royal-50/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
                      <Sparkles className="h-4 w-4 text-royal-600" aria-hidden /> Casos similares
                      encontrados
                    </p>
                    <p className="mt-1 text-xs text-navy-600">
                      {comparison?.method === "model"
                        ? "Un análisis semántico comparó tu reporte con estos casos."
                        : "Comparación por cercanía y texto; el análisis semántico no estaba disponible."}{" "}
                      Sumar tu reporte a uno existente suele dar más fuerza que abrir otro.
                    </p>
                    <ul className="mt-3 space-y-3">
                      {similar.map((item) => {
                        const relationship = RELATIONSHIP_META[item.relationship];
                        const confirming = confirmJoin === item.case_id;
                        const pendingJoin = joining === item.case_id;
                        return (
                          <li
                            key={item.case_id}
                            className="rounded-xl bg-white p-3 ring-1 ring-royal-100"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-navy-900">{item.title}</p>
                                <p className="mt-0.5 text-[11px] text-navy-500">
                                  {item.display_id} · a {formatDistance(item.distance_meters)} ·{" "}
                                  {item.support_count} apoyos · {STATUS_META[item.status].label}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                  relationship.chip,
                                )}
                              >
                                {relationship.label}
                              </span>
                            </div>

                            <p className="mt-2 text-xs text-navy-600">{item.reason}</p>

                            {item.evidence.length ? (
                              <ul className="mt-2 flex flex-wrap gap-1.5">
                                {item.evidence.map((evidence) => (
                                  <li
                                    key={evidence}
                                    className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] text-navy-600"
                                  >
                                    {evidence}
                                  </li>
                                ))}
                              </ul>
                            ) : null}

                            <p className="mt-2 text-[11px] font-medium text-navy-400">
                              Confianza {Math.round(item.confidence * 100)}%
                            </p>

                            {confirming ? (
                              <div className="mt-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                                <p className="text-xs text-amber-900">
                                  ¿Sumar tu reporte a {item.display_id}? Registraremos tu apoyo y
                                  publicaremos tu descripción como observación del caso.
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void joinCase(item)}
                                    disabled={pendingJoin}
                                    className={buttonStyles({ variant: "primary", size: "sm" })}
                                  >
                                    {pendingJoin ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    ) : (
                                      <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                    {pendingJoin ? "Sumando…" : "Sí, sumarlo"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmJoin(null)}
                                    disabled={pendingJoin}
                                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setConfirmJoin(item.case_id)}
                                  className={buttonStyles({ variant: "primary", size: "sm" })}
                                >
                                  Sumar mi reporte a este caso
                                </button>
                                <Link
                                  href={`/reportes/${item.case_id}`}
                                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                                >
                                  Ver caso
                                </Link>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {joinError ? (
                      <p className="mt-2 text-xs font-semibold text-rose-700">{joinError}</p>
                    ) : null}
                  </div>
                ) : checking ? (
                  <p className="inline-flex items-center gap-2 text-xs text-navy-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Comparando tu
                    reporte con casos existentes…
                  </p>
                ) : nearbyResults.length ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                      <Users className="h-4 w-4" aria-hidden /> Ya hay reportes parecidos cerca
                    </p>
                    <p className="mt-1 text-xs text-amber-900/80">
                      Considera apoyar uno existente; sumar apoyos suele dar más fuerza que duplicar.
                    </p>
                    <ul className="mt-3 space-y-2">
                      {nearbyResults.map((item) => (
                        <li key={item.case_id}>
                          <Link
                            href={`/reportes/${item.case_id}`}
                            className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-amber-200 hover:ring-amber-300"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-bold text-navy-900">{item.title}</span>
                              <span className="mt-0.5 block text-navy-500">
                                {item.display_id} · a {formatDistance(item.distance_meters)} ·{" "}
                                {item.support_count} apoyos
                              </span>
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby="paso-fotos" className="space-y-5">
              <div>
                <h2 id="paso-fotos" className="text-xl font-extrabold">
                  Fotos y contacto
                </h2>
                <p className="mt-1 text-sm text-navy-500">
                  Las fotos ayudan a verificar el caso. El correo es opcional y nunca se publica.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-navy-900">Fotografías (opcional)</p>
                  <span className="text-xs text-navy-500">{files.length}/{MAX_PHOTOS}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {previews.map((preview, index) => (
                    <div key={preview.url} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-navy-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview.url} alt={`Vista previa ${index + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow hover:bg-white"
                        aria-label={`Quitar foto ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                  {files.length < MAX_PHOTOS ? (
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-surface text-xs font-semibold text-navy-500 hover:border-royal-300 hover:text-royal-700"
                    >
                      <ImagePlus className="h-5 w-5" aria-hidden />
                      Agregar foto
                    </button>
                  ) : null}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addPhotos(event.target.files);
                    event.target.value = "";
                  }}
                />
                <p className="mt-2 text-[11px] text-navy-500">
                  JPG, PNG o WEBP · máximo 5 MB cada una. Evita incluir rostros o placas.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-semibold text-navy-900">
                  Correo para dar seguimiento (opcional)
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" aria-hidden />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="tu@correo.mx"
                    className={cn(inputStyles, "pl-9")}
                    disabled={authenticated}
                  />
                </div>
                <p className="text-xs text-navy-500">
                  {authenticated
                    ? "Usaremos el correo de tu cuenta."
                    : "Te enviaremos un enlace para guardar el reporte en tu cuenta. Nunca aparece en el mapa."}
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-sm font-bold text-navy-900">Revisa antes de enviar</p>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-navy-500">Categoría</dt>
                    <dd className="font-semibold text-navy-800">{category ? CATEGORY_META[category].label : "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-navy-500">Título</dt>
                    <dd className="font-semibold text-navy-800">{title || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-navy-500">Ubicación</dt>
                    <dd className="font-semibold text-navy-800">
                      {colonia || "—"}
                      {addressHint ? ` · ${addressHint}` : ""}
                    </dd>
                  </div>
                </dl>
              </div>

              <p className="flex items-start gap-2 rounded-xl bg-royal-50 p-3 text-xs text-royal-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Al enviar confirmas que la información es veraz y aceptas que el reporte sea público.
                No publiques datos personales.
              </p>
            </section>
          ) : null}

          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((value) => Math.max(0, value - 1));
              }}
              disabled={step === 0 || submitting}
              className={buttonStyles({ variant: "ghost", size: "md" })}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Atrás
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={goNext} className={buttonStyles({ size: "md" })}>
                Continuar <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className={buttonStyles({ size: "lg" })}
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Camera className="h-5 w-5" aria-hidden />
                )}
                {submitting ? "Enviando…" : "Enviar reporte"}
              </button>
            )}
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="text-sm font-bold text-navy-900">Qué pasa después</p>
          <ol className="mt-3 space-y-3 text-xs text-navy-600">
            {[
              "Tu reporte se publica en el mapa y la comunidad puede apoyarlo.",
              "El equipo de gobierno lo revisa y actualiza el estado.",
              "Cuando se atiende, se publica evidencia del antes y después.",
            ].map((item, index) => (
              <li key={item} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal-50 text-[10px] font-bold text-royal-700">
                  {index + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
            <Users className="h-4 w-4 text-royal-600" aria-hidden /> ¿Ya existe?
          </p>
          <p className="mt-1.5 text-xs text-navy-500">
            Revisa el mapa antes de reportar. Apoyar un caso existente también cuenta.
          </p>
          <Link href="/explorar" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-royal-700 hover:text-royal-800">
            Explorar reportes <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </aside>
    </div>
  );
}
