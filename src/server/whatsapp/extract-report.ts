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
- clarifying_question: una sola pregunta breve si falta información esencial; si no, null.

Esquema exacto:
{"is_civic_report":boolean,"category":"road_damage|street_lighting|traffic_signals|sidewalk_accessibility|trees_vegetation|waste_sanitation|parks_public_spaces|other"|null,"title":string|null,"description":string,"colonia":string|null,"address_hint":string|null,"has_safety_concern":boolean,"has_accessibility_concern":boolean,"clarifying_question":string|null}`;

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

function makeTitle(text: string): string {
  const first = text.split(/[\n.!?]/).map((part) => part.trim()).find(Boolean) ?? text;
  const title = first.slice(0, 120).trim();
  return title.length >= 6 ? title : `Reporte: ${title}`.slice(0, 120);
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
