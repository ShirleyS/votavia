import type { AIAnalysisResult, Case } from "@/shared/votavia-contract";
import type {
  DuplicateCandidateInput,
  DuplicateDetectionResult,
  ReportClassification,
  ReportInput,
} from "../types";

/** Maps the main application's Case into the AI module's typed input. */
export function caseToReportInput(item: Case): ReportInput {
  return {
    case_id: item.case_id,
    description: item.description,
    title: item.title,
    category: item.category,
    location: {
      latitude: item.latitude,
      longitude: item.longitude,
      colonia: item.colonia,
    },
    created_at: item.created_at,
  };
}

export function caseToDuplicateCandidate(item: Case): DuplicateCandidateInput {
  return {
    case_id: item.case_id,
    description: item.description,
    category: item.category,
    status: item.status,
    location: {
      latitude: item.latitude,
      longitude: item.longitude,
      colonia: item.colonia,
    },
    colonia: item.colonia,
    title: item.title,
    created_at: item.created_at,
  };
}

/**
 * Adapts AI output to the shared `AIAnalysisResult` contract.
 * The shared contract is never modified here.
 */
export function toAIAnalysisResult(input: {
  case_id: string;
  classification: ReportClassification;
  duplicates?: DuplicateDetectionResult | null;
  created_at?: string;
}): AIAnalysisResult {
  const duplicates = (input.duplicates?.matches ?? [])
    .filter((match) => match.relationship !== "different_problem")
    .slice(0, 8)
    .map((match) => ({
      case_id: match.case_id,
      score:
        match.confidence ??
        (match.relationship === "same_problem"
          ? 0.65
          : match.relationship === "related_problem"
            ? 0.45
            : 0.25),
      reason: match.explanation,
    }));

  return {
    case_id: input.case_id,
    model: input.classification.model,
    summary: input.classification.normalized_summary,
    suggested_category: input.classification.suggested_category,
    severity: input.classification.severity,
    duplicate_candidates: duplicates,
    confidence: input.classification.confidence,
    created_at: input.created_at ?? input.classification.analyzed_at,
  };
}
