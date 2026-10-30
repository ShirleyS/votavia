import { createHash } from "node:crypto";
import { CASE_CATEGORIES, type CaseCategory } from "@/shared/votavia-contract";
import type { DuplicateRelationship, Severity } from "../types";

/** Lowercase + strip diacritics so Mexican Spanish typos still match. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CATEGORY_ALIASES: Array<{ category: CaseCategory; terms: string[] }> = [
  {
    category: "road_damage",
    terms: [
      "bache",
      "baches",
      "hoyo",
      "hoyote",
      "hoyos",
      "pavimento",
      "asfalto",
      "carpeta asfaltica",
      "grieta",
      "hundimiento",
      "calle rota",
      "banqueta rota",
      "socavon",
    ],
  },
  {
    category: "street_lighting",
    terms: [
      "luminaria",
      "luminarias",
      "lampara",
      "lamparas",
      "alumbrado",
      "poste",
      "postes",
      "no prende",
      "no prenden",
      "apagada",
      "apagadas",
      "foco",
      "focos",
      "intermitente",
      "luz del poste",
    ],
  },
  {
    category: "traffic_signals",
    terms: [
      "semaforo",
      "semaforos",
      "señal",
      "señales",
      "senal",
      "senalizacion",
      "alto",
      "luces del cruce",
      "cruce",
      "vialidad",
      "flecha",
      "tope",
    ],
  },
  {
    category: "sidewalk_accessibility",
    terms: [
      "banqueta",
      "banquetas",
      "rampa",
      "rampas",
      "silla de ruedas",
      "accesibilidad",
      "cruce peatonal",
      "paso peatonal",
      "guarnicion",
      "invidente",
      "ciego",
      "carriola",
      "obstruido",
    ],
  },
  {
    category: "trees_vegetation",
    terms: [
      "arbol",
      "arboles",
      "rama",
      "ramas",
      "poda",
      "vegetacion",
      "tronco",
      "plantas",
      "camellon",
      "raices",
    ],
  },
  {
    category: "waste_sanitation",
    terms: [
      "basura",
      "residuos",
      "contenedor",
      "contenedores",
      "escombro",
      "escombros",
      "desechos",
      "tiliche",
      "llantas",
      "colchon",
      "mal olor",
    ],
  },
  {
    category: "parks_public_spaces",
    terms: [
      "parque",
      "jardin",
      "juegos",
      "mobiliario",
      "banca",
      "plaza",
      "area verde",
      "areas verdes",
      "cancha",
    ],
  },
];

/**
 * Maps model/dataset category labels (English or Spanish) to the shared enum.
 * Returns null for anything unrecognized so callers can fall back safely.
 */
export function normalizeCategory(value: unknown): CaseCategory | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const direct = CASE_CATEGORIES.find((category) => category === raw);
  if (direct) return direct;

  const text = normalizeText(raw).replace(/[\s-]+/g, "_");
  const exactAlias = CASE_CATEGORIES.find((category) => category === text);
  if (exactAlias) return exactAlias;

  const spaced = text.replace(/_/g, " ");
  for (const { category, terms } of CATEGORY_ALIASES) {
    if (terms.some((term) => spaced === term || spaced.includes(term))) return category;
  }
  if (spaced.includes("basura") || spaced.includes("trash")) return "waste_sanitation";
  if (spaced.includes("alumbrado") || spaced.includes("light")) return "street_lighting";
  if (spaced.includes("semaforo") || spaced.includes("signal")) return "traffic_signals";
  if (spaced.includes("banqueta") || spaced.includes("sidewalk")) {
    return "sidewalk_accessibility";
  }
  if (spaced.includes("arbol") || spaced.includes("tree")) return "trees_vegetation";
  if (spaced.includes("parque") || spaced.includes("park")) return "parks_public_spaces";
  if (spaced.includes("bache") || spaced.includes("road")) return "road_damage";
  return null;
}

/** Deterministic keyword classifier used as fallback and as a sanity check. */
export function inferCategoryFromText(value: string): CaseCategory {
  const text = normalizeText(value);
  let best: { category: CaseCategory; score: number } | null = null;
  for (const { category, terms } of CATEGORY_ALIASES) {
    const score = terms.reduce(
      (total, term) => (text.includes(term) ? total + term.split(" ").length : total),
      0,
    );
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  return best?.category ?? "other";
}

const CRITICAL_TERMS = [
  "cable caido",
  "cable de alta tension",
  "fuga de gas",
  "incendio",
  "explosion",
  "derrumbe",
  "persona atrapada",
  "poste a punto de caer",
  "semaforo caido",
];

const HIGH_TERMS = [
  "atropell",
  "accidente",
  "peligro",
  "riesgo",
  "cayo",
  "se cayo",
  "no pasa",
  "silla de ruedas",
  "invidente",
  "niños",
  "ninos",
  "escuela",
  "hospital",
  "no frena",
  "casi",
  "urgente",
];

const LOW_TERMS = ["graffiti", "pintura", "cosmetico", "estetico", "leve"];

export function inferSeverityFromText(value: string, fallback: Severity = "medium"): Severity {
  const text = normalizeText(value);
  if (CRITICAL_TERMS.some((term) => text.includes(normalizeText(term)))) return "critical";
  if (HIGH_TERMS.some((term) => text.includes(normalizeText(term)))) return "high";
  if (LOW_TERMS.some((term) => text.includes(normalizeText(term)))) return "low";
  return fallback;
}

export function normalizeSeverity(value: unknown, fallback: Severity = "medium"): Severity {
  const text = normalizeText(typeof value === "string" ? value : "");
  if (!text) return fallback;
  if (["critical", "critico", "critica", "urgente", "muy alto"].includes(text)) return "critical";
  if (["high", "alto", "alta", "grave", "severo"].includes(text)) return "high";
  if (["medium", "medio", "media", "moderado"].includes(text)) return "medium";
  if (["low", "bajo", "baja", "leve"].includes(text)) return "low";
  return fallback;
}

export function normalizeRelationship(value: unknown): DuplicateRelationship {
  const text = normalizeText(typeof value === "string" ? value : "").replace(/\s+/g, "_");
  if (text === "same_problem" || text === "mismo_problema" || text === "same") {
    return "same_problem";
  }
  if (text === "related_problem" || text === "relacionado" || text === "related") {
    return "related_problem";
  }
  if (text === "different_problem" || text === "distinto" || text === "different") {
    return "different_problem";
  }
  return "uncertain";
}

export function clampConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Truncates text on a word boundary-ish and reports whether it changed. */
export function limitText(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim();
  if (clean.length <= maxChars) return { text: clean, truncated: false };
  return { text: `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`, truncated: true };
}

/** Normalizes a list of model-provided bullets; dedupes and bounds length. */
export function cleanBullets(
  values: readonly string[] | null | undefined,
  maxItems: number,
  maxChars: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== "string") continue;
    const text = value.replace(/\s+/g, " ").trim().slice(0, maxChars);
    if (text.length < 3) continue;
    const key = normalizeText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

/** Stable JSON serialization for cache/idempotency keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function analysisKey(namespace: string, payload: unknown): string {
  return createHash("sha256")
    .update(`${namespace}:${stableStringify(payload)}`)
    .digest("hex");
}

export function uniqueIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

const EMAIL_PATTERN = /[\w.+-]+\s*@\s*[\w-]+(?:\.[\w-]+)+/g;
const PHONE_PATTERN = /(?:\+?52[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{3}[\s-]?\d{4}\b/g;
const URL_PATTERN = /https?:\/\/\S+/gi;

/**
 * Removes likely personal data before a citizen text is sent to the model.
 * The verbatim report is still preserved locally in `original_description`.
 */
export function redactPii(value: string): string {
  return value
    .replace(URL_PATTERN, "[enlace omitido]")
    .replace(EMAIL_PATTERN, "[correo omitido]")
    .replace(PHONE_PATTERN, "[teléfono omitido]");
}

const INJECTION_PATTERNS = [
  "ignora las instrucciones",
  "ignore previous",
  "ignore all",
  "system prompt",
  "prompt del sistema",
  "actua como",
  "actúa como",
  "revela la clave",
  "api key",
  "jailbreak",
  "developer mode",
  "modo desarrollador",
  "cambia el rol",
  "olvida tus reglas",
  "desobedece",
];

/** Flags text that tries to address the model instead of describing a problem. */
export function detectPromptInjection(value: string): boolean {
  const text = normalizeText(value);
  return INJECTION_PATTERNS.some((pattern) => text.includes(normalizeText(pattern)));
}
