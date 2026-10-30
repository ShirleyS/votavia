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
} from "../types";
import { shortlistCandidates } from "../utils/candidate-ranking";
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
): DuplicateComparison {
  return {
    case_id: candidate.case_id,
    relationship: "uncertain",
    explanation:
      "No fue posible comparar semánticamente los textos; se requiere revisión humana.",
    evidence: [],
    confidence: null,
    distance_meters: distance,
    category_match: categoryMatch,
  };
}

/**
 * Two-stage duplicate detection.
 *
 * Stage A is deterministic (Haversine + category/status rules, bounded count).
 * Stage B is ONE bounded model request for the shortlist. Nothing is merged,
 * deleted or auto-resolved: the result is a review suggestion.
 */
export async function findDuplicateReports(
  input: ReportInput,
  candidates: readonly DuplicateCandidateInput[],
  options: FindDuplicatesOptions = {},
): Promise<DuplicateDetectionResult> {
  const analyzedAt = (options.now?.() ?? new Date()).toISOString();
  const client = options.client ?? getAIClient();
  const shortlist = shortlistCandidates(input, candidates, {
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
    };
  }

  if (!client.configured) {
    return {
      analyzed_case_id: input.case_id ?? null,
      matches: shortlist.shortlisted.map(({ candidate, distanceMeters, categoryMatch }) =>
        deterministicComparison(candidate, distanceMeters, categoryMatch),
      ),
      shortlisted_count: shortlist.shortlisted.length,
      compared_with_model: false,
      model: client.model,
      analysis_version: AI_ANALYSIS_VERSION,
      analyzed_at: analyzedAt,
      fallback: true,
      notes: [...notes, "El servicio de IA no está configurado; candidatos sin comparación semántica."],
    };
  }

  const subjectDescription = limitText(
    redactPii(input.description ?? ""),
    AI_LIMITS.maxDescriptionChars,
  ).text;
  const prompt = buildDuplicatePrompt({
    subject: {
      description: subjectDescription,
      category: shortlist.subjectCategory,
      colonia: input.location?.colonia ?? null,
      latitude: shortlist.subjectCoordinates?.latitude ?? null,
      longitude: shortlist.subjectCoordinates?.longitude ?? null,
    },
    candidates: shortlist.shortlisted.map(({ candidate, distanceMeters }) => ({
      case_id: candidate.case_id,
      description: limitText(
        redactPii(candidate.description ?? ""),
        AI_LIMITS.maxCandidateDescriptionChars,
      ).text,
      category: candidate.category,
      status: candidate.status ?? null,
      distance_meters: distanceMeters,
      colonia: candidate.colonia ?? candidate.location?.colonia ?? null,
      created_at: candidate.created_at ?? null,
    })),
  });

  const result = await client.completeJson(prompt, duplicateComparisonResponseSchema);

  if (!result.ok) {
    return {
      analyzed_case_id: input.case_id ?? null,
      matches: shortlist.shortlisted.map(({ candidate, distanceMeters, categoryMatch }) =>
        deterministicComparison(candidate, distanceMeters, categoryMatch),
      ),
      shortlisted_count: shortlist.shortlisted.length,
      compared_with_model: false,
      model: client.model,
      analysis_version: AI_ANALYSIS_VERSION,
      analyzed_at: analyzedAt,
      fallback: true,
      notes: [...notes, `Comparación semántica no disponible (${result.error.code}).`],
    };
  }

  const byId = new Map<string, (typeof result.data.comparisons)[number]>();
  for (const comparison of result.data.comparisons) {
    const id = comparison.case_id.trim();
    if (!shortlist.shortlisted.some(({ candidate }) => candidate.case_id === id)) continue;
    if (!byId.has(id)) byId.set(id, comparison);
  }

  let missingComparisons = 0;
  const matches: DuplicateComparison[] = shortlist.shortlisted.map(
    ({ candidate, distanceMeters, categoryMatch }) => {
      const model = byId.get(candidate.case_id);
      if (!model) {
        missingComparisons += 1;
        return deterministicComparison(candidate, distanceMeters, categoryMatch);
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
        confidence:
          typeof model.confidence === "number" ? clampConfidence(model.confidence) : null,
        distance_meters: distanceMeters,
        category_match: categoryMatch,
      };
    },
  );

  if (missingComparisons > 0) {
    notes.push(`${missingComparisons} candidato(s) no fueron evaluados por el modelo.`);
  }
  if (result.cached) notes.push("Resultado recuperado de caché.");
  if (result.data.comparisons.length > shortlist.shortlisted.length) {
    notes.push("Se descartaron comparaciones con identificadores no solicitados.");
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
  };
}
