import type { CaseCategory } from "@/shared/votavia-contract";
import { getAIClient } from "../client";
import { buildDuplicatePrompt } from "../prompts/compare-duplicates";
import { duplicateComparisonResponseSchema } from "../schemas";
import {
  AI_ANALYSIS_VERSION,
  AI_LIMITS,
  type AIDeps,
  type DuplicateCandidateInput,
  type DuplicateComparison,
  type DuplicateDetectionResult,
  type DuplicateRelationship,
  type ReportInput,
  type SimilaritySignals,
} from "../types";
import { shortlistCandidates } from "../utils/candidate-ranking";
import { normalizeReportIntake } from "./intake";
import { scoreCandidate } from "../utils/signals";
import {
  cleanBullets,
  clampConfidence,
  limitText,
  normalizeRelationship,
  redactPii,
} from "../utils/validation";

export interface FindDuplicatesOptions extends AIDeps {
  maxCandidates?: number;
  radiusByCategory?: Partial<Record<CaseCategory, number>>;
  includeResolved?: boolean;
}

const RELATIONSHIP_ORDER: Record<DuplicateRelationship, number> = {
  same_problem: 0,
  related_problem: 1,
  uncertain: 2,
  different_problem: 3,
};

function deterministicComparison(
  candidate: DuplicateCandidateInput,
  distance: number | null,
  categoryMatch: boolean,
  signals?: SimilaritySignals,
): DuplicateComparison {
  return {
    case_id: candidate.case_id,
    relationship: "uncertain",
    explanation:
      "No fue posible comparar semánticamente los textos; se requiere revisión humana.",
    evidence: [],
    confidence: signals ? round(signals.composite * 0.8) : null,
    distance_meters: distance,
    category_match: categoryMatch,
    signals,
  };
}

function blendConfidence(prior: number, modelConfidence: number | null): number {
  if (modelConfidence === null) return round(prior * 0.8);
  return round(0.45 * prior + 0.55 * modelConfidence);
}

function round(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

/**
 * Two-stage duplicate detection.
 *
 * Stage A is deterministic (Haversine + category/status rules + lexical prior,
 * bounded count). Stage B is ONE bounded model request for the shortlist.
 * Nothing is merged, deleted or auto-resolved: the result is a review
 * suggestion with explainable signals.
 */
export async function findDuplicateReports(
  input: ReportInput,
  candidates: readonly DuplicateCandidateInput[],
  options: FindDuplicatesOptions = {},
): Promise<DuplicateDetectionResult> {
  const analyzedAt = (options.now?.() ?? new Date()).toISOString();
  const client = options.client ?? getAIClient();
  const intake = normalizeReportIntake(input);
  const subject: ReportInput = {
    ...input,
    category: input.category ?? intake.category.normalized_category,
    created_at: input.created_at ?? intake.created_at,
  };

  const shortlist = shortlistCandidates(subject, candidates, {
    maxCandidates: options.maxCandidates,
    radiusByCategory: options.radiusByCategory,
    includeResolved: options.includeResolved,
  });
  const notes: string[] = [];

  if (!shortlist.subjectCoordinates) {
    notes.push(
      "El reporte no tiene coordenadas válidas; la comparación se limitó a la colonia indicada.",
    );
  }
  if (shortlist.excluded.outOfRange > 0) {
    notes.push(`${shortlist.excluded.outOfRange} candidato(s) quedaron fuera del radio de la categoría.`);
  }
  if (shortlist.excluded.incompatible > 0) {
    notes.push(`${shortlist.excluded.incompatible} candidato(s) de categoría no compatible fueron descartados.`);
  }
  if (shortlist.excluded.missingLocation > 0) {
    notes.push(`${shortlist.excluded.missingLocation} candidato(s) sin ubicación comparable.`);
  }

  if (shortlist.shortlisted.length === 0) {
    notes.push("No se encontraron candidatos cercanos compatibles para comparar.");
    return {
      analyzed_case_id: input.case_id ?? null,
      matches: [],
      shortlisted_count: 0,
      compared_with_model: false,
      model: client.model,
      analysis_version: AI_ANALYSIS_VERSION,
      analyzed_at: analyzedAt,
      fallback: false,
      notes,
      source: intake.source,
      comparison_method: "deterministic",
    };
  }

  const scored = shortlist.shortlisted.map((entry) => ({
    ...entry,
    signals: scoreCandidate({
      subject,
      subjectCategory: shortlist.subjectCategory,
      candidate: entry.candidate,
    }),
  }));

  if (!client.configured) {
    return {
      analyzed_case_id: input.case_id ?? null,
      matches: scored.map(({ candidate, distanceMeters, categoryMatch, signals }) =>
        deterministicComparison(candidate, distanceMeters, categoryMatch, signals),
      ),
      shortlisted_count: shortlist.shortlisted.length,
      compared_with_model: false,
      model: client.model,
      analysis_version: AI_ANALYSIS_VERSION,
      analyzed_at: analyzedAt,
      fallback: true,
      notes: [...notes, "El servicio de IA no está configurado; candidatos sin comparación semántica."],
      source: intake.source,
      comparison_method: "deterministic",
    };
  }

  const subjectDescription = limitText(intake.normalized_text, AI_LIMITS.maxDescriptionChars).text;
  const prompt = buildDuplicatePrompt({
    subject: {
      description: subjectDescription,
      category: shortlist.subjectCategory,
      colonia: intake.location_colonia ?? input.location?.colonia ?? null,
      latitude: shortlist.subjectCoordinates?.latitude ?? null,
      longitude: shortlist.subjectCoordinates?.longitude ?? null,
      source: intake.source,
      issue_id: null,
    },
    candidates: scored.map(({ candidate, distanceMeters, signals }) => ({
      case_id: candidate.case_id,
      issue_id: null,
      description: limitText(
        redactPii(candidate.description ?? ""),
        AI_LIMITS.maxCandidateDescriptionChars,
      ).text,
      category: candidate.category,
      original_category: null,
      status: candidate.status ?? null,
      distance_meters: distanceMeters,
      colonia: candidate.colonia ?? candidate.location?.colonia ?? null,
      created_at: candidate.created_at ?? null,
      source: null,
      signals: {
        geographic: signals.geographic.score,
        semantic: signals.semantic.score,
        category: signals.category.score,
        temporal: signals.temporal.score,
        history: signals.history.score,
        composite: signals.composite,
        shared_terms: signals.semantic.shared_terms,
      },
    })),
  });

  const result = await client.completeJson(prompt, duplicateComparisonResponseSchema);

  if (!result.ok) {
    return {
      analyzed_case_id: input.case_id ?? null,
      matches: scored.map(({ candidate, distanceMeters, categoryMatch, signals }) =>
        deterministicComparison(candidate, distanceMeters, categoryMatch, signals),
      ),
      shortlisted_count: shortlist.shortlisted.length,
      compared_with_model: false,
      model: client.model,
      analysis_version: AI_ANALYSIS_VERSION,
      analyzed_at: analyzedAt,
      fallback: true,
      notes: [...notes, `Comparación semántica no disponible (${result.error.code}).`],
      source: intake.source,
      comparison_method: "deterministic",
    };
  }

  const byId = new Map<string, (typeof result.data.comparisons)[number]>();
  for (const comparison of result.data.comparisons) {
    const id = comparison.case_id.trim();
    if (!scored.some(({ candidate }) => candidate.case_id === id)) continue;
    if (!byId.has(id)) byId.set(id, comparison);
  }

  let missingComparisons = 0;
  const matches: DuplicateComparison[] = scored.map(
    ({ candidate, distanceMeters, categoryMatch, signals }) => {
      const model = byId.get(candidate.case_id);
      if (!model) {
        missingComparisons += 1;
        return deterministicComparison(candidate, distanceMeters, categoryMatch, signals);
      }
      const explanation = model.explanation.trim();
      return {
        case_id: candidate.case_id,
        relationship: normalizeRelationship(model.relationship),
        explanation:
          explanation.length >= 5
            ? limitText(explanation, 600).text
            : "El modelo no explicó la relación; se requiere revisión humana.",
        evidence: cleanBullets(model.evidence, 4, 240),
        confidence: blendConfidence(
          signals.composite,
          typeof model.confidence === "number" ? clampConfidence(model.confidence) : null,
        ),
        distance_meters: distanceMeters,
        category_match: categoryMatch,
        signals,
      };
    },
  );

  if (missingComparisons > 0) {
    notes.push(`${missingComparisons} candidato(s) no fueron evaluados por el modelo.`);
  }
  if (result.cached) notes.push("Resultado recuperado de caché.");
  if (result.data.comparisons.length > scored.length) {
    notes.push("Se descartaron comparaciones con identificadores no solicitados.");
  }
  if (intake.source === "government_record" && intake.category.original_category) {
    notes.push(`Registro importado con categoría original "${intake.category.original_category}".`);
  }

  matches.sort(
    (a, b) =>
      RELATIONSHIP_ORDER[a.relationship] - RELATIONSHIP_ORDER[b.relationship] ||
      (b.confidence ?? 0) - (a.confidence ?? 0) ||
      (a.distance_meters ?? Number.MAX_SAFE_INTEGER) -
        (b.distance_meters ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    analyzed_case_id: input.case_id ?? null,
    matches,
    shortlisted_count: shortlist.shortlisted.length,
    compared_with_model: true,
    model: result.model,
    analysis_version: AI_ANALYSIS_VERSION,
    analyzed_at: analyzedAt,
    fallback: false,
    notes,
    source: intake.source,
    comparison_method: "model",
  };
}
