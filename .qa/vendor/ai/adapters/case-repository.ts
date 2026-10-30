import type { AIAnalysisResult, Case, CaseCategory } from "@/shared/votavia-contract";
import type {
  DuplicateCandidateInput,
  DuplicateDetectionResult,
  IssueLinkCandidate,
  IssueLinkResult,
  CategoryNormalization,
  PrioritySuggestion,
  ReportClassification,
  ReportInput,
  ReportProcessingResult,
  ReportSource,
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

/* -------------------------------------------------------------------------- */
/* Multi-source intake adapters                                               */
/* -------------------------------------------------------------------------- */

/**
 * Normalized shape of an imported government record (SUAC/CAEP export).
 * Kept structural so Ismael's collector can map into it without importing
 * AI internals. `original_category` is preserved verbatim.
 */
export interface ImportedGovernmentRecord {
  record_id: string;
  description: string;
  title?: string | null;
  /** Category exactly as published by the source dataset. */
  original_category?: string | null;
  colonia?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reported_at?: string | null;
  closed_at?: string | null;
  source_label?: string | null;
}

/** Maps an imported official record onto the shared report intake contract. */
export function governmentRecordToReportInput(
  record: ImportedGovernmentRecord,
): ReportInput {
  const hasCoordinates =
    typeof record.latitude === "number" &&
    Number.isFinite(record.latitude) &&
    typeof record.longitude === "number" &&
    Number.isFinite(record.longitude);

  const description = [record.description, record.title]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" — ");

  return {
    description,
    title: record.title ?? null,
    category: null,
    original_category: record.original_category ?? null,
    location:
      hasCoordinates || (record.colonia && record.colonia.trim())
        ? {
            latitude: hasCoordinates ? (record.latitude as number) : Number.NaN,
            longitude: hasCoordinates ? (record.longitude as number) : Number.NaN,
            colonia: record.colonia?.trim() || null,
          }
        : null,
    created_at: record.reported_at ?? null,
    resolved_at: record.closed_at ?? null,
    source: "government_record",
    source_label: record.source_label?.trim() || "Registro oficial",
    source_record_id: record.record_id,
  };
}

/**
 * Maps a case into an issue-link candidate. `issue_id` is supplied by the
 * caller (the community issue it belongs to); when omitted the case id is used
 * so every report remains an independent, lossless record.
 */
export function caseToIssueLinkCandidate(
  item: Case,
  extras: {
    issue_id?: string | null;
    source?: ReportSource | null;
    prior_links?: number | null;
  } = {},
): IssueLinkCandidate {
  return {
    ...caseToDuplicateCandidate(item),
    issue_id: extras.issue_id ?? null,
    source: extras.source ?? "citizen_web",
    supporters: item.support_count,
    prior_links: extras.prior_links ?? null,
    resolved_at: item.resolved_at ?? null,
  };
}

/** AI-only extras carried alongside the shared contract (never inside it). */
export interface AIAnalysisExtras {
  priority: PrioritySuggestion;
  category_normalization: CategoryNormalization;
  original_category: string | null;
  severity_rationale: string | null;
  report_source: ReportSource;
  issue_links: Array<{
    candidate_issue_id: string;
    candidate_case_ids: string[];
    relationship: string;
    confidence: number;
    explanation: string;
    auto_merge: false;
  }>;
}

export type AIAnalysisResultV2 = AIAnalysisResult & AIAnalysisExtras;

/**
 * Superset of `toAIAnalysisResult` that additionally surfaces priority,
 * category preservation and issue-link suggestions. The shared
 * `AIAnalysisResult` contract itself is not modified.
 */
export function toAIAnalysisResultV2(input: {
  case_id: string;
  classification: ReportClassification;
  duplicates?: DuplicateDetectionResult | null;
  issue_links?: IssueLinkResult | null;
  created_at?: string;
}): AIAnalysisResultV2 {
  const base = toAIAnalysisResult({
    case_id: input.case_id,
    classification: input.classification,
    duplicates: input.duplicates,
    created_at: input.created_at,
  });

  return {
    ...base,
    priority: input.classification.priority,
    category_normalization: input.classification.category_normalization,
    original_category: input.classification.original_category,
    severity_rationale: input.classification.severity_rationale,
    report_source: input.classification.report_source,
    issue_links: (input.issue_links?.suggestions ?? []).map((suggestion) => ({
      candidate_issue_id: suggestion.candidate_issue_id,
      candidate_case_ids: suggestion.candidate_case_ids,
      relationship: suggestion.relationship,
      confidence: suggestion.confidence,
      explanation: suggestion.explanation,
      auto_merge: false as const,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Issue-aware adapters (Session 1 shared `Issue`, kept structural)            */
/* -------------------------------------------------------------------------- */

/**
 * Structural subset of the shared `Issue` contract. Declared locally so this
 * module keeps compiling against the shared contract copy in this worktree;
 * the main application's `Issue` satisfies it unchanged.
 */
export interface IssueLike {
  issue_id: string;
  title?: string | null;
  description?: string | null;
  category: CaseCategory;
  latitude?: number | null;
  longitude?: number | null;
  colonia?: string | null;
  origin?: "citizen" | "official" | "mixed" | null;
  operational_status?: string | null;
  support_count?: number | null;
  report_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  resolved_at?: string | null;
}

/**
 * Maps a shared issue (the grouped problem) onto an issue-link candidate so
 * duplicate suggestions are compared per issue instead of per report.
 *
 * `representative_case_id` is the report used to represent the issue in the
 * comparison; it defaults to the issue id and is never used as a stored case
 * identifier.
 */
export function issueToReportLinkCandidate(
  issue: IssueLike,
  extras: {
    representative_case_id?: string | null;
    /** Overrides the issue description when a representative report is known. */
    description?: string | null;
    category?: CaseCategory | null;
    created_at?: string | null;
    source?: ReportSource | null;
    prior_links?: number | null;
  } = {},
): IssueLinkCandidate {
  const description =
    extras.description?.trim() ||
    [issue.description, issue.title]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .join(" — ");

  const hasCoordinates =
    typeof issue.latitude === "number" &&
    Number.isFinite(issue.latitude) &&
    typeof issue.longitude === "number" &&
    Number.isFinite(issue.longitude);

  return {
    case_id: extras.representative_case_id?.trim() || issue.issue_id,
    description,
    category: extras.category ?? issue.category,
    status: null,
    location:
      hasCoordinates || (issue.colonia && issue.colonia.trim())
        ? {
            latitude: hasCoordinates ? (issue.latitude as number) : Number.NaN,
            longitude: hasCoordinates ? (issue.longitude as number) : Number.NaN,
            colonia: issue.colonia?.trim() || null,
          }
        : null,
    latitude: issue.latitude ?? null,
    longitude: issue.longitude ?? null,
    colonia: issue.colonia ?? null,
    title: issue.title ?? null,
    created_at: extras.created_at ?? issue.created_at ?? null,
    issue_id: issue.issue_id,
    source: extras.source ?? null,
    supporters: issue.support_count ?? null,
    prior_links: extras.prior_links ?? issue.report_count ?? null,
    resolved_at: issue.resolved_at ?? null,
  };
}

/**
 * Projects the report-processing envelope onto the shared `AIAnalysisResult`
 * shape used by the main application. Call it after the report row exists so
 * `case_id` is a real Session 1 identifier.
 */
export function toReportProcessingSharedView(
  result: ReportProcessingResult,
  caseId?: string | null,
): AIAnalysisResult {
  const duplicates = result.duplicate_suggestions
    .filter((suggestion) => suggestion.relationship !== "different_problem")
    .slice(0, 8)
    .flatMap((suggestion) => {
      const ids =
        suggestion.candidate_case_ids.length > 0
          ? suggestion.candidate_case_ids
          : [suggestion.candidate_issue_id];
      return ids.slice(0, 8).map((id) => ({
        case_id: id,
        score: suggestion.confidence,
        reason: suggestion.explanation,
      }));
    })
    .slice(0, 8);

  return {
    case_id: (caseId ?? result.case_id ?? "").trim(),
    model: result.model,
    summary: result.classification.summary,
    suggested_category: result.classification.suggested_category,
    severity: result.classification.severity,
    duplicate_candidates: duplicates,
    confidence: result.classification.confidence,
    created_at: result.analyzed_at,
  };
}
