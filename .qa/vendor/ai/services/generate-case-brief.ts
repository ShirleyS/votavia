import type { CaseCategory } from "@/shared/votavia-contract";
import { getAIClient } from "../client";
import { buildCasePrompt } from "../prompts/analyze-case";
import { caseBriefModelSchema } from "../schemas";
import {
  AI_ANALYSIS_VERSION,
  AI_LIMITS,
  type AIDeps,
  type CaseBriefInput,
  type CaseIntelligence,
  type CaseRisk,
  type DuplicateComparison,
  type HistoricalRecord,
  type Jurisdiction,
  type RelatedCaseSummary,
  type Severity,
} from "../types";
import {
  DEFAULT_DEPARTMENT_BY_CATEGORY,
  defaultAction,
  jurisdictionForCategory,
  priorityFactorsFor,
} from "../utils/fallbacks";
import {
  cleanBullets,
  isIsoDate,
  limitText,
  normalizeCategory,
  normalizeRelationship,
  normalizeText,
  redactPii,
  uniqueIds,
} from "../utils/validation";

const INCIDENT_ASSERTION =
  /\b(ocurri[oó]|sucedi[oó]|hubo|se registr[oó])\s+(un\s+|una\s+)?(accidente|atropell\w*|herid\w*|falleci\w*|muert\w*)/i;
const INCIDENT_MENTION = /\b(accidente|atropell\w*|herid\w*|falleci\w*|muert\w*)\b/i;

function relationshipList(input: CaseBriefInput): DuplicateComparison[] {
  if (!input.duplicates) return [];
  if (Array.isArray(input.duplicates)) return input.duplicates;
  return input.duplicates.matches;
}

function severityFromClassification(input: CaseBriefInput): Severity {
  return input.classification?.severity ?? "medium";
}

function deterministicHistorical(records: readonly HistoricalRecord[]): {
  summary: string;
  ids: string[];
} {
  if (records.length === 0) {
    return {
      summary: "No se proporcionaron registros históricos para este caso.",
      ids: [],
    };
  }
  const sources = uniqueIds(records.map((record) => record.source)).slice(0, 4);
  const categories = uniqueIds(records.map((record) => record.category)).slice(0, 4);
  const ordered = [...records].sort((a, b) => {
    const aTime = a.occurred_at && isIsoDate(a.occurred_at) ? Date.parse(a.occurred_at) : 0;
    const bTime = b.occurred_at && isIsoDate(b.occurred_at) ? Date.parse(b.occurred_at) : 0;
    return bTime - aTime;
  });
  const cited = ordered.slice(0, 5).map((record) => record.id);
  return {
    summary: `Se proporcionaron ${records.length} registro(s) histórico(s) de ${sources.join(", ") || "fuentes no especificadas"}. Categorías reportadas: ${categories.join(", ") || "sin categoría"}. Los IDs citados corresponden a los registros más recientes del conjunto entregado; no se consultó ninguna fuente externa.`,
    ids: cited,
  };
}

function deterministicRisks(
  input: CaseBriefInput,
  category: CaseCategory,
): CaseRisk[] {
  const description = limitText(input.report.description ?? "", 240).text;
  const evidence = description ? [description] : [];
  const risks: CaseRisk[] = [];
  for (const concern of input.classification?.safety_concerns ?? []) {
    risks.push({ risk: limitText(concern, 240).text, evidence, uncertainty: null });
  }
  for (const note of input.classification?.accessibility_considerations ?? []) {
    risks.push({
      risk: `Accesibilidad: ${limitText(note, 220).text}`,
      evidence,
      uncertainty: null,
    });
  }
  if (risks.length === 0 && category === "other") {
    risks.push({
      risk: "No se identificó un riesgo específico con la evidencia disponible.",
      evidence,
      uncertainty: "Falta información técnica para valorar el riesgo.",
    });
  }
  return risks.slice(0, AI_LIMITS.maxBullets);
}

function deterministicRelated(
  comparisons: readonly DuplicateComparison[],
  category: CaseCategory,
): RelatedCaseSummary[] {
  return comparisons
    .filter((comparison) => comparison.relationship !== "different_problem")
    .slice(0, 6)
    .map((comparison) => ({
      case_id: comparison.case_id,
      relationship:
        comparison.relationship === "same_problem" || comparison.relationship === "related_problem"
          ? comparison.relationship
          : "uncertain",
      explanation:
        comparison.explanation ||
        `Caso cercano de categoría compatible (${category}). Revisar manualmente.`,
    }));
}

function buildDeterministicBrief(input: {
  source: CaseBriefInput;
  analyzedAt: string;
  model: string;
}): CaseIntelligence {
  const { source } = input;
  const category: CaseCategory =
    normalizeCategory(source.report.category) ??
    source.classification?.suggested_category ??
    "other";
  const comparisons = relationshipList(source);
  const historical = deterministicHistorical(source.historical_records ?? []);
  const jurisdiction = jurisdictionForCategory(category);
  const summaryBase =
    source.classification?.normalized_summary?.trim() ||
    `Reporte ciudadano sobre ${category}: ${limitText(source.report.description ?? "", 280).text}`;
  const where = source.report.location?.colonia
    ? ` Ubicación reportada: ${source.report.location.colonia}.`
    : " No se registró una colonia en el reporte.";

  return {
    case_id: source.report.case_id,
    summary: limitText(`${summaryBase}${where}`, AI_LIMITS.maxSummaryChars).text,
    potential_risks: deterministicRisks(source, category),
    related_cases: deterministicRelated(comparisons, category),
    historical_context: {
      summary: historical.summary,
      source_record_ids: historical.ids,
    },
    suggested_department:
      source.classification?.suggested_department ?? DEFAULT_DEPARTMENT_BY_CATEGORY[category],
    jurisdiction: jurisdiction.jurisdiction,
    jurisdiction_note: jurisdiction.note,
    suggested_action: defaultAction(category),
    priority_factors: priorityFactorsFor({
      severity: severityFromClassification(source),
      category,
      sameProblemCount: comparisons.filter((c) => c.relationship === "same_problem").length,
      hasHistoricalRecords: (source.historical_records ?? []).length > 0,
    }),
    missing_information: uniqueIds([
      ...(source.classification?.missing_information ?? []),
      ...((source.report.location ? [] : ["Confirmar la ubicación exacta del problema."])),
    ]).slice(0, AI_LIMITS.maxBullets),
    requires_human_review: true,
    analyzed_at: input.analyzedAt,
    model: input.model,
    analysis_version: AI_ANALYSIS_VERSION,
    fallback: true,
  };
}

function normalizeJurisdiction(value: unknown): Jurisdiction {
  const text = normalizeText(typeof value === "string" ? value : "").replace(/[\s-]+/g, "_");
  if (["municipal", "municipio", "alcaldia", "municipal_jurisdiction", "local"].includes(text)) {
    return "municipal";
  }
  if (
    ["external_agency", "externa", "agencia_externa", "estatal", "federal", "otra_agencia"].includes(
      text,
    )
  ) {
    return "external_agency";
  }
  return "uncertain";
}

/**
 * Generates the "Inteligencia del Caso" briefing.
 *
 * Post-validates every citation and related case id against the supplied data;
 * fabricated ids are removed. Never asserts an incident occurred.
 */
export async function generateCaseBrief(
  input: CaseBriefInput,
  deps: AIDeps = {},
): Promise<CaseIntelligence> {
  const analyzedAt = (
    input.current_date && isIsoDate(input.current_date)
      ? new Date(input.current_date)
      : (deps.now?.() ?? new Date())
  ).toISOString();
  const client = deps.client ?? getAIClient();
  const category: CaseCategory =
    normalizeCategory(input.report.category) ??
    input.classification?.suggested_category ??
    "other";

  if (!client.configured) {
    return buildDeterministicBrief({
      source: input,
      analyzedAt,
      model: client.model,
    });
  }

  const allHistorical = input.historical_records ?? [];
  const historicalIds = new Set(allHistorical.map((record) => record.id));
  const comparisons = relationshipList(input);
  const relatedIds = new Set(comparisons.map((comparison) => comparison.case_id));

  const prompt = buildCasePrompt({
    report: {
      case_id: input.report.case_id,
      display_id: input.report.display_id ?? null,
      description: limitText(
        redactPii(input.report.description ?? ""),
        AI_LIMITS.maxDescriptionChars,
      ).text,
      category,
      colonia: input.report.location?.colonia ?? null,
      latitude: input.report.location?.latitude ?? null,
      longitude: input.report.location?.longitude ?? null,
      status: input.report.status ?? null,
      created_at: input.report.created_at ?? null,
    },
    classification: input.classification
      ? {
          suggested_category: input.classification.suggested_category,
          normalized_summary: input.classification.normalized_summary,
          safety_concerns: input.classification.safety_concerns,
          accessibility_considerations: input.classification.accessibility_considerations,
          severity: input.classification.severity,
          missing_information: input.classification.missing_information,
        }
      : null,
    related_cases: comparisons
      .filter((comparison) => comparison.relationship !== "different_problem")
      .slice(0, 8)
      .map((comparison) => ({
        case_id: comparison.case_id,
        relationship: comparison.relationship,
        explanation: limitText(comparison.explanation, 400).text,
        distance_meters: comparison.distance_meters,
      })),
    historical_records: allHistorical.slice(0, AI_LIMITS.maxHistoricalRecords).map((record) => ({
      id: record.id,
      source: record.source,
      category: record.category,
      occurred_at: record.occurred_at ?? null,
      colonia: record.colonia ?? null,
      source_url: record.source_url ?? null,
    })),
    observations: (input.observations ?? []).slice(0, 6).map((observation) => ({
      kind: observation.kind ?? null,
      body: limitText(redactPii(observation.body ?? ""), 300).text,
      created_at: observation.created_at ?? null,
    })),
    previous_actions: (input.previous_actions ?? [])
      .slice(0, 6)
      .map((action) => limitText(action, 300).text),
  });

  const result = await client.completeJson(prompt, caseBriefModelSchema);
  if (!result.ok) {
    return buildDeterministicBrief({
      source: input,
      analyzedAt,
      model: client.model,
    });
  }

  const model = result.data;
  const description = input.report.description ?? "";
  const allowsIncident = INCIDENT_MENTION.test(description);

  const risks: CaseRisk[] = model.potential_risks
    .map((risk) => ({
      risk: limitText(risk.risk, 240).text,
      evidence: cleanBullets(risk.evidence, 4, 240),
      uncertainty: risk.uncertainty?.trim() ? limitText(risk.uncertainty, 300).text : null,
    }))
    .filter((risk) => risk.risk.length >= 3)
    .filter(
      (risk) =>
        allowsIncident ||
        (!INCIDENT_ASSERTION.test(risk.risk) &&
          !risk.evidence.some((item) => INCIDENT_ASSERTION.test(item))),
    )
    .slice(0, AI_LIMITS.maxBullets);

  const related: RelatedCaseSummary[] = [];
  const seenRelated = new Set<string>();
  for (const item of model.related_cases) {
    const id = item.case_id.trim();
    if (!relatedIds.has(id) || seenRelated.has(id)) continue;
    const relationship = normalizeRelationship(item.relationship);
    if (relationship === "different_problem") continue;
    seenRelated.add(id);
    related.push({
      case_id: id,
      relationship,
      explanation:
        item.explanation.trim().length >= 3
          ? limitText(item.explanation, 500).text
          : "Relación sugerida por el análisis; requiere revisión humana.",
    });
    if (related.length >= 6) break;
  }

  const fallbackHistorical = deterministicHistorical(allHistorical);
  const citedIds: string[] = [];
  const seenHistorical = new Set<string>();
  for (const rawId of model.historical_context.source_record_ids) {
    const id = rawId.trim();
    if (!historicalIds.has(id) || seenHistorical.has(id)) continue;
    seenHistorical.add(id);
    citedIds.push(id);
    if (citedIds.length >= 8) break;
  }
  const historicalSummary = model.historical_context.summary.trim();
  const historical =
    allHistorical.length === 0
      ? {
          summary: "No se proporcionaron registros históricos para este caso.",
          source_record_ids: [],
        }
      : citedIds.length === 0
        ? {
            summary: fallbackHistorical.summary,
            source_record_ids: fallbackHistorical.ids,
          }
        : {
            summary:
              historicalSummary.length >= 10
                ? limitText(historicalSummary, AI_LIMITS.maxHistoricalSummaryChars).text
                : fallbackHistorical.summary,
            source_record_ids: citedIds,
          };

  const department = model.suggested_department?.trim() ?? "";
  const suggestedDepartment =
    department.length > 2 ? limitText(department, 160).text : null;
  const jurisdiction = normalizeJurisdiction(model.jurisdiction);
  const jurisdictionNote =
    model.jurisdiction_note?.trim().length
      ? limitText(model.jurisdiction_note, 400).text
      : jurisdictionForCategory(category).note;

  const summaryBase = model.summary?.trim() ?? "";
  const summary =
    summaryBase.length >= 20
      ? limitText(summaryBase, AI_LIMITS.maxSummaryChars).text
      : buildDeterministicBrief({ source: input, analyzedAt, model: client.model }).summary;

  const priorityFactors = cleanBullets(model.priority_factors, 8, 240);
  const missingInformation = uniqueIds([
    ...cleanBullets(model.missing_information, 8, 240),
    ...(input.classification?.missing_information ?? []),
  ]).slice(0, AI_LIMITS.maxBullets);

  const action = model.suggested_action?.trim() ?? "";

  return {
    case_id: input.report.case_id,
    summary,
    potential_risks: risks.length > 0 ? risks : deterministicRisks(input, category),
    related_cases: related.length > 0 ? related : deterministicRelated(comparisons, category),
    historical_context: historical,
    suggested_department: suggestedDepartment,
    jurisdiction,
    jurisdiction_note: jurisdictionNote,
    suggested_action: action.length >= 8 ? limitText(action, 700).text : defaultAction(category),
    priority_factors:
      priorityFactors.length > 0
        ? priorityFactors
        : priorityFactorsFor({
            severity: severityFromClassification(input),
            category,
            sameProblemCount: comparisons.filter((c) => c.relationship === "same_problem").length,
            hasHistoricalRecords: allHistorical.length > 0,
          }),
    missing_information: missingInformation,
    requires_human_review: true,
    analyzed_at: analyzedAt,
    model: result.model,
    analysis_version: AI_ANALYSIS_VERSION,
    fallback: false,
  };
}
