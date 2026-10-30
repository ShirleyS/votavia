import { z } from "zod";
import type { CaseCategory } from "@/shared/votavia-contract";
import { COLONIAS } from "@/lib/taxonomy";
import { getAIClient, type AIClient } from "@/lib/ai/client";
import { inferCategoryFromText } from "@/lib/ai/utils/validation";
import { cleanTranscription } from "@/lib/ai/utils/similarity";
import type { ExtractReport, ReportExtraction } from "./types";

const AI_SCHEMA = z.object({
  is_civic_report: z.boolean(),
  category: z
    .enum([
      "road_damage",
      "street_lighting",
      "traffic_signals",
      "sidewalk_accessibility",
      "trees_vegetation",
      "waste_sanitation",
      "parks_public_spaces",
      "other",
    ])
    .nullable(),
  title: z.string().trim().max(140).nullable(),
  description: z.string().trim().max(2000),
  colonia: z.string().trim().max(80).nullable(),
  address_hint: z.string().trim().max(160).nullable(),
  // Nullish: a model that omits these must still parse, falling back to the
  // deterministic extractor instead of discarding the whole refinement.
  between_streets: z.string().trim().max(120).nullish(),
  reporter_name: z.string().trim().max(80).nullish(),
  severity: z.enum(["baja", "media", "alta", "critica"]).nullish(),
  has_safety_concern: z.boolean(),
  has_accessibility_concern: z.boolean(),
  clarifying_question: z.string().trim().max(240).nullable(),
});

const SYSTEM_PROMPT = `Eres el intake de VotaVía, plataforma ciudadana de la Alcaldía Cuauhtémoc, CDMX.
Convierte un mensaje de WhatsApp en un reporte de espacio público. Responde SOLO JSON.

Reglas:
- No inventes ubicaciones ni coordenadas. Si no se menciona colonia, usa null.
- La colonia debe ser una de: ${COLONIAS.join(", ")}. Si no coincide, usa null.
- Conserva el relato de la persona; no agregues hechos, personas ni promesas.
- title: una frase breve y concreta (6 a 120 caracteres).
- description: el problema en palabras de la persona, sin datos personales.
- category: elige la mejor opción o "other"; no uses null si el mensaje describe un problema.
- is_civic_report=false para saludos, preguntas generales o mensajes sin un problema concreto.
- has_safety_concern=true solo si hay riesgo para personas.
- has_accessibility_concern=true si afecta a sillas de ruedas, personas ciegas, rampas o cruces.
- address_hint: calle y número si los mencionan. between_streets: SOLO el cruce, con el
  formato "entre <calle A> y <calle B>", cuando den referencias en vez de una dirección exacta.
- reporter_name: el nombre que la persona da de sí misma ("me llamo…", "soy…"). Si no lo dice, null.
  Nunca lo deduzcas del número ni del relato.
- severity: "baja" | "media" | "alta" | "critica" según el daño y el riesgo descritos.
  Si el mensaje no permite juzgarlo, usa null. No la infles: una banqueta rota sin heridos no es "critica".
- clarifying_question: una sola pregunta breve si falta información esencial; si no, null.

Esquema exacto:
{"is_civic_report":boolean,"category":"road_damage|street_lighting|traffic_signals|sidewalk_accessibility|trees_vegetation|waste_sanitation|parks_public_spaces|other"|null,"title":string|null,"description":string,"colonia":string|null,"address_hint":string|null,"between_streets":string|null,"reporter_name":string|null,"severity":"baja|media|alta|critica"|null,"has_safety_concern":boolean,"has_accessibility_concern":boolean,"clarifying_question":string|null}`;

const ACCESSIBILITY = /(silla de ruedas|rampa|invidente|cieg[oa]|bast[oó]n|accesibilidad|banqueta rota|crucero peligroso)/i;
const SAFETY = /(peligro|riesgo|accidente|atropell|ca[ií]do|derrumbe|fuga|incendio|explosi[oó]n|ni[nñ]os|escuela|hospital|cable)/i;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchColonia(value: string | null | undefined): string | null {
  if (!value) return null;
  const needle = normalize(value);
  if (!needle) return null;
  const exact = COLONIAS.find((name) => normalize(name) === needle);
  if (exact) return exact;
  const contained = COLONIAS.find(
    (name) => needle.includes(normalize(name)) || normalize(name).includes(needle),
  );
  return contained ?? null;
}

/**
 * A voice note often opens with a greeting and a self-introduction ("Hola, me
 * llamo Ana López."). It says nothing about the problem, so titles start after
 * it instead of repeating it on every card.
 */
const GREETING_ONLY_SENTENCE =
  /^(?:hola|holi|buen[oa]s?\s+(?:d[ií]as?|tardes?|noches?)|qu[eé]\s+tal|hey|saludos)[\s,.;:!¡-]*$/i;
const INTRO_SENTENCE =
  /\b(?:me\s+llamo|mi\s+nombre\s+es|soy|les\s+habla|aqu[ií]\s+habla|le\s+escribe)\b/i;
const LEADING_INTRO_CLAUSE =
  /^(?:hola|holi|buen[oa]s?\s+(?:d[ií]as?|tardes?|noches?)|qu[eé]\s+tal|hey|saludos)?[\s,.;:!¡-]*(?:me\s+llamo|mi\s+nombre\s+es|soy|les\s+habla|aqu[ií]\s+habla|le\s+escribe)\s+(?:\S+\s*){1,4}?[,.;:!?]\s*/i;

export function stripIntro(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((part) => part.trim());
  let start = 0;
  while (
    start < sentences.length - 1 &&
    (GREETING_ONLY_SENTENCE.test(sentences[start].trim()) ||
      (start === 0 && INTRO_SENTENCE.test(sentences[start])))
  ) {
    start += 1;
  }
  let rest = sentences.slice(start).join(" ").trim();
  if (start === 0) {
    const intro = rest.match(LEADING_INTRO_CLAUSE);
    if (intro) rest = rest.slice(intro[0].length).trim();
  }
  return rest.length >= 12 ? rest : text.trim();
}

function makeTitle(text: string): string {
  const body = stripIntro(text);
  const first = body.split(/[\n.!?]/).map((part) => part.trim()).find(Boolean) ?? body;
  const title = first.slice(0, 120).trim();
  const capitalized = title.charAt(0).toUpperCase() + title.slice(1);
  return title.length >= 6 ? capitalized : `Reporte: ${capitalized}`.slice(0, 120);
}

const GREETING_WORDS = new Set([
  "hola",
  "buen",
  "buenos",
  "buenas",
  "dia",
  "dias",
  "tarde",
  "tardes",
  "noche",
  "noches",
  "hey",
  "que",
  "tal",
  "gracias",
  "ok",
]);

function isGreetingOnly(text: string): boolean {
  const words = normalize(text)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every((word) => GREETING_WORDS.has(word));
}

/**
 * Between-streets phrase: "entre X y Y", "entre la calle X y Y", "casi esquina Y".
 * Returned verbatim (trimmed) so the operator reads the citizen's own reference.
 */
const BETWEEN_STREETS =
  /\bentre\s+(?:la\s+|el\s+|calle\s+|avenida\s+|av\.?\s+)?([^,.;\n]{2,60}?)\s+y\s+(?:la\s+|el\s+|calle\s+|avenida\s+|av\.?\s+)?([^,.;\n]{2,60})/i;

/**
 * "me llamo Ana", "soy Ana López", "mi nombre es Ana".
 * Case-insensitive on the verb ("Me llamo" at the start of a sentence); the
 * capitalized-name requirement is enforced in code so "soy vecina" is rejected.
 */
const REPORTER_NAME =
  /\b(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([\p{L}]+(?:\s+[\p{L}]+){0,2})/iu;

/** Severity words, most severe first so "muy grave" beats "grave". */
const SEVERITY_PATTERNS: Array<{ severity: ReportExtraction["severity"]; re: RegExp }> = [
  {
    severity: "critica",
    re: /\b(criti[ck]o|extremadamente grave|hay heridos|hubo heridos|atropell|explosi[oó]n|derrumbe|fuga de gas|incendio|riesgo de muerte)\b/i,
  },
  {
    severity: "alta",
    re: /\b(grave|urgente|peligroso|mucho riesgo|accidente|se cay[oó]|bloquea(?:do)? el paso|ni[nñ]os|escuela|hospital)\b/i,
  },
  {
    severity: "media",
    re: /\b(moderado|regular|molesto|dif[ií]cil de pasar|obst[aá]culo)\b/i,
  },
  {
    severity: "baja",
    re: /\b(leve|menor|poco|no es grave|sin riesgo)\b/i,
  },
];

function extractBetweenStreets(text: string): string | null {
  const match = BETWEEN_STREETS.exec(text);
  if (!match) return null;
  const phrase = match[0].replace(/\s+/g, " ").trim();
  return phrase.slice(0, 120);
}

const ROLE_WORDS = new Set([
  "vecina",
  "vecino",
  "ciudadana",
  "ciudadano",
  "residente",
  "comerciante",
  "presidenta",
  "presidente",
  "la",
  "el",
  "de",
  "del",
]);

function extractReporterName(text: string): string | null {
  const match = REPORTER_NAME.exec(text);
  if (!match) return null;
  const value = match[1].trim();
  const words = value.split(/\s+/);

  // A name starts with a capital letter: "Ana", not "ana".
  if (value[0] !== value[0].toUpperCase()) return null;
  // Stop at the first non-capitalised word so "Ana y hay un bache" -> "Ana".
  const kept: string[] = [];
  for (const word of words) {
    if (word[0] !== word[0].toUpperCase()) break;
    if (ROLE_WORDS.has(word.toLowerCase())) break;
    kept.push(word);
    if (kept.length === 3) break;
  }
  if (kept.length === 0) return null;
  const name = kept.join(" ");
  if (ROLE_WORDS.has(name.toLowerCase())) return null;
  return name.slice(0, 80);
}

/** Explicit "it is not serious" phrasing must win over the bare word "grave". */
const SEVERITY_NEGATED = /\b(no es grave|no es tan grave|sin riesgo|no hay riesgo|no reviste gravedad)\b/i;

function extractSeverity(text: string): ReportExtraction["severity"] {
  if (SEVERITY_NEGATED.test(text)) return "baja";
  for (const { severity, re } of SEVERITY_PATTERNS) {
    if (re.test(text)) return severity;
  }
  return null;
}

function deterministicExtraction(text: string, usedVoice: boolean): ReportExtraction {
  const cleaned = usedVoice ? cleanTranscription(text).text : text;
  const safe = cleaned.trim().slice(0, 2000);
  const greetingOnly = isGreetingOnly(safe);
  const category = inferCategoryFromText(safe) as CaseCategory;
  const colonia =
    COLONIAS.find((name) => normalize(safe).includes(normalize(name))) ?? null;
  return {
    is_civic_report: !greetingOnly && normalize(safe).length >= 8,
    category: greetingOnly ? null : category,
    title: greetingOnly ? null : makeTitle(safe),
    description: safe,
    colonia,
    address_hint: null,
    between_streets: extractBetweenStreets(safe),
    reporter_name: extractReporterName(safe),
    severity: extractSeverity(safe),
    has_safety_concern: SAFETY.test(safe),
    has_accessibility_concern: ACCESSIBILITY.test(safe),
    clarifying_question: null,
  };
}

function mergeExtraction(
  fallback: ReportExtraction,
  ai: z.infer<typeof AI_SCHEMA> | null,
): ReportExtraction {
  if (!ai) return fallback;
  const description = ai.description.length >= 15 ? ai.description : fallback.description;
  return {
    is_civic_report: ai.is_civic_report,
    category: ai.category ?? fallback.category,
    title: ai.title && ai.title.length >= 6 ? ai.title : fallback.title,
    description,
    colonia: matchColonia(ai.colonia) ?? fallback.colonia,
    address_hint: ai.address_hint ?? fallback.address_hint,
    // Prefer whatever the model read; fall back to the deterministic phrase so
    // a missing model field never discards a between-streets reference.
    between_streets: ai.between_streets ?? fallback.between_streets,
    reporter_name: ai.reporter_name ?? fallback.reporter_name,
    severity: ai.severity ?? fallback.severity,
    has_safety_concern: ai.has_safety_concern || fallback.has_safety_concern,
    has_accessibility_concern:
      ai.has_accessibility_concern || fallback.has_accessibility_concern,
    clarifying_question: ai.clarifying_question,
  };
}

/**
 * Extracts a structured draft. Deterministic keyword extraction always runs so
 * the demo works without credentials; the model only refines it when present.
 */
export function createReportExtractor(client: AIClient = getAIClient()): ExtractReport {
  return async ({ text, usedVoice }) => {
    const fallback = deterministicExtraction(text, usedVoice);
    if (!client.configured || !fallback.is_civic_report) return fallback;

    const result = await client.completeJson(
      {
        system: SYSTEM_PROMPT,
        user: `Mensaje ciudadano${usedVoice ? " (transcripción de nota de voz)" : ""}:\n${text.slice(0, 4000)}`,
        maxTokens: 700,
        temperature: 0.1,
      },
      AI_SCHEMA,
    );
    if (!result.ok) return fallback;
    return mergeExtraction(fallback, result.data);
  };
}
