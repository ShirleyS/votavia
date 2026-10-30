import type { CaseCategory } from "@/shared/votavia-contract";
import { getAIClient } from "../client";
import { buildClassifyPrompt } from "../prompts/classify-report";
import { classificationModelSchema } from "../schemas";
import {
  AI_ANALYSIS_VERSION,
  AI_LIMITS,
  type AIDeps,
  type CategoryNormalization,
  type NormalizedReportIntake,
  type ReportClassification,
  type ReportInput,
  type Severity,
} from "../types";
import {
  DEFAULT_DEPARTMENT_BY_CATEGORY,
  DEFAULT_SPECIALIST_BY_CATEGORY,
  DEFAULT_TITLE_BY_CATEGORY,
  defaultAccessibilityConsiderations,
  defaultSafetyConcerns,
} from "../utils/fallbacks";
import { suggestPriority } from "../utils/priority";
import { escalatePriority } from "../utils/escalation";
import { normalizeReportIntake } from "./intake";
import {
  cleanBullets,
  clampConfidence,
  inferCategoryFromText,
  inferSeverityFromText,
  isIsoDate,
  limitText,
  normalizeCategory,
  normalizeSeverity,
  normalizeText,
} from "../utils/validation";

const MIN_USEFUL_DESCRIPTION = 10;
const ACCIDENT_PATTERN = /\b(accidente|atropell\w*|herid\w*|falleci\w*|muert\w*)\b/i;

function groundedSummary(text: string, category: CaseCategory): string {
  const snippet = text.replace(/\s+/g, " ").trim();
  if (!snippet) {
    return `Reporte sin descripción suficiente. Categoría preliminar: ${category}.`;
  }
  const clipped = snippet.length > 260 ? `${snippet.slice(0, 259).trimEnd()}…` : snippet;
  return `El reporte describe: ${clipped}`;
}

function fallbackTitle(category: CaseCategory, colonia: string | null): string {
  const base = DEFAULT_TITLE_BY_CATEGORY[category];
  return colonia ? `${base} en ${colonia}`.slice(0, 90) : base;
}

function missingFor(input: {
  description: string;
  category: CaseCategory;
  hasLocation: boolean;
}): string[] {
  const missing: string[] = [];
  if (input.description.trim().length < 20) {
    missing.push("Descripción más específica del problema.");
  }
  if (!input.hasLocation) missing.push("Ubicación exacta (coordenadas o referencia).");
  if (input.category === "other") missing.push("Tipo de infraestructura afectada.");
  return missing;
}

function dropUnsupportedAccidentClaims(
  bullets: string[],
  description: string,
): string[] {
  if (ACCIDENT_PATTERN.test(description)) return bullets;
  return bullets.filter((bullet) => !ACCIDENT_PATTERN.test(bullet));
}

function explicitCategory(input: ReportInput): CaseCategory | null {
  return normalizeCategory(input.category ?? null);
}

/**
 * Category suggestion is kept separate from the source category so imported
 * government records never lose their original label.
 */
function categoryForIntake(input: ReportInput, intake: NormalizedReportIntake): {
  category: CaseCategory;
  normalization: CategoryNormalization;
} {
  const normalization = intake.category;
  const category =
    normalization.normalized_category ??
    explicitCategory(input) ??
    inferCategoryFromText(intake.normalized_text);
  return {
    category,
    normalization:
      normalization.normalized_category === category
        ? normalization
        : { ...normalization, normalized_category: category },
  };
}

function priorityFor(input: ReportInput, severity: Severity, analyzedAt: string) {
  const base = suggestPriority({
    severity,
    independent_reports: 1,
    unique_supporters: input.supporters ?? 0,
    reported_at: isIsoDate(input.created_at) ? (input.created_at as string) : analyzedAt,
    resolved_at: input.resolved_at ?? null,
    nearby_reports: 0,
    evidence_count: input.evidence_count ?? 0,
    historical_matches: 0,
    source: intakeSource(input),
    now: analyzedAt,
  });
  return escalatePriority(base, {
    independent_reports: input.linked_report_count ?? 0,
    evidence_count: input.evidence_count ?? 0,
    now: analyzedAt,
  });
}

function intakeSource(input: ReportInput) {
  return normalizeReportIntake(input).source;
}

function buildDeterministicClassification(input: {
  intake: NormalizedReportIntake;
  report: ReportInput;
  analyzedAt: string;
  model: string;
  reason: string | null;
}): ReportClassification {
  const { intake, report } = input;
  const { category, normalization } = categoryForIntake(report, intake);
  const hasLocation = intake.location_precision !== "none";
  const missing = missingFor({
    description: intake.normalized_text,
    category,
    hasLocation,
  });
  const injectionNote = intake.injection_detected
    ? "El texto contiene instrucciones dirigidas al sistema; se trató únicamente como datos."
    : null;
  const notes = [input.reason, injectionNote, normalization.note]
    .filter((note): note is string => Boolean(note))
    .join(" ");

  const severity = inferSeverityFromText(intake.normalized_text, "medium");

  return {
    suggested_category: category,
    suggested_title: fallbackTitle(category, intake.location_colonia),
    normalized_summary: groundedSummary(intake.normalized_text, category),
    safety_concerns: defaultSafetyConcerns(category),
    accessibility_considerations: defaultAccessibilityConsiderations(category),
    suggested_department: DEFAULT_DEPARTMENT_BY_CATEGORY[category],
    required_specialist_skill: DEFAULT_SPECIALIST_BY_CATEGORY[category],
    needs_more_information: missing.length > 0,
    missing_information: missing,
    uncertainty_notes: notes || null,
    severity,
    severity_rationale: `Severidad estimada por palabras clave del texto (${severity}).`,
    confidence: intake.category.method === "explicit" ? 0.45 : category === "other" ? 0.2 : 0.35,
    original_description: intake.original_text,
    input_truncated: intake.truncated,
    model: input.model,
    analysis_version: AI_ANALYSIS_VERSION,
    analyzed_at: input.analyzedAt,
    fallback: true,
    report_source: intake.source,
    source_label: intake.source_label,
    source_record_id: intake.source_record_id,
    original_category: intake.category.original_category,
    category_normalization: normalization,
    priority: priorityFor(report, severity, input.analyzedAt),
  };
}

/**
 * Deterministic classification for callers that already know the model cannot
 * be used (deadline exceeded, provider failure, explicit low-cost mode). Same
 * contract as `classifyReport`, always marked `fallback: true`.
 */
export function fallbackClassification(
  input: ReportInput,
  options: AIDeps & { reason?: string | null } = {},
): ReportClassification {
  const analyzedAt = (options.now?.() ?? new Date()).toISOString();
  const client = options.client ?? getAIClient();
  return buildDeterministicClassification({
    intake: normalizeReportIntake(input),
    report: input,
    analyzedAt,
    model: client.model,
    reason:
      options.reason ??
      "Clasificación determinista solicitada por el flujo de procesamiento.",
  });
}

/**
 * Classifies a report from any intake source (citizen form, government record,
 * messaging or voice transcription) in Mexican Spanish.
 *
 * Always resolves: missing key, timeout, HTTP error or invalid model output
 * produce a deterministic, clearly-flagged fallback instead of throwing.
 */
export async function classifyReport(
  input: ReportInput,
  deps: AIDeps = {},
): Promise<ReportClassification> {
  const analyzedAt = (deps.now?.() ?? new Date()).toISOString();
  const intake = normalizeReportIntake(input);
  const client = deps.client ?? getAIClient();
  const explicitHint = explicitCategory(input);

  if (intake.normalized_text.length < MIN_USEFUL_DESCRIPTION) {
    return buildDeterministicClassification({
      intake,
      report: input,
      analyzedAt,
      model: client.model,
      reason: "No hay descripción suficiente para un análisis semántico.",
    });
  }

  if (!client.configured) {
    return buildDeterministicClassification({
      intake,
      report: input,
      analyzedAt,
      model: client.model,
      reason: "El servicio de IA no está configurado; se usó una clasificación por palabras clave.",
    });
  }

  const { category: intakeCategory, normalization } = categoryForIntake(input, intake);

  const prompt = buildClassifyPrompt({
    description: intake.normalized_text,
    title: intake.title,
    categoryHint: intakeCategory,
    location:
      intake.location && intake.location_precision === "exact"
        ? {
            latitude: intake.location.latitude,
            longitude: intake.location.longitude,
            colonia: intake.location.colonia ?? intake.location_colonia,
          }
        : null,
    source: intake.source,
    sourceLabel: intake.source_label,
    originalCategory: intake.category.original_category,
  });

  const result = await client.completeJson(prompt, classificationModelSchema);
  if (!result.ok) {
    return buildDeterministicClassification({
      intake,
      report: input,
      analyzedAt,
      model: client.model,
      reason: `Clasificación determinista (IA no disponible: ${result.error.code}).`,
    });
  }

  const model = result.data;
  const normalizedModelCategory = normalizeCategory(model.suggested_category);
  const category: CaseCategory =
    normalizedModelCategory ??
    explicitHint ??
    intakeCategory ??
    inferCategoryFromText(intake.normalized_text);
  const categoryWasNormalized =
    model.suggested_category != null && normalizedModelCategory === null;

  const titleSource = model.suggested_title?.trim() || "";
  const title =
    titleSource.length >= 3
      ? limitText(titleSource, 90).text
      : fallbackTitle(category, intake.location_colonia);

  const summarySource = model.normalized_summary?.trim() || "";
  const summary =
    summarySource.length >= 12
      ? limitText(summarySource, AI_LIMITS.maxSummaryChars).text
      : groundedSummary(intake.normalized_text, category);

  const safety = dropUnsupportedAccidentClaims(
    cleanBullets(model.safety_concerns, AI_LIMITS.maxBullets, AI_LIMITS.maxBulletChars),
    intake.normalized_text,
  );
  const accessibility = cleanBullets(
    model.accessibility_considerations,
    AI_LIMITS.maxBullets,
    AI_LIMITS.maxBulletChars,
  );

  const missing = cleanBullets(
    model.missing_information,
    AI_LIMITS.maxBullets,
    AI_LIMITS.maxBulletChars,
  );
  if (intake.location_precision === "none") {
    const locationNote = "Ubicación exacta (coordenadas o referencia).";
    if (!missing.some((item) => normalizeText(item).includes("ubicacion"))) {
      missing.push(locationNote);
    }
  }

  const notes: string[] = [];
  if (model.uncertainty_notes?.trim()) notes.push(limitText(model.uncertainty_notes, 600).text);
  if (normalization.note) notes.push(normalization.note);
  if (categoryWasNormalized) {
    notes.push("La categoría propuesta no era válida; se normalizó localmente.");
  }
  if (intake.injection_detected) {
    notes.push("El texto contiene instrucciones dirigidas al sistema; se trató únicamente como datos.");
  }
  if (intake.truncated) notes.push("El texto original se truncó por longitud.");
  if (result.cached) notes.push("Resultado recuperado de caché.");

  const department = model.suggested_department?.trim();
  const safeDepartment =
    department && department.length > 2 ? limitText(department, 160).text : null;
  const skill = model.required_specialist_skill?.trim();

  const severity: Severity = normalizeSeverity(
    model.severity,
    inferSeverityFromText(intake.normalized_text, "medium"),
  );

  const confidence = clampConfidence(
    categoryWasNormalized && typeof model.confidence === "number"
      ? model.confidence - 0.15
      : model.confidence,
    explicitHint ? 0.55 : 0.5,
  );

  return {
    suggested_category: category,
    suggested_title: title,
    normalized_summary: summary,
    safety_concerns: safety,
    accessibility_considerations: accessibility,
    suggested_department: safeDepartment,
    required_specialist_skill: skill && skill.length > 2 ? limitText(skill, 160).text : null,
    needs_more_information: Boolean(model.needs_more_information) || missing.length > 0,
    missing_information: missing,
    uncertainty_notes: notes.length > 0 ? notes.join(" ") : null,
    severity,
    severity_rationale: model.severity_rationale?.trim()
      ? limitText(model.severity_rationale, 300).text
      : `Severidad sugerida por el modelo (${severity}); no verificada en campo.`,
    confidence,
    original_description: intake.original_text,
    input_truncated: intake.truncated,
    model: result.model,
    analysis_version: AI_ANALYSIS_VERSION,
    analyzed_at: isIsoDate(analyzedAt) ? analyzedAt : new Date().toISOString(),
    fallback: false,
    report_source: intake.source,
    source_label: intake.source_label,
    source_record_id: intake.source_record_id,
    original_category: intake.category.original_category,
    category_normalization: {
      ...normalization,
      normalized_category: category,
      method: categoryWasNormalized ? "fallback" : normalization.method,
    },
    priority: priorityFor(input, severity, analyzedAt),
  };
}
