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
