"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_LABELS,
  ORIGIN_LABELS,
  RISK_LEVEL_LABELS,
  SIGNAL_TYPE_LABELS,
  STATUS_LABELS,
  VERIFICATION_LABELS,
} from "../content";
import { CopyButton } from "./CopyButton";

type EndpointKey =
  | "cases"
  | "case"
  | "geojson"
  | "categories"
  | "officialReports"
  | "statistics"
  | "risk"
  | "health";

interface PlaygroundValues {
  category: string;
  status: string;
  alcaldia: string;
  colonia: string;
  verification: string;
  origin: string;
  minSupport: string;
  createdFrom: string;
  bbox: string;
  precision: string;
  geoLimit: string;
  q: string;
  page: string;
  pageSize: string;
  sort: string;
  caseId: string;
  riskLevel: string;
  signalType: string;
  limit: string;
}

interface RunResult {
  status: number;
  ok: boolean;
  milliseconds: number;
  body: string;
  requestUrl: string;
  requestId?: string;
}

const ENDPOINTS: Array<{ key: EndpointKey; label: string; path: string; hint: string }> = [
  {
    key: "cases",
    label: "Lista de casos",
    path: "/api/v1/public/cases",
    hint: "Filtra, busca y pagina los casos publicados.",
  },
  {
    key: "case",
    label: "Detalle de un caso",
    path: "/api/v1/public/cases/{case_id}",
    hint: "Incluye línea de tiempo y observaciones públicas.",
  },
  {
    key: "geojson",
    label: "GeoJSON",
    path: "/api/v1/public/cases.geojson",
    hint: "FeatureCollection con coordenadas redondeadas.",
  },
  {
    key: "categories",
    label: "Categorías",
    path: "/api/v1/public/categories",
    hint: "Catálogo, conteos y orígenes por categoría.",
  },
  {
    key: "officialReports",
    label: "Registros oficiales",
    path: "/api/v1/public/official-reports",
    hint: "Solo imports con licencia y permiso vigentes.",
  },
  {
    key: "statistics",
    label: "Estadísticas",
    path: "/api/v1/public/statistics",
    hint: "Agregados por categoría, estado, colonia y origen.",
  },
  {
    key: "risk",
    label: "Señales preventivas",
    path: "/api/v1/public/risk-signals",
    hint: "Solo salidas aprobadas por el equipo preventivo.",
  },
  {
    key: "health",
    label: "Salud del servicio",
    path: "/api/v1/public/health",
    hint: "Estado de la fuente, feed oficial y señales.",
  },
];

const DEFAULTS: PlaygroundValues = {
  category: "",
  status: "",
  alcaldia: "",
  colonia: "",
  verification: "",
  origin: "",
  minSupport: "",
  createdFrom: "",
  bbox: "",
  precision: "block",
  geoLimit: "200",
  q: "",
  page: "1",
  pageSize: "10",
  sort: "recent",
  caseId: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001",
  riskLevel: "",
  signalType: "",
  limit: "20",
};

function requestPath(endpoint: EndpointKey, values: PlaygroundValues): string {
  if (endpoint === "case") {
    return `/api/v1/public/cases/${encodeURIComponent(values.caseId.trim())}`;
  }
  if (endpoint === "statistics") return "/api/v1/public/statistics";
  if (endpoint === "categories") return "/api/v1/public/categories";
  if (endpoint === "health") return "/api/v1/public/health";

  const params = new URLSearchParams();
  const isFiltered =
    endpoint === "cases" || endpoint === "geojson" || endpoint === "officialReports";

  if (isFiltered) {
    if (values.category) params.set("category", values.category);
    if (values.alcaldia.trim()) params.set("alcaldia", values.alcaldia.trim());
    if (values.colonia.trim()) params.set("colonia", values.colonia.trim());
    if (values.verification) params.set("verification", values.verification);
    if (values.origin) params.set("origin", values.origin);
    if (values.minSupport.trim()) params.set("min_support", values.minSupport.trim());
    if (values.createdFrom.trim()) params.set("created_from", values.createdFrom.trim());
    if (values.bbox.trim()) params.set("bbox", values.bbox.trim());
  }

  if (endpoint === "cases") {
    if (values.status) params.set("status", values.status);
    if (values.q.trim()) params.set("q", values.q.trim());
    if (values.page.trim()) params.set("page", values.page.trim());
    if (values.pageSize.trim()) params.set("page_size", values.pageSize.trim());
    if (values.sort) params.set("sort", values.sort);
  }

  if (endpoint === "geojson") {
    if (values.status) params.set("status", values.status);
    if (values.precision) params.set("precision", values.precision);
    if (values.geoLimit.trim()) params.set("limit", values.geoLimit.trim());
  }

  if (endpoint === "officialReports") {
    if (values.status) params.set("status", values.status);
    if (values.page.trim()) params.set("page", values.page.trim());
    if (values.pageSize.trim()) params.set("page_size", values.pageSize.trim());
  }

  if (endpoint === "risk") {
    if (values.category) params.set("category", values.category);
    if (values.colonia.trim()) params.set("colonia", values.colonia.trim());
    if (values.riskLevel) params.set("risk_level", values.riskLevel);
    if (values.signalType) params.set("signal_type", values.signalType);
    if (values.limit.trim()) params.set("limit", values.limit.trim());
  }

  const query = params.toString();
  const pathByEndpoint: Record<string, string> = {
    cases: "cases",
    geojson: "cases.geojson",
    officialReports: "official-reports",
    risk: "risk-signals",
  };
  return `/api/v1/public/${pathByEndpoint[endpoint] ?? "cases"}${query ? `?${query}` : ""}`;
}

function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-soft">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-soft">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm text-ink shadow-[0_1px_0_rgba(13,59,51,0.04)] outline-none transition placeholder:text-slate-soft/60 focus:border-forest/50 focus:ring-2 focus:ring-lime/50";

export function ApiPlayground() {
  const [endpoint, setEndpoint] = useState<EndpointKey>("cases");
  const [values, setValues] = useState<PlaygroundValues>(DEFAULTS);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);

  const path = useMemo(() => requestPath(endpoint, values), [endpoint, values]);
  const current = ENDPOINTS.find((item) => item.key === endpoint) ?? ENDPOINTS[0];

  function update<K extends keyof PlaygroundValues>(key: K, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function applyPreset(preset: "recent" | "risk" | "detail" | "map") {
    if (preset === "detail") {
      setEndpoint("case");
      setValues((previous) => ({ ...previous, caseId: DEFAULTS.caseId }));
      return;
    }
    if (preset === "map") {
      setEndpoint("geojson");
      setValues((previous) => ({
        ...previous,
        alcaldia: "Cuauhtémoc",
        bbox: "-99.20,19.38,-99.10,19.46",
        precision: "block",
        geoLimit: "200",
      }));
      return;
    }
    if (preset === "risk") {
      setEndpoint("risk");
      setValues((previous) => ({
        ...previous,
        riskLevel: "high,critical",
        signalType: "",
        category: "",
        colonia: "",
      }));
      return;
    }
    setEndpoint("cases");
    setValues((previous) => ({
      ...previous,
      category: "",
      status: "",
      alcaldia: "",
      colonia: "",
      verification: "",
      origin: "",
      minSupport: "",
      createdFrom: "",
      bbox: "",
      q: "",
      page: "1",
      pageSize: "10",
      sort: "recent",
    }));
  }

  async function run() {
    if (endpoint === "case" && !values.caseId.trim()) {
      setResult({
        status: 0,
        ok: false,
        milliseconds: 0,
        body: "Escribe el case_id (UUID) del caso que quieres consultar.",
        requestUrl: path,
      });
      return;
    }

    setRunning(true);
    const started = performance.now();
    try {
      const response = await fetch(path, {
        headers: {
          Accept: endpoint === "geojson" ? "application/geo+json" : "application/json",
        },
      });
      const text = await response.text();
      setResult({
        status: response.status,
        ok: response.ok,
        milliseconds: Math.round(performance.now() - started),
        body: prettyBody(text),
        requestUrl: path,
        requestId: response.headers.get("x-request-id") ?? undefined,
      });
    } catch {
      setResult({
        status: 0,
        ok: false,
        milliseconds: Math.round(performance.now() - started),
        body: "No fue posible completar la solicitud. Revisa tu conexión e inténtalo de nuevo.",
        requestUrl: path,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-forest/15 bg-white/80 shadow-[0_24px_70px_-42px_rgba(13,59,51,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/10 bg-forest px-5 py-4 text-white sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lime">
            Consola de pruebas
          </p>
          <h3 className="mt-0.5 font-display text-xl">Consulta la API ahora</h3>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/75">
          <span className="size-1.5 rounded-full bg-lime" aria-hidden />
          Llamada real, solo lectura
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-forest/10 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              { id: "recent" as const, label: "Casos recientes" },
              { id: "map" as const, label: "Mapa GeoJSON" },
              { id: "risk" as const, label: "Riesgo alto" },
              { id: "detail" as const, label: "Caso de demostración" },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="rounded-full border border-forest/15 bg-paper px-3 py-1 text-[11px] font-medium text-forest transition hover:border-forest/40 hover:bg-lime/30"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <Field label="Endpoint" hint={current.hint}>
            <select
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value as EndpointKey)}
              className={inputClass}
            >
              {ENDPOINTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label} · {item.path}
                </option>
              ))}
            </select>
          </Field>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {endpoint === "case" ? (
              <div className="sm:col-span-2">
                <Field
                  label="case_id"
                  hint="Solo UUID. Los identificadores como VOT-0001 son para personas."
                >
                  <input
                    value={values.caseId}
                    onChange={(event) => update("caseId", event.target.value)}
                    spellCheck={false}
                    className={`${inputClass} font-mono text-[12px]`}
                    placeholder="0b7f1f3e-…"
                  />
                </Field>
              </div>
            ) : null}

            {endpoint === "cases" ||
            endpoint === "risk" ||
            endpoint === "geojson" ||
            endpoint === "officialReports" ? (
              <>
                <Field label="Categoría">
                  <select
                    value={values.category}
                    onChange={(event) => update("category", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todas</option>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Colonia">
                  <input
                    value={values.colonia}
                    onChange={(event) => update("colonia", event.target.value)}
                    className={inputClass}
                    placeholder="Roma Norte"
                  />
                </Field>
              </>
            ) : null}

            {endpoint === "cases" ||
            endpoint === "geojson" ||
            endpoint === "officialReports" ? (
              <>
                <Field label="Alcaldía">
                  <input
                    value={values.alcaldia}
                    onChange={(event) => update("alcaldia", event.target.value)}
                    className={inputClass}
                    placeholder="Cuauhtémoc"
                  />
                </Field>
                <Field label="Verificación">
                  <select
                    value={values.verification}
                    onChange={(event) => update("verification", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todas</option>
                    {Object.entries(VERIFICATION_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Origen">
                  <select
                    value={values.origin}
                    onChange={(event) => update("origin", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todos</option>
                    {Object.entries(ORIGIN_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Apoyos mínimos">
                  <input
                    type="number"
                    min={0}
                    value={values.minSupport}
                    onChange={(event) => update("minSupport", event.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Creado desde" hint="Formato AAAA-MM-DD o ISO 8601.">
                    <input
                      value={values.createdFrom}
                      onChange={(event) => update("createdFrom", event.target.value)}
                      className={inputClass}
                      placeholder="2026-10-01"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="bbox"
                    hint="min_lon,min_lat,max_lon,max_lat · máximo 5° por lado."
                  >
                    <input
                      value={values.bbox}
                      onChange={(event) => update("bbox", event.target.value)}
                      className={`${inputClass} font-mono text-[12px]`}
                      placeholder="-99.20,19.38,-99.10,19.46"
                    />
                  </Field>
                </div>
              </>
            ) : null}

            {endpoint === "cases" ? (
              <>
                <Field label="Estado">
                  <select
                    value={values.status}
                    onChange={(event) => update("status", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todos</option>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Orden">
                  <select
                    value={values.sort}
                    onChange={(event) => update("sort", event.target.value)}
                    className={inputClass}
                  >
                    <option value="recent">Más recientes</option>
                    <option value="supported">Más apoyados</option>
                    <option value="updated">Actualizados</option>
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Búsqueda (q)">
                    <input
                      value={values.q}
                      onChange={(event) => update("q", event.target.value)}
                      className={inputClass}
                      placeholder="bache, luminaria, rampa…"
                    />
                  </Field>
                </div>
                <Field label="Página">
                  <input
                    type="number"
                    min={1}
                    value={values.page}
                    onChange={(event) => update("page", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Resultados por página" hint="Máximo 50.">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={values.pageSize}
                    onChange={(event) => update("pageSize", event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : null}

            {endpoint === "geojson" ? (
              <>
                <Field label="Estado">
                  <select
                    value={values.status}
                    onChange={(event) => update("status", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todos</option>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Precisión" hint="coarse publica a 1 100 m.">
                  <select
                    value={values.precision}
                    onChange={(event) => update("precision", event.target.value)}
                    className={inputClass}
                  >
                    <option value="block">block · 110 m</option>
                    <option value="coarse">coarse · 1 100 m</option>
                  </select>
                </Field>
                <Field label="Límite" hint="Máximo 500.">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={values.geoLimit}
                    onChange={(event) => update("geoLimit", event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : null}

            {endpoint === "officialReports" ? (
              <>
                <Field label="Estado operativo">
                  <select
                    value={values.status}
                    onChange={(event) => update("status", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todos</option>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Página">
                  <input
                    type="number"
                    min={1}
                    value={values.page}
                    onChange={(event) => update("page", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Resultados por página" hint="Máximo 50.">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={values.pageSize}
                    onChange={(event) => update("pageSize", event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : null}

            {endpoint === "risk" ? (
              <>
                <Field label="Nivel de riesgo">
                  <select
                    value={values.riskLevel}
                    onChange={(event) => update("riskLevel", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todos</option>
                    {Object.entries(RISK_LEVEL_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tipo de señal">
                  <select
                    value={values.signalType}
                    onChange={(event) => update("signalType", event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Todas</option>
                    {Object.entries(SIGNAL_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Límite" hint="Máximo 100.">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={values.limit}
                    onChange={(event) => update("limit", event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : null}

            {endpoint === "statistics" || endpoint === "categories" || endpoint === "health" ? (
              <div className="sm:col-span-2 rounded-xl border border-forest/10 bg-paper px-4 py-3 text-sm text-slate-soft">
                Este endpoint no recibe parámetros.{" "}
                {endpoint === "statistics"
                  ? "Devuelve el resumen del conjunto publicado."
                  : endpoint === "categories"
                    ? "Devuelve el catálogo completo de categorías."
                    : "Devuelve el estado resumido del servicio público."}
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-xl border border-forest/10 bg-[#0a1b17] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                GET
              </span>
              <CopyButton value={path} label="Copiar ruta" />
            </div>
            <code className="mt-2 block break-all font-mono text-[11.5px] leading-relaxed text-[#d8f36b]">
              {path}
            </code>
          </div>

          <button
            type="button"
            onClick={run}
            disabled={running}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? "Consultando…" : "Probar solicitud"}
            <span aria-hidden>→</span>
          </button>
        </div>

        <div className="flex min-h-[26rem] flex-col bg-paper/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-soft">
              Respuesta
            </span>
            {result ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold ${
                    result.ok ? "bg-forest/10 text-forest" : "bg-clay/15 text-clay"
                  }`}
                >
                  {result.status === 0 ? "Sin conexión" : `HTTP ${result.status}`}
                </span>
                <span className="text-slate-soft">{result.milliseconds} ms</span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex-1" aria-live="polite">
            {result ? (
              <>
                <pre className="max-h-[31rem] overflow-auto rounded-xl border border-forest/10 bg-white p-4 font-mono text-[11.5px] leading-relaxed text-ink">
                  <code>{result.body}</code>
                </pre>
                <p className="mt-2 break-all font-mono text-[10.5px] text-slate-soft">
                  {result.requestId ? `x-request-id: ${result.requestId}` : result.requestUrl}
                </p>
              </>
            ) : (
              <div className="flex h-full min-h-[22rem] flex-col items-center justify-center rounded-xl border border-dashed border-forest/15 bg-white/40 px-6 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-lime/45 text-forest">
                  <span aria-hidden>↗</span>
                </div>
                <p className="font-display text-lg text-forest">Tu primera consulta</p>
                <p className="mt-1 max-w-xs text-sm text-slate-soft">
                  Elige un endpoint, ajusta los filtros y presiona Probar solicitud. La respuesta
                  aparecerá aquí con su código HTTP.
                </p>
              </div>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-soft">
            Las respuestas incluyen límite de solicitudes, ETag y CORS. Un 503 en señales
            preventivas significa que el feed aprobado no está disponible; nunca se rellena con
            datos ficticios en producción.
          </p>
        </div>
      </div>
    </div>
  );
}
