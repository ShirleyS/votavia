import type { CaseCategory, CaseStatus } from "@/shared/votavia-contract";

/**
 * Version stamp for every AI result. Bump it when prompts, schemas or the
 * deterministic fallbacks change so stored analysis can be replayed/compared.
 */
export const AI_ANALYSIS_VERSION = "2026-10-30.1";

/** Hard input limits. Oversized citizen text is truncated, never trusted whole. */
export const AI_LIMITS = {
  maxDescriptionChars: 4_000,
  maxTitleChars: 120,
  maxSummaryChars: 700,
  maxBulletChars: 240,
  maxBullets: 6,
  maxCandidates: 8,
  maxCandidateDescriptionChars: 600,
  maxHistoricalRecords: 12,
  maxHistoricalSummaryChars: 800,
  maxPromptChars: 48_000,
} as const;

export type Severity = "low" | "medium" | "high" | "critical";

/**
 * Where a report came from. Every source goes through the same intake
 * normalization and the same classification contract.
 */
export const REPORT_SOURCES = [
  "citizen_web",
  "government_record",
  "messaging",
  "voice_transcription",
  "unknown",
] as const;

export type ReportSource = (typeof REPORT_SOURCES)[number];

export function isReportSource(value: unknown): value is ReportSource {
  return typeof value === "string" && (REPORT_SOURCES as readonly string[]).includes(value);
}

export type DuplicateRelationship =
  | "same_problem"
  | "related_problem"
  | "different_problem"
  | "uncertain";

export interface GeoInput {
  latitude: number;
  longitude: number;
  colonia?: string | null;
}

/** Raw citizen report accepted by the AI module. Never mutated in place. */
export interface ReportInput {
  case_id?: string | null;
  description: string;
  title?: string | null;
  category?: CaseCategory | null;
  location?: GeoInput | null;
  created_at?: string | null;
  /** Intake channel. Defaults to "citizen_web". */
  source?: ReportSource | null;
  /** Human-readable origin, e.g. "SUAC", "WhatsApp", "Llamada 072". */
  source_label?: string | null;
  /** Identifier in the source system. Never used as the VotaVía case id. */
  source_record_id?: string | null;
  /**
   * Category as supplied by the source dataset. Preserved verbatim for
   * imported government records; never overwritten by normalization.
   */
  original_category?: string | null;
  /** Unique people who reported or supported this issue, when known. */
  supporters?: number | null;
  /** Independent reports already linked to the same issue, when known. */
  linked_report_count?: number | null;
  /** Timestamp when a government record was last updated/closed. */
  resolved_at?: string | null;
  /** Count of attached evidence items (photos, records, observations). */
  evidence_count?: number | null;
}

export interface ReportClassification {
  suggested_category: CaseCategory;
  suggested_title: string;
  normalized_summary: string;
  safety_concerns: string[];
  accessibility_considerations: string[];
  suggested_department: string | null;
  required_specialist_skill: string | null;
  needs_more_information: boolean;
  missing_information: string[];
  uncertainty_notes: string | null;
  severity: Severity;
  severity_rationale: string | null;
  /** Model/code heuristic in [0,1]; not a calibrated probability. */
  confidence: number;
  /** Verbatim citizen text (bounded for safety). Always preserved. */
  original_description: string;
  input_truncated: boolean;
  model: string;
  analysis_version: string;
  analyzed_at: string;
  fallback: boolean;
  report_source: ReportSource;
  source_label: string | null;
  source_record_id: string | null;
  /** Raw category from the source dataset, preserved verbatim. */
  original_category: string | null;
  category_normalization: CategoryNormalization;
  /** Explainable, non-verified priority suggestion for this report. */
  priority: PrioritySuggestion;
}

/** Minimal, storage-agnostic shape of an existing case used for comparison. */
export interface DuplicateCandidateInput {
  case_id: string;
  description: string;
  category: CaseCategory;
  status?: CaseStatus | null;
  location?: GeoInput | null;
  latitude?: number | null;
  longitude?: number | null;
  colonia?: string | null;
  title?: string | null;
  created_at?: string | null;
}

export interface DuplicateComparison {
  case_id: string;
  relationship: DuplicateRelationship;
  explanation: string;
  evidence: string[];
  /** Model heuristic only; null when the model omitted it. */
  confidence: number | null;
  distance_meters: number | null;
  category_match: boolean;
  /** Explainable deterministic signals behind the suggestion. */
  signals?: SimilaritySignals;
}

export interface DuplicateDetectionResult {
  analyzed_case_id: string | null;
  /** Bounded shortlist that was actually evaluated (including `different_problem`). */
  matches: DuplicateComparison[];
  shortlisted_count: number;
  /** True when every shortlisted candidate received a semantic comparison. */
  compared_with_model: boolean;
  model: string;
  analysis_version: string;
  analyzed_at: string;
  fallback: boolean;
  notes: string[];
  source?: ReportSource;
  comparison_method?: "model" | "deterministic";
}

export interface CaseBriefReportInput {
  case_id: string;
  display_id?: string | null;
  description: string;
  title?: string | null;
  category: CaseCategory | null;
  location?: GeoInput | null;
  status?: CaseStatus | null;
  created_at?: string | null;
}

export interface CaseObservationInput {
  kind?: string | null;
  body: string;
  created_at?: string | null;
}

export interface CaseBriefInput {
  report: CaseBriefReportInput;
  classification?: ReportClassification | null;
  duplicates?: DuplicateDetectionResult | DuplicateComparison[] | null;
  historical_records?: HistoricalRecord[];
  observations?: CaseObservationInput[];
  previous_actions?: string[];
  /** ISO timestamp used for "analyzed_at"; injectable for tests. */
  current_date?: string | null;
}

export type Jurisdiction = "municipal" | "external_agency" | "uncertain";

export interface CaseRisk {
  risk: string;
  evidence: string[];
  uncertainty?: string | null;
}

export interface RelatedCaseSummary {
  case_id: string;
  relationship: DuplicateRelationship;
  explanation: string;
}

export interface CaseIntelligence {
  case_id: string;
  summary: string;
  potential_risks: CaseRisk[];
  related_cases: RelatedCaseSummary[];
  historical_context: {
    summary: string;
    source_record_ids: string[];
  };
  suggested_department: string | null;
  jurisdiction: Jurisdiction;
  jurisdiction_note: string;
  suggested_action: string;
  priority_factors: string[];
  missing_information: string[];
  requires_human_review: true;
  analyzed_at: string;
  model: string;
  analysis_version: string;
  fallback: boolean;
}

/**
 * Normalized historical/public record. `category` stays as supplied by the
 * dataset owner; use `normalizeCategory` to compare it with VotaVía categories.
 */
export interface HistoricalRecord {
  id: string;
  source: string;
  source_url?: string;
  category: string;
  occurred_at?: string;
  latitude?: number;
  longitude?: number;
  colonia?: string;
  attributes?: Record<string, unknown>;
}

export interface PreventiveRecord extends HistoricalRecord {
  kind?: "report" | "historical";
  status?: string | null;
  severity?: Severity | null;
}

export interface PreventiveInput {
  records: PreventiveRecord[];
  /** Length of each comparison window. Defaults to 30 days. */
  window_days?: number;
  /** ISO timestamp used as "now". Defaults to the current time. */
  now?: string;
  /** Minimum records needed before a concentration becomes a signal. */
  min_records?: number;
}

export type PreventiveSignalType =
  | "repeated_reports"
  | "emerging_concentration"
  | "recurring_problem"
  | "high_severity_reports";

export interface PreventiveWindow {
  days: number;
  current_start: string;
  current_end: string;
  previous_start: string;
  previous_end: string;
  comparable: boolean;
  reason: string;
}

export interface PreventiveSignal {
  signal_id: string;
  signal_type: PreventiveSignalType;
  area_label: string;
  colonia: string | null;
  category: CaseCategory;
  /** Deterministic, human-readable description of the calculated pattern. */
  finding: string;
  evidence_record_ids: string[];
  current_window_count: number;
  previous_window_count: number | null;
  change_ratio: number | null;
  distinct_days: number;
  spatial_precision: "coordinates" | "colonia";
  centroid: GeoInput | null;
  radius_meters: number | null;
  /** Heuristic attention index in [0,100]. Never a probability. */
  score: number;
  limitations: string[];
}

export interface InspectionFlag {
  signal_id: string;
  area_label: string;
  category: CaseCategory;
  reason: string;
  evidence_record_ids: string[];
}

export interface PreventiveStatistics {
  records_received: number;
  records_used: number;
  records_rejected: number;
  records_without_dates: number;
  records_without_coordinates: number;
  clusters_evaluated: number;
  current_window_records: number;
  previous_window_records: number;
  categories: Array<{ category: CaseCategory; count: number }>;
}

export interface PreventiveAnalysis {
  generated_at: string;
  window: PreventiveWindow;
  signals: PreventiveSignal[];
  inspection_flags: InspectionFlag[];
  statistics: PreventiveStatistics;
  limitations: string[];
  confidence_label: "preliminary";
  requires_human_review: true;
  analysis_version: string;
  /** Deterministic engine only; no model was used for the numbers. */
  model: null;
}

/** Structured explanation produced by the model for calculated signals. */
export interface PreventiveExplanation {
  signal_id: string;
  finding: string;
  recommended_action: string;
  limitations: string[];
}

export interface PreventiveExplanationResult {
  explanations: PreventiveExplanation[];
  overall_note: string;
  model: string | null;
  analyzed_at: string;
  analysis_version: string;
  fallback: boolean;
}

export interface AIDeps {
  client?: import("./client").AIClient;
  now?: () => Date;
}

/* -------------------------------------------------------------------------- */
/* Report-processing interface                                                */
/* -------------------------------------------------------------------------- */

/**
 * Version of the report-processing response envelope. Bump it only when the
 * shape returned by `processReport` changes incompatibly; `analysis_version`
 * tracks prompt/heuristic changes independently.
 */
export const REPORT_PROCESSING_API_VERSION = "v1" as const;

/** Conservative default budget for one report through the whole pipeline. */
export const REPORT_PROCESSING_TIMEOUT_MS = 25_000;

export interface ReportProcessingClassification {
  suggested_category: CaseCategory;
  /** How the category was obtained (explicit source label, alias, keywords…). */
  category_method: CategoryNormalizationMethod;
  category_note: string | null;
  title: string;
  summary: string;
  /** Advisory severity. Never presented as a verified fact. */
  severity: Severity;
  severity_rationale: string | null;
  /** Heuristic confidence in [0,1]; not a calibrated probability. */
  confidence: number;
  /** Short explanation of the suggestion, safe to show to a person. */
  explanation: string;
  needs_more_information: boolean;
  missing_information: string[];
  safety_concerns: string[];
  accessibility_considerations: string[];
}

/**
 * Responsible-area recommendation. Informational only: the AI never assigns a
 * department and never submits anything to SUAC.
 */
export interface ResponsibleAreaSuggestion {
  suggested_department: string | null;
  required_specialist_skill: string | null;
  advisory: true;
  assigned: false;
  note: string;
}

/** One candidate shared issue the new report could be linked to. */
export interface ReportProcessingSuggestion {
  /** Existing issue id, or the representative case id when no issue exists. */
  candidate_issue_id: string;
  candidate_case_ids: string[];
  relationship: DuplicateRelationship;
  confidence: number;
  explanation: string;
  evidence: string[];
  distance_meters: number | null;
  /** Always false: grouping is confirmed by a person, never automatically. */
  auto_merge: false;
}

export interface ProcessReportOptions extends AIDeps {
  /** Existing reports/issues to compare against. Reports sharing an `issue_id`
   * are grouped and compared as one unit. */
  candidates?: readonly IssueLinkCandidate[];
  /** Overall budget for classification + duplicate matching, in milliseconds. */
  timeout_ms?: number;
  max_candidate_groups?: number;
  min_composite?: number;
}

/**
 * One validated answer for "what is this report, and does it belong to a
 * problem we already know about?". It never merges or deletes reports and it
 * is always safe to store the report even when every AI provider call fails.
 */
export interface ReportProcessingResult {
  api_version: typeof REPORT_PROCESSING_API_VERSION;
  /** Session 1 identity for the report. Null only before the row is created. */
  case_id: string | null;
  source: ReportSource;
  /** Verbatim text as received, preserved for audit. Never model instructions. */
  original_text: string;
  /** Source dataset category, preserved verbatim for imported records. */
  original_category: string | null;
  classification: ReportProcessingClassification;
  /** Advisory, explainable priority. Votes alone never set urgency. */
  priority: PrioritySuggestion;
  responsible_area: ResponsibleAreaSuggestion;
  duplicate_suggestions: ReportProcessingSuggestion[];
  /** Distinct existing issues that could receive this report. */
  candidate_issue_ids: string[];
  /** Distinct existing reports that could join the same issue. */
  candidate_case_ids: string[];
  issue_link_summary: {
    evaluated_candidates: number;
    shortlisted_count: number;
    comparison_method: "model" | "deterministic";
  };
  auto_merge: false;
  requires_human_review: true;
  /** The report can always be submitted, even with no AI provider available. */
  submission_allowed: true;
  ai_available: boolean;
  fallback: boolean;
  /** Safe, machine-readable reasons when the result is degraded. */
  degraded_reasons: string[];
  model: string;
  analysis_version: string;
  analyzed_at: string;
}

/* -------------------------------------------------------------------------- */
/* Intake normalization                                                       */
/* -------------------------------------------------------------------------- */

export type CategoryNormalizationMethod =
  | "explicit"
  | "alias"
  | "keyword"
  | "model"
  | "fallback"
  | "none";

/**
 * Category suggestion kept separate from the source's own category.
 * Imported government records keep `original_category` untouched.
 */
export interface CategoryNormalization {
  normalized_category: CaseCategory | null;
  original_category: string | null;
  /** True when the source supplied a category that must not be replaced. */
  original_preserved: boolean;
  method: CategoryNormalizationMethod;
  confidence: number;
  note: string | null;
}

/** Output of the shared intake step for every report source. */
export interface NormalizedReportIntake {
  source: ReportSource;
  source_label: string | null;
  source_record_id: string | null;
  /** Verbatim text exactly as received. Never sent to the model unredacted. */
  original_text: string;
  /** Redacted + bounded text used in prompts. */
  normalized_text: string;
  title: string | null;
  category: CategoryNormalization;
  location: GeoInput | null;
  /** Colonia supplied by the source, even when coordinates are missing. */
  location_colonia: string | null;
  /** "exact" when coordinates exist, "colonia" when only a neighborhood is known. */
  location_precision: "exact" | "colonia" | "none";
  created_at: string | null;
  transcription: {
    detected: boolean;
    artifacts_removed: string[];
  };
  pii_redacted: boolean;
  truncated: boolean;
  injection_detected: boolean;
  missing_fields: string[];
}

/* -------------------------------------------------------------------------- */
/* Similarity signals and issue linking                                       */
/* -------------------------------------------------------------------------- */

export interface GeographicSignal {
  distance_meters: number | null;
  radius_meters: number;
  score: number;
  precision: "coordinates" | "colonia" | "none";
}

export interface SemanticSignal {
  score: number;
  shared_terms: string[];
  method: "lexical" | "model";
}

export interface CategorySignal {
  score: number;
  compatible: boolean;
  exact_match: boolean;
}

export interface TemporalSignal {
  score: number;
  gap_days: number | null;
  relationship: "same_day" | "within_week" | "recent" | "old" | "unknown";
}

export interface HistorySignal {
  score: number;
  prior_links: number;
  issue_id: string | null;
}

/** Explainable breakdown of why two reports may describe one issue. */
export interface SimilaritySignals {
  geographic: GeographicSignal;
  semantic: SemanticSignal;
  category: CategorySignal;
  temporal: TemporalSignal;
  history: HistorySignal;
  /** Weighted [0,1] prior computed in code before any model call. */
  composite: number;
}

export interface IssueLinkCandidate extends DuplicateCandidateInput {
  /** Existing community issue this report may belong to, when known. */
  issue_id?: string | null;
  source?: ReportSource | null;
  supporters?: number | null;
  prior_links?: number | null;
  resolved_at?: string | null;
}

/**
 * A suggestion only. `auto_merge` is always false: a human decides whether
 * reports are linked into one issue.
 */
export interface IssueLinkSuggestion {
  /** Existing issue id when supplied, otherwise the representative case id. */
  candidate_issue_id: string;
  candidate_case_ids: string[];
  relationship: DuplicateRelationship;
  confidence: number;
  explanation: string;
  evidence: string[];
  signals: SimilaritySignals;
}

export interface IssueLinkResult {
  analyzed_case_id: string | null;
  source: ReportSource;
  suggestions: IssueLinkSuggestion[];
  evaluated_candidates: number;
  shortlisted_count: number;
  comparison_method: "model" | "deterministic";
  auto_merge: false;
  requires_human_review: true;
  model: string;
  analysis_version: string;
  analyzed_at: string;
  fallback: boolean;
  notes: string[];
}

/* -------------------------------------------------------------------------- */
/* AI-assisted priority                                                       */
/* -------------------------------------------------------------------------- */

export type PriorityLevel = "low" | "medium" | "high" | "urgent";

export type PriorityFactorCode =
  | "safety_severity"
  | "independent_reports"
  | "unique_supporters"
  | "duration_unresolved"
  | "geographic_concentration"
  | "available_evidence"
  | "historical_context";

export interface PriorityFactor {
  code: PriorityFactorCode;
  label: string;
  /** Relative weight used by the deterministic score. */
  weight: number;
  /** Normalized factor value in [0,1]. */
  value: number;
  /** Points contributed to the final score (0-100 scale). */
  contribution: number;
  evidence: string;
}

export interface PriorityInput {
  severity?: Severity | null;
  /** Independent citizen reports linked to the same problem. */
  independent_reports?: number | null;
  /** Distinct people who reported or supported it. */
  unique_supporters?: number | null;
  /** When the problem was first reported. */
  reported_at?: string | null;
  /** When it was resolved, if ever. */
  resolved_at?: string | null;
  /** Reports in the same radius/cluster. */
  nearby_reports?: number | null;
  /** Count of evidence items (photos, observations, official records). */
  evidence_count?: number | null;
  /** Historical records or prior incidents supplied by the caller. */
  historical_matches?: number | null;
  /** Whether the report is an imported official record. */
  source?: ReportSource | null;
  now?: string | null;
}

export interface PrioritySuggestion {
  level: PriorityLevel;
  /** Heuristic attention score in [0,100]. Not a probability or SLA. */
  score: number;
  factors: PriorityFactor[];
  explanation: string;
  /** True when votes/supporters are the only material signal. */
  supporters_only: boolean;
  confidence_label: "heuristic";
  model_generated: boolean;
  /** Severity is a suggestion to review, never a verified fact. */
  is_verified: false;
  requires_human_review: true;
}

/* -------------------------------------------------------------------------- */
/* Resolution intelligence                                                    */
/* -------------------------------------------------------------------------- */

export type ResolutionSignalType =
  | "no_signal"
  | "persists_after_closure"
  | "disputed_closure"
  | "insufficient_data";

export interface ResolutionEvidenceInput {
  /** Stable id for the observation/evidence record. */
  id?: string | null;
  kind?: string | null;
  body?: string | null;
  created_at?: string | null;
  actor_type?: string | null;
}

export interface ResolutionInput {
  /** Official status from the shared contract (or an imported record). */
  official_status?: string | null;
  /** Timestamp of the official resolution/closure. */
  closed_at?: string | null;
  resolved_at?: string | null;
  /** Citizen observations and newer evidence. */
  evidence?: ResolutionEvidenceInput[];
  /** Reports from other citizens that appear to describe the same issue. */
  linked_report_ids?: string[];
  now?: string | null;
}

export interface ResolutionSignal {
  signal_type: ResolutionSignalType;
  official_status: string | null;
  official_closed_at: string | null;
  newer_evidence_count: number;
  newest_evidence_at: string | null;
  days_since_closure: number | null;
  /** True when newer evidence suggests the issue is still present. */
  possible_persistence: boolean;
  explanation: string;
  evidence_ids: string[];
  /** Heuristic confidence in the *signal*, not in any government claim. */
  confidence: "low" | "medium" | "high";
  /** The AI never asserts fraud or a final resolution. */
  declares_resolved: false;
  declares_fraud: false;
  requires_human_review: true;
}
