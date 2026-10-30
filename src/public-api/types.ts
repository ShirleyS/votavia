import type {
  ActorType,
  CaseCategory,
  CaseEventType,
  CaseStatus,
  ObservationKind,
} from "@/shared/votavia-contract";
import type {
  CommunityVerificationStatus,
  ExternalGovernmentStatus,
  RecordOrigin,
} from "./contract-extensions";
import type { PublicProvenance } from "./provenance";

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
  /**
   * Canonical operational status (Session 1 `Case.status`).
   * Mirrored as `status` for older consumers; prefer this field.
   */
  votavia_operational_status: CaseStatus;
  /** @deprecated Use `votavia_operational_status`. Same canonical value. */
  status: CaseStatus;
  /** Status reported by an external authority. Null when unknown. */
  external_government_status: ExternalGovernmentStatus | null;
  /** Independent community verification outcome. Never derived from either status above. */
  community_verification_status: CommunityVerificationStatus;
  community_verification: {
    status: CommunityVerificationStatus;
    summary: string | null;
    verified_at: string | null;
  };
  /** Who produced the record, and whether VotaVía or an authority published it. */
  record_origin: RecordOrigin;
  /** Present only for imported records that passed the licensing gate. */
  provenance: PublicProvenance | null;
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
  votavia_operational_status: CaseStatus;
  /** @deprecated Use `votavia_operational_status`. */
  status: CaseStatus;
  external_government_status: ExternalGovernmentStatus | null;
  community_verification_status: CommunityVerificationStatus;
  record_origin: RecordOrigin;
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

export interface PublicOriginCount {
  record_origin: RecordOrigin;
  count: number;
}

export interface PublicVerificationCount {
  community_verification_status: CommunityVerificationStatus;
  count: number;
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
  by_origin: PublicOriginCount[];
  by_community_verification: PublicVerificationCount[];
  official_records_included: number;
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

export interface PublicCategory {
  category: CaseCategory;
  label: string;
  description: string;
  count: number;
  resolved: number;
  record_origins: RecordOrigin[];
}

export interface PublicCategoryCatalog {
  categories: PublicCategory[];
  total_published: number;
  generated_at: string;
}

export interface OfficialFeedMeta {
  enabled: boolean;
  reason: string;
  note: string;
  /** Dataset-level licensing statement; null when no feed is enabled. */
  license: string | null;
  attribution: string | null;
  last_synced_at: string | null;
}

export interface PublicHealthCheck {
  status: "ok" | "disabled" | "degraded" | "unknown";
  detail: string;
}

export interface PublicHealth {
  status: "ok" | "degraded";
  api_version: typeof PUBLIC_API_VERSION;
  dataset: "demo" | "live";
  checks: {
    data_source: PublicHealthCheck;
    official_municipal_feed: PublicHealthCheck;
    preventive_signals: PublicHealthCheck;
    rate_limiting: PublicHealthCheck;
  };
  generated_at: string;
}

export const GEOJSON_SPATIAL_PRECISION = ["block", "coarse"] as const;
export type GeoJsonSpatialPrecision = (typeof GEOJSON_SPATIAL_PRECISION)[number];

export interface PublicGeoJsonProperties {
  case_id: string;
  display_id: string;
  category: CaseCategory;
  votavia_operational_status: CaseStatus;
  external_government_status_label: string | null;
  external_government_status_kind: string | null;
  community_verification_status: CommunityVerificationStatus;
  record_origin: RecordOrigin;
  title: string;
  colonia: string;
  alcaldia: string;
  support_count: number;
  created_at: string;
  updated_at: string;
  permalink: string;
  spatial_precision: GeoJsonSpatialPrecision;
  coordinate_precision_meters: number;
  source_name: string | null;
  official_folio: string | null;
  source_url: string | null;
  license_id: string | null;
  freshness: string | null;
}

export interface PublicGeoJsonFeature {
  type: "Feature";
  /** Stable feature identity: the canonical case_id. */
  id: string;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | null;
  properties: PublicGeoJsonProperties;
}

export interface PublicGeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: PublicGeoJsonFeature[];
  meta: ResponseMeta;
  provenance: {
    attribution: string;
    generated_at: string;
    license: string;
    limitations: string[];
  };
}

export interface OfficialReportsMeta extends ResponseMeta {
  official_feed: OfficialFeedMeta;
}

export interface OfficialReportsEnvelope {
  data: PublicCase[];
  meta: OfficialReportsMeta;
}
