import type {
  ActorType,
  CaseCategory,
  CaseEventType,
  CaseStatus,
  ObservationKind,
} from "@/shared/votavia-contract";

export const PUBLIC_API_VERSION = "v1" as const;

/**
 * Fields the public API is allowed to publish. This module deliberately
 * re-declares the response shape instead of re-exporting `Case`: public output
 * is an allowlisted projection, never the internal record.
 */
export interface PublicPhoto {
  photo_id: string;
  url: string;
  kind: "report" | "before" | "after";
  caption: string | null;
  created_at: string;
}

/** Coordinates are intentionally coarsened before publication. */
export interface PublicLocation {
  colonia: string;
  alcaldia: string;
  latitude: number;
  longitude: number;
  precision_meters: number;
}

export interface PublicCase {
  case_id: string;
  display_id: string;
  category: CaseCategory;
  status: CaseStatus;
  title: string;
  description: string;
  location: PublicLocation;
  photos: PublicPhoto[];
  support_count: number;
  observation_count: number;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  permalink: string;
}

export interface PublicCaseSummary {
  case_id: string;
  display_id: string;
  category: CaseCategory;
  status: CaseStatus;
  title: string;
  colonia: string;
  support_count: number;
  resolved_at: string | null;
  created_at: string;
  permalink: string;
}

export interface PublicTimelineEvent {
  event_id: string;
  type: CaseEventType;
  actor_type: ActorType;
  title: string;
  description: string | null;
  created_at: string;
}

export interface PublicObservation {
  observation_id: string;
  kind: ObservationKind;
  body: string;
  actor_type: ActorType;
  created_at: string;
}

export interface PublicCaseDetail extends PublicCase {
  timeline: PublicTimelineEvent[];
  observations: PublicObservation[];
}

export interface PublicCategoryCount {
  category: CaseCategory;
  count: number;
  resolved: number;
}

export interface PublicStatusCount {
  status: CaseStatus;
  count: number;
}

export interface PublicColoniaCount {
  colonia: string;
  count: number;
  resolved: number;
  supports: number;
}

export interface PublicStatistics {
  total_cases: number;
  resolved_cases: number;
  /** 0–100, rounded to one decimal. Descriptive of the dataset, not a goal. */
  resolution_rate: number;
  total_supports: number;
  total_observations: number;
  is_demo: boolean;
  by_category: PublicCategoryCount[];
  by_status: PublicStatusCount[];
  by_colonia: PublicColoniaCount[];
  recent_resolved: PublicCaseSummary[];
  generated_at: string;
}

export const RISK_SIGNAL_TYPES = [
  "repeated_reports",
  "emerging_concentration",
  "recurring_problem",
  "high_severity_reports",
] as const;

export type RiskSignalType = (typeof RISK_SIGNAL_TYPES)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Approved output of the preventive engine (Session 3). VotaVía never
 * calculates this: the public API only republishes signals that a human
 * reviewer approved for publication.
 */
export interface PublicRiskSignal {
  signal_id: string;
  signal_type: RiskSignalType;
  area_label: string;
  colonia: string | null;
  category: CaseCategory;
  risk_level: RiskLevel | null;
  /** Heuristic attention index in [0,100]; never a probability. */
  attention_index: number;
  finding: string;
  recommended_action: string | null;
  spatial_precision: "coordinates" | "colonia";
  centroid: { latitude: number; longitude: number } | null;
  radius_meters: number | null;
  window_days: number | null;
  current_window_count: number;
  previous_window_count: number | null;
  change_ratio: number | null;
  valid_from: string;
  valid_until: string | null;
  generated_at: string;
  approved_at: string;
  approved_by_role: string;
  analysis_version: string;
  limitations: string[];
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

export interface BaseMeta {
  request_id: string;
  api_version: typeof PUBLIC_API_VERSION;
  generated_at: string;
  /** `demo` when serving illustrative data; `live` when reading the platform. */
  dataset: "demo" | "live";
  count?: number;
}

export interface ResponseMeta extends BaseMeta, Partial<PaginationMeta> {}

export interface ListEnvelope<T> {
  data: T[];
  meta: ResponseMeta;
}

export interface ItemEnvelope<T> {
  data: T;
  meta: ResponseMeta;
}

export interface PublicApiErrorBody {
  error: {
    code: PublicErrorCode;
    message: string;
    details?: unknown;
    request_id: string;
  };
}

export type PublicErrorCode =
  | "invalid_request"
  | "invalid_case_id"
  | "not_found"
  | "rate_limited"
  | "risk_signals_unavailable"
  | "upstream_unavailable"
  | "internal_error";
