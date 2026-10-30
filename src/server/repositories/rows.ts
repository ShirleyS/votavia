import type {
  CaseCategory,
  CaseEventType,
  CaseStatus,
  ObservationKind,
  ActorType,
  CommunityVerificationStatus,
  EvidenceKind,
  IssueOperationalStatus,
  IssueOrigin,
  OrganizationKind,
  OrganizationRole,
  VerificationVerdict,
} from "@/shared/votavia-contract";

/** Persistence row shapes. These are internal: never returned to clients. */
export interface CaseRow {
  id: string;
  display_sequence: number;
  display_id: string;
  category: CaseCategory;
  status: CaseStatus;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  colonia: string;
  address_hint: string | null;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  created_by_user_id: string | null;
  reporter_email: string | null;
  is_demo: boolean;
  is_published: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  /** Shared issue this report belongs to (Phase 1/2 architecture update). */
  issue_id?: string | null;
  submission_channel?: string;
  submission_metadata?: Record<string, unknown> | null;
}

export interface PhotoRow {
  id: string;
  case_id: string;
  url: string;
  kind: "report" | "before" | "after";
  caption: string | null;
  created_at: string;
}

export interface SupportRow {
  id: string;
  case_id: string;
  participant_key: string;
  user_id: string | null;
  created_at: string;
}

export interface ObservationRow {
  id: string;
  case_id: string;
  kind: ObservationKind;
  body: string;
  author_type: ActorType;
  author_label: string;
  participant_key: string;
  user_id: string | null;
  is_published: boolean;
  created_at: string;
}

export interface EventRow {
  id: string;
  case_id: string;
  type: CaseEventType;
  actor_type: ActorType;
  title: string;
  description: string | null;
  is_public: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  issue_id?: string | null;
  actor_user_id?: string | null;
  organization_id?: string | null;
  visibility?: string;
}

export interface ClaimRow {
  id: string;
  case_id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  claimed_at: string | null;
  created_at: string;
}

export interface CaseAggregate {
  row: CaseRow;
  photos: PhotoRow[];
  support_count: number;
  observation_count: number;
  supported_by_me: boolean;
}


/* ------------------------------------------------------------------ */
/* Shared civic model rows                                            */
/* ------------------------------------------------------------------ */

export interface IssueRow {
  id: string;
  display_sequence: number;
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
  created_by_user_id: string | null;
  is_public: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfficialRecordRow {
  id: string;
  source_system: string;
  source_record_id: string;
  dedupe_key?: string | null;
  source_dataset?: string | null;
  external_folio: string | null;
  source_url: string | null;
  original_category: string | null;
  original_status: string | null;
  status_normalized?: string | null;
  title: string | null;
  description: string | null;
  reported_at: string | null;
  source_closed_at?: string | null;
  alcaldia?: string | null;
  responsible_agency?: string | null;
  collector_schema_version?: string | null;
  extraction_method?: string | null;
  data_quality_flags?: string[];
  latitude: number | null;
  longitude: number | null;
  colonia: string | null;
  address_hint: string | null;
  raw_payload: unknown;
  provenance: Record<string, unknown>;
  license?: string | null;
  license_url?: string | null;
  attribution?: string | null;
  license_verified_from?: string | null;
  redistribution?: "allowed" | "restricted" | "unknown";
  redistribution_note?: string | null;
  content_hash?: string | null;
  sync_run_id?: string | null;
  source_created_at?: string | null;
  source_fetched_at?: string | null;
  first_seen_at?: string;
  last_synced_at?: string;
  is_active?: boolean;
  upstream_removed_at?: string | null;
  imported_at: string;
  source_updated_at: string | null;
  updated_at: string;
}

export interface OfficialStatusHistoryRow {
  id: string;
  official_record_id: string;
  status_text: string;
  status_normalized: string | null;
  changed_at: string | null;
  observed_at: string;
  source_updated_at: string | null;
  sync_run_id: string | null;
  is_current: boolean;
}

export interface IssueOfficialRecordRow {
  issue_id: string;
  official_record_id: string;
  linked_at: string;
  linked_by_user_id: string | null;
}

export interface EvidenceRow {
  id: string;
  issue_id: string | null;
  case_id: string | null;
  kind: EvidenceKind;
  url: string;
  caption: string | null;
  uploaded_by_user_id: string | null;
  uploader_role: ActorType;
  organization_id: string | null;
  is_public: boolean;
  created_at: string;
}

export interface IssueSupportRow {
  id: string;
  issue_id: string;
  user_id: string | null;
  participant_key: string;
  created_at: string;
  removed_at: string | null;
}

export interface VerificationRow {
  id: string;
  issue_id: string;
  user_id: string;
  verdict: VerificationVerdict;
  note: string | null;
  created_at: string;
  superseded_at: string | null;
}

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  kind: OrganizationKind;
  areas: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  scope: string[];
  verified_at: string | null;
  verified_by: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface IssueAggregate {
  row: IssueRow;
  support_count: number;
  supported_by_me: boolean;
  report_count: number;
  official_record_count: number;
  verification_counts: Record<VerificationVerdict, number>;
  my_verdict: VerificationVerdict | null;
}


/** Persisted advisory analysis for one citizen report. */
export interface CaseAnalysisRow {
  case_id: string;
  issue_id: string | null;
  analysis_version: string;
  model: string;
  summary: string;
  suggested_category: CaseCategory | null;
  severity: "low" | "medium" | "high" | "critical" | null;
  confidence: number | null;
  priority: Record<string, unknown> | null;
  duplicate_candidates: Array<{ case_id: string; score: number; reason: string }>;
  report_source: string | null;
  is_fallback: boolean;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
