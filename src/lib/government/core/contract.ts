/**
 * Espejo tipado del contrato compartido de Session 1.
 *
 * Origen: `votavia/src/shared/votavia-contract.ts` (main @ d9b2bfd).
 * Este archivo NO define un contrato nuevo: sólo copia la parte que consume la
 * consola de gobierno para no importar código entre worktrees.
 *
 * Si Session 1 cambia el contrato, este espejo debe actualizarse en el mismo
 * commit. Cualquier diferencia es un defecto de integración, no una variante.
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

export const ISSUE_OPERATIONAL_STATUSES = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type IssueOperationalStatus = (typeof ISSUE_OPERATIONAL_STATUSES)[number];

export const COMMUNITY_VERIFICATION_STATUSES = [
  "unreviewed",
  "confirmed",
  "disputed",
  "verified_resolved",
] as const;
export type CommunityVerificationStatus = (typeof COMMUNITY_VERIFICATION_STATUSES)[number];

export const ISSUE_ORIGINS = ["citizen", "official", "mixed"] as const;
export type IssueOrigin = (typeof ISSUE_ORIGINS)[number];

export const EVIDENCE_KINDS = [
  "citizen_followup",
  "government_intervention",
  "resolution_proof",
  "official_record",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ORGANIZATION_ROLES = ["responder", "supervisor", "admin"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

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

export interface Location {
  latitude: number;
  longitude: number;
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

/** Reporte ciudadano tal como lo devuelve `/api/issues/[id]` dentro de `reports`. */
export interface Case {
  case_id: string;
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
  observation_count: number;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface VerificationSummary {
  confirmed: number;
  disputed: number;
  verified_resolved: number;
  total: number;
  my_verdict: string | null;
}

export interface Issue {
  issue_id: string;
  display_id: string;
  title: string;
  description: string;
  category: CaseCategory;
  origin: IssueOrigin;
  operational_status: IssueOperationalStatus;
  external_status: string | null;
  community_verification_status: CommunityVerificationStatus;
  latitude: number;
  longitude: number;
  colonia: string;
  organization_id: string | null;
  is_public: boolean;
  support_count: number;
  report_count: number;
  official_record_count: number;
  verification: VerificationSummary;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface OfficialRecord {
  official_record_id: string;
  source_system: string;
  source_record_id: string;
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
  colonia: string | null;
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
  redistribution: "allowed" | "restricted" | "unknown";
  redistribution_note: string | null;
}

export interface EvidenceItem {
  evidence_id: string;
  issue_id: string;
  case_id: string | null;
  kind: EvidenceKind;
  url: string;
  caption: string | null;
  uploader_role: string;
  organization_id: string | null;
  is_public: boolean;
  created_at: string;
}

export interface IssueDetail extends Issue {
  reports: Case[];
  official_records: OfficialRecord[];
  evidence: EvidenceItem[];
}

export interface OrganizationMembership {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  scope: string[];
  verified_at: string | null;
}

export interface PaginatedIssues {
  items: Issue[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

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

/** Implementado por el módulo de despacho de Ismael. VotaVía sólo lo consume. */
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

export interface DispatchGateway {
  requestDispatch(input: DispatchRequest): Promise<DispatchRequest>;
  getAssignments(caseId: string): Promise<DispatchAssignment[]>;
}
