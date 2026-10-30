/**
 * VotaVía — shared integration contract.
 *
 * Single source of truth shared by the citizen experience, the government
 * workspace (Phase 3) and the dispatch module (owned by the specialist team).
 * Framework-agnostic on purpose: no React, no database client, no Node APIs.
 *
 * Rules:
 * - `case_id` (UUID) is the only identity for a case. Never invent a second
 *   identifier for dispatch: pass `case_id` through and let `display_id` ride
 *   along for humans.
 * - These types describe the integration surface, not database tables.
 * - Anything marked private must never be returned by a public API.
 */

export const CASE_CATEGORIES = [
  "road_damage",
  "street_lighting",
  "traffic_signals",
  "sidewalk_accessibility",
  "trees_vegetation",
  "waste_sanitation",
  "parks_public_spaces",
  "other",
] as const;

export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CASE_STATUSES = [
  "reported",
  "under_review",
  "assigned",
  "in_progress",
  "pending_verification",
  "resolved",
  "closed",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const ASSIGNMENT_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "in_progress",
  "submitted_for_review",
  "verified",
  "returned",
  "cancelled",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const USER_ROLES = ["citizen", "government", "specialist", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Shared civic model (Phase 1/2 architecture update, additive).
 *
 * `cases` remains the citizen report table: `report_id === case_id`.
 * A report belongs to at most one shared `issue`; an issue groups one or more
 * reports and may link to many `official_records`.
 */

export const ISSUE_OPERATIONAL_STATUSES = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type IssueOperationalStatus = (typeof ISSUE_OPERATIONAL_STATUSES)[number];

/** Independent community verification, separate from operational progress. */
export const COMMUNITY_VERIFICATION_STATUSES = [
  "unreviewed",
  "confirmed",
  "disputed",
  "verified_resolved",
] as const;

export type CommunityVerificationStatus = (typeof COMMUNITY_VERIFICATION_STATUSES)[number];

export const VERIFICATION_VERDICTS = ["confirmed", "disputed", "verified_resolved"] as const;
export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number];

/** `citizen` = reported here, `official` = imported source record only, `mixed` = both. */
export const ISSUE_ORIGINS = ["citizen", "official", "mixed"] as const;
export type IssueOrigin = (typeof ISSUE_ORIGINS)[number];

/** Whether imported source data may be redistributed publicly. */
export const REDISTRIBUTION_ELIGIBILITIES = ["allowed", "restricted", "unknown"] as const;
export type RedistributionEligibility = (typeof REDISTRIBUTION_ELIGIBILITIES)[number];

export const EVIDENCE_KINDS = [
  "citizen_followup",
  "government_intervention",
  "resolution_proof",
  "official_record",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ORGANIZATION_KINDS = ["alcaldia", "municipality", "agency", "civic"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export const ORGANIZATION_ROLES = ["responder", "supervisor", "admin"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/**
 * Extensible submission channels. Only `web` is implemented in Phase 2;
 * messaging/voice arrive with external integrations.
 */
export const SUBMISSION_CHANNELS = ["web", "messaging", "voice", "import", "api"] as const;
export type SubmissionChannel = (typeof SUBMISSION_CHANNELS)[number];

export const CASE_EVENT_TYPES = [
  "reported",
  "under_review",
  "assigned",
  "in_progress",
  "pending_verification",
  "resolved",
  "closed",
  "community_support",
  "observation",
  "government_update",
  "evidence_added",
  "dispatch_update",
  "community_verification",
  "official_record_linked",
  "support_removed",
  "evidence_uploaded",
  "report_updated",
  "report_withdrawn",
] as const;

export type CaseEventType = (typeof CASE_EVENT_TYPES)[number];

export const OBSERVATION_KINDS = [
  "comment",
  "still_happening",
  "safety_concern",
  "accessibility_concern",
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/** Who produced an event or observation, in public-facing terms. */
export type ActorType = "citizen" | "community" | "government" | "specialist" | "system";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Location extends GeoPoint {
  colonia: string;
  address_hint?: string | null;
  alcaldia: string;
}

export interface CasePhotograph {
  photo_id: string;
  case_id: string;
  url: string;
  kind: "report" | "before" | "after";
  caption?: string | null;
  created_at: string;
}

export interface CommunitySupport {
  case_id: string;
  support_count: number;
  supported_by_me: boolean;
}

export interface Case {
  case_id: string;
  /** Human readable reference, e.g. VOT-0042. Not an identity. */
  display_id: string;
  category: CaseCategory;
  status: CaseStatus;
  title: string;
  description: string;
  location: Location;
  colonia: string;
  latitude: number;
  longitude: number;
  photos: CasePhotograph[];
  support_count: number;
  supported_by_me: boolean;
  observation_count: number;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  /** True when the record is demonstration data rather than a real report. */
  is_demo: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  is_mine?: boolean;
  /** Shared civic model (optional so existing consumers keep compiling). */
  issue_id?: string | null;
  issue_display_id?: string | null;
  origin?: IssueOrigin;
  operational_status?: IssueOperationalStatus | null;
  external_status?: string | null;
  community_verification_status?: CommunityVerificationStatus | null;
  official_record_count?: number;
}

export interface ReportObservation {
  observation_id: string;
  case_id: string;
  kind: ObservationKind;
  body: string;
  actor_type: ActorType;
  author_label: string;
  created_at: string;
}

export interface CaseTimelineEvent {
  event_id: string;
  case_id: string;
  type: CaseEventType;
  actor_type: ActorType;
  title: string;
  description?: string | null;
  created_at: string;
  is_public: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface RelatedReport {
  case_id: string;
  display_id: string;
  title: string;
  category: CaseCategory;
  status: CaseStatus;
  support_count: number;
  distance_meters: number;
  /** Optional so older consumers of the contract keep compiling. */
  latitude?: number;
  longitude?: number;
  created_at: string;
}

/** Private ownership fields. Never returned by public endpoints. */
export interface CaseOwnership {
  created_by_user_id: string | null;
  reporter_email: string | null;
}

export interface CitizenProfile {
  user_id: string;
  email: string;
  role: UserRole;
  display_name?: string | null;
  created_at: string;
}

export interface AIAnalysisResult {
  case_id: string;
  model: string;
  summary: string;
  suggested_category: CaseCategory | null;
  severity: "low" | "medium" | "high" | "critical" | null;
  duplicate_candidates: Array<{ case_id: string; score: number; reason: string }>;
  confidence: number;
  created_at: string;
}

export interface DispatchRequest {
  dispatch_request_id: string;
  case_id: string;
  display_id: string;
  category: CaseCategory;
  priority: "low" | "medium" | "high" | "urgent";
  location: Location;
  requested_by: string;
  requested_at: string;
  notes?: string | null;
}

export interface DispatchAssignment {
  assignment_id: string;
  dispatch_request_id: string;
  case_id: string;
  specialist_id: string;
  specialist_display_name: string;
  status: AssignmentStatus;
  scheduled_for?: string | null;
  estimated_cost_mxn?: number | null;
  updated_at: string;
}

/** Implemented by the dispatch module. VotaVía only consumes it. */
export interface DispatchGateway {
  requestDispatch(
    input: Omit<DispatchRequest, "dispatch_request_id" | "requested_at">,
  ): Promise<DispatchRequest>;
  getAssignments(caseId: string): Promise<DispatchAssignment[]>;
}

export interface CaseFilters {
  categories?: CaseCategory[];
  statuses?: CaseStatus[];
  colonia?: string;
  query?: string;
  ownerId?: string;
  supportedBy?: string;
  page?: number;
  pageSize?: number;
  sort?: "recent" | "supported";
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CreateCaseInput {
  category: CaseCategory;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  colonia: string;
  address_hint?: string | null;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  reporter_email?: string | null;
  created_by_user_id?: string | null;
  photo_urls?: string[];
  /** Extensible intake metadata (web today; messaging/voice later). */
  submission_channel?: SubmissionChannel;
  submission_metadata?: Record<string, unknown> | null;
}

export interface CreateObservationInput {
  kind: ObservationKind;
  body: string;
  participant: ParticipantContext;
}

/**
 * Identity of whoever is acting. `participant_key` is a stable, non-secret
 * anonymous identifier (cookie-backed) used only to prevent support inflation.
 */
export interface ParticipantContext {
  participant_key: string;
  user_id: string | null;
  role: UserRole | "anonymous";
}

export interface Organization {
  organization_id: string;
  slug: string;
  name: string;
  kind: OrganizationKind;
  areas: string[];
  is_active: boolean;
}

export interface OrganizationMembership {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  scope: string[];
  verified_at: string | null;
}

/**
 * Imported government source data. Never a citizen submission.
 *
 * Ingestion identity is `(source_system, source_record_id)`; `external_folio`
 * is the human folio and may be missing or repeated.
 */
export interface OfficialRecord {
  official_record_id: string;
  source_system: string;
  /** Stable source id, or the collector dedupe key when the source has none. */
  source_record_id: string;
  dedupe_key: string | null;
  source_dataset: string | null;
  external_folio: string | null;
  source_url: string | null;
  original_category: string | null;
  original_status: string | null;
  status_normalized: string | null;
  title: string | null;
  description: string | null;
  reported_at: string | null;
  source_closed_at: string | null;
  responsible_agency: string | null;
  alcaldia: string | null;
  collector_schema_version: string | null;
  extraction_method: string | null;
  data_quality_flags: string[];
  latitude: number | null;
  longitude: number | null;
  colonia: string | null;
  address_hint: string | null;
  imported_at: string;
  source_created_at: string | null;
  source_updated_at: string | null;
  source_fetched_at: string | null;
  first_seen_at: string;
  last_synced_at: string;
  is_active: boolean;
  license: string | null;
  license_url: string | null;
  attribution: string | null;
  license_verified_from: string | null;
  redistribution: RedistributionEligibility;
  redistribution_note: string | null;
  provenance: Record<string, unknown>;
}

/** Append-only history of the *source* status for an official record. */
export interface OfficialRecordStatusHistoryEntry {
  history_id: string;
  official_record_id: string;
  status_text: string;
  status_normalized: string | null;
  changed_at: string | null;
  observed_at: string;
  source_updated_at: string | null;
  sync_run_id: string | null;
  is_current: boolean;
}

/** One normalized record as produced by the Session 6 collector. */
export interface OfficialRecordIngestInput {
  source_system: string;
  /** Source id, or `dedupe_key` when the source has no stable id. */
  source_record_id: string;
  dedupe_key?: string | null;
  source_dataset?: string | null;
  external_folio?: string | null;
  source_url?: string | null;
  original_category?: string | null;
  original_status?: string | null;
  status_normalized?: string | null;
  title?: string | null;
  description?: string | null;
  reported_at?: string | null;
  source_closed_at?: string | null;
  alcaldia?: string | null;
  responsible_agency?: string | null;
  collector_schema_version?: string | null;
  extraction_method?: string | null;
  data_quality_flags?: string[];
  latitude?: number | null;
  longitude?: number | null;
  colonia?: string | null;
  address_hint?: string | null;
  source_created_at?: string | null;
  source_updated_at?: string | null;
  source_fetched_at?: string | null;
  is_active?: boolean;
  content_hash?: string | null;
  sync_run_id?: string | null;
  license?: string | null;
  license_url?: string | null;
  attribution?: string | null;
  license_verified_from?: string | null;
  redistribution?: RedistributionEligibility;
  redistribution_note?: string | null;
  provenance?: Record<string, unknown>;
}

export interface OfficialRecordIngestResult {
  official_record_id: string;
  created: boolean;
}

export interface CommunityVerificationSummary {
  confirmed: number;
  disputed: number;
  verified_resolved: number;
  total: number;
  /** The current participant's active verdict, if any. */
  my_verdict: VerificationVerdict | null;
}

/** A shared issue groups reports and official records. */
export interface Issue {
  issue_id: string;
  display_id: string;
  title: string;
  description: string | null;
  category: CaseCategory;
  origin: IssueOrigin;
  operational_status: IssueOperationalStatus;
  external_status: string | null;
  community_verification_status: CommunityVerificationStatus;
  latitude: number | null;
  longitude: number | null;
  colonia: string | null;
  organization_id: string | null;
  is_public: boolean;
  support_count: number;
  supported_by_me: boolean;
  report_count: number;
  official_record_count: number;
  verification: CommunityVerificationSummary;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface IssueDetail extends Issue {
  reports: Case[];
  official_records: OfficialRecord[];
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  evidence_id: string;
  issue_id: string | null;
  case_id: string | null;
  kind: EvidenceKind;
  url: string;
  caption: string | null;
  uploader_role: ActorType;
  organization_id: string | null;
  is_public: boolean;
  created_at: string;
}

export interface IssueSupportResult {
  issue_id: string;
  support_count: number;
  supported_by_me: boolean;
}

export interface RecordVerificationInput {
  verdict: VerificationVerdict;
  note?: string | null;
  participant: ParticipantContext;
}

export interface CivicPlatformService extends CitizenCaseService {
  listIssues(filters?: IssueFilters): Promise<Paginated<Issue>>;
  getIssue(id: string, participant?: ParticipantContext): Promise<IssueDetail | null>;
  supportIssue(issueId: string, participant: ParticipantContext): Promise<IssueSupportResult>;
  removeIssueSupport(issueId: string, participant: ParticipantContext): Promise<IssueSupportResult>;
  recordVerification(issueId: string, input: RecordVerificationInput): Promise<CommunityVerificationSummary>;
  listEvidence(issueId: string): Promise<EvidenceItem[]>;
  getOfficialRecordStatusHistory(
    officialRecordId: string,
  ): Promise<OfficialRecordStatusHistoryEntry[]>;
  addEvidence(input: AddEvidenceInput): Promise<EvidenceItem>;
  /** Reporter-owned edit; throws 403 for anyone else (admins excepted). */
  updateCase(caseId: string, input: UpdateCaseInput): Promise<Case>;
  /** Reporter withdraws their own report; keeps the record and audit trail. */
  withdrawCase(caseId: string, participant: ParticipantContext): Promise<Case>;
  /** Runs the advisory AI pass and stores it. Never throws. */
  analyzeCase(caseId: string, participant?: ParticipantContext): Promise<CaseAnalysis | null>;
  /** Stored advisory analysis, if any. */
  getCaseAnalysis(caseId: string): Promise<CaseAnalysis | null>;
  /** Draft-time suggestions for the reporting wizard. Never throws. */
  analyzeDraft(request: DraftAnalysisRequest): Promise<DraftAnalysisResponse | null>;
  recordOperationalUpdate(
    issueId: string,
    input: OperationalUpdateInput,
  ): Promise<IssueDetail>;
}

/** Reporter-owned edits, allowed only while the case is still early in review. */
export interface UpdateCaseInput {
  title?: string;
  description?: string;
  category?: CaseCategory;
  address_hint?: string | null;
  participant: ParticipantContext;
}

export interface CaseAnalysisExtras {
  priority: unknown;
  severity_rationale: string | null;
  needs_more_information: boolean;
  missing_information: string[];
  uncertainty_notes: string | null;
  suggested_title: string;
  safety_concerns: string[];
  accessibility_considerations: string[];
  suggested_department: string | null;
  category_normalization: unknown;
  report_source: string;
  is_fallback: boolean;
}

/** Advisory AI output for one report. Never a status change or verification. */
export interface CaseAnalysis {
  analysis: AIAnalysisResult;
  extras: CaseAnalysisExtras;
}

export interface DraftAnalysisRequest {
  description: string;
  title?: string | null;
  category?: CaseCategory | null;
  latitude: number;
  longitude: number;
  colonia?: string | null;
}

export interface DraftDuplicateCandidate {
  case_id: string;
  display_id: string;
  title: string;
  category: CaseCategory;
  status: CaseStatus;
  distance_meters: number;
  score: number;
  reason: string;
  relationship: string;
}

export interface DraftAnalysisResponse {
  suggested_category: CaseCategory;
  suggested_title: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  needs_more_information: boolean;
  missing_information: string[];
  is_fallback: boolean;
  duplicates: DraftDuplicateCandidate[];
}

export interface OperationalUpdateInput {
  operationalStatus: IssueOperationalStatus;
  organizationId: string;
  note?: string | null;
  /** Optional raw status discovered in an external system. Never implied. */
  externalStatus?: string | null;
  participant: ParticipantContext;
}

export interface IssueFilters {
  categories?: CaseCategory[];
  operationalStatuses?: IssueOperationalStatus[];
  verificationStatuses?: CommunityVerificationStatus[];
  origins?: IssueOrigin[];
  colonia?: string;
  query?: string;
  page?: number;
  pageSize?: number;
  sort?: "recent" | "supported";
}

export interface AddEvidenceInput {
  issueId: string;
  caseId?: string | null;
  kind: EvidenceKind;
  url: string;
  caption?: string | null;
  participant: ParticipantContext;
  organizationId?: string | null;
}

export interface CitizenCaseService {
  listCases(filters?: CaseFilters): Promise<Paginated<Case>>;
  getCase(id: string, participant?: ParticipantContext): Promise<Case | null>;
  createCase(input: CreateCaseInput, participant: ParticipantContext): Promise<Case>;
  supportCase(id: string, participant: ParticipantContext): Promise<CommunitySupport>;
  addObservation(id: string, input: CreateObservationInput): Promise<ReportObservation>;
  getCaseTimeline(id: string): Promise<CaseTimelineEvent[]>;
  getCaseObservations(id: string): Promise<ReportObservation[]>;
  findNearbyCases(input: NearbyCaseQuery): Promise<RelatedReport[]>;
  getPublicStats(): Promise<PublicStats>;
}

export interface NearbyCaseQuery {
  latitude: number;
  longitude: number;
  category?: CaseCategory;
  radiusMeters?: number;
  limit?: number;
}

export interface PublicStats {
  total_cases: number;
  resolved_cases: number;
  total_supports: number;
  total_observations: number;
  is_demo: boolean;
  by_category: Array<{ category: CaseCategory; count: number; resolved: number }>;
  by_status: Array<{ status: CaseStatus; count: number }>;
  by_colonia: Array<{ colonia: string; count: number; resolved: number; supports: number }>;
  recent_resolved: Case[];
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export const ALCALDIA = "Cuauhtémoc" as const;
