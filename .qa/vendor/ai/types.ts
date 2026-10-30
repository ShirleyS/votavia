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
  /** Model/code heuristic in [0,1]; not a calibrated probability. */
  confidence: number;
  /** Verbatim citizen text (bounded for safety). Always preserved. */
  original_description: string;
  input_truncated: boolean;
  model: string;
  analysis_version: string;
  analyzed_at: string;
  fallback: boolean;
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
