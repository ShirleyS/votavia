import type {
  CaseFilters,
  CaseOwnership,
  CreateCaseInput,
  ParticipantContext,
} from "@/shared/votavia-contract";
import type {
  CaseAggregate,
  CaseAnalysisRow,
  CaseRow,
  ClaimRow,
  EventRow,
  EvidenceRow,
  IssueAggregate,
  IssueRow,
  ObservationRow,
  OfficialRecordRow,
  OfficialStatusHistoryRow,
  OrganizationMemberRow,
  VerificationRow,
} from "./rows";
import type { IssueFilters, VerificationVerdict } from "@/shared/votavia-contract";

export interface SupportResult {
  support_count: number;
  added: boolean;
}

/**
 * Persistence boundary. The service layer never talks to Supabase or the file
 * system directly, so components and APIs behave identically with either
 * backend.
 */
export interface CaseRepository {
  readonly kind: "demo" | "supabase";
  list(filters: CaseFilters, participantKey?: string): Promise<{ aggregates: CaseAggregate[]; total: number }>;
  getById(id: string, participantKey?: string): Promise<CaseAggregate | null>;
  create(input: CreateCaseInput, participant: ParticipantContext): Promise<CaseAggregate>;
  support(caseId: string, participant: ParticipantContext): Promise<SupportResult>;
  supportedCaseIds(participantKey: string): Promise<Set<string>>;
  addObservation(input: {
    caseId: string;
    kind: ObservationRow["kind"];
    body: string;
    participant: ParticipantContext;
    authorLabel: string;
  }): Promise<ObservationRow>;
  observations(caseId: string): Promise<ObservationRow[]>;
  events(caseId: string): Promise<EventRow[]>;
  allAggregates(): Promise<CaseAggregate[]>;
  createClaim(input: { caseId: string; email: string; tokenHash: string; expiresAt: string }): Promise<void>;
  claimByTokenHash(tokenHash: string): Promise<ClaimRow | null>;
  pendingClaimForEmail(email: string): Promise<ClaimRow | null>;
  markClaimUsed(claimId: string): Promise<void>;
  linkOwnership(caseId: string, userId: string): Promise<void>;
  setReporterEmail(caseId: string, email: string): Promise<void>;
  /** Private ownership fields used only to authorize claims. */
  ownership(caseId: string): Promise<CaseOwnership | null>;
  /** Owner-managed edits (title, description, category, address hint). */
  updateCase(
    caseId: string,
    patch: {
      title?: string;
      description?: string;
      category?: CaseRow["category"];
      address_hint?: string | null;
    },
  ): Promise<CaseAggregate | null>;
  setStatus(caseId: string, status: CaseRow["status"], resolvedAt?: string | null): Promise<void>;
  /** Stores the latest advisory analysis for a report. */
  saveAnalysis(row: CaseAnalysisRow): Promise<void>;
  analysisForCase(caseId: string): Promise<CaseAnalysisRow | null>;

  /* ---------------- shared civic model ---------------- */

  /** Creates the shared issue a new report belongs to. */
  createIssue(input: {
    caseId: string;
    title: string;
    description: string | null;
    category: CaseRow["category"];
    latitude: number;
    longitude: number;
    colonia: string;
    createdByUserId: string | null;
    isPublic: boolean;
    createdAt: string;
  }): Promise<IssueRow>;
  getIssue(id: string, participantKey?: string, userId?: string | null): Promise<IssueAggregate | null>;
  listIssues(
    filters: IssueFilters,
    participantKey?: string,
    userId?: string | null,
  ): Promise<{ issues: IssueAggregate[]; total: number }>;
  reportsForIssue(issueId: string, participantKey?: string): Promise<CaseAggregate[]>;
  addIssueSupport(
    issueId: string,
    participant: ParticipantContext,
  ): Promise<{ support_count: number; added: boolean }>;
  removeIssueSupport(
    issueId: string,
    participant: ParticipantContext,
  ): Promise<{ support_count: number; removed: boolean }>;
  activeVerification(issueId: string, userId: string): Promise<VerificationRow | null>;
  upsertVerification(input: {
    issueId: string;
    userId: string;
    verdict: VerificationVerdict;
    note: string | null;
  }): Promise<VerificationRow>;
  issueEvidence(issueId: string): Promise<EvidenceRow[]>;
  addEvidenceRow(input: {
    issueId: string;
    caseId: string | null;
    kind: EvidenceRow["kind"];
    url: string;
    caption: string | null;
    participant: ParticipantContext;
    organizationId: string | null;
  }): Promise<EvidenceRow>;
  officialRecordsForIssue(issueId: string): Promise<OfficialRecordRow[]>;
  officialRecordById(id: string): Promise<OfficialRecordRow | null>;
  linkOfficialRecord(issueId: string, officialRecordId: string, userId: string | null): Promise<void>;
  /** Idempotent import keyed by (source_system, source_record_id). */
  upsertOfficialRecord(input: OfficialRecordRow): Promise<{ id: string; created: boolean }>;
  officialRecordStatusHistory(officialRecordId: string): Promise<OfficialStatusHistoryRow[]>;
  linkOfficialRecordsByFolio(
    issueId: string,
    links: Array<{ sourceSystem: string; externalFolio: string }>,
    userId: string | null,
  ): Promise<number>;
  membershipsFor(userId: string): Promise<OrganizationMemberRow[]>;
  upsertOrganizationMember(input: {
    organizationId: string;
    userId: string;
    role: OrganizationMemberRow["role"];
    scope?: string[];
    verifiedBy?: string | null;
  }): Promise<OrganizationMemberRow>;
  ensureOrganization(input: {
    slug: string;
    name: string;
    kind?: "alcaldia" | "municipality" | "agency" | "civic";
  }): Promise<{ id: string }>;
  appendEvent(input: {
    caseId: string | null;
    issueId: string;
    type: EventRow["type"];
    actorType: EventRow["actor_type"];
    actorUserId: string | null;
    organizationId: string | null;
    title: string;
    description: string | null;
    isPublic: boolean;
  }): Promise<void>;
  updateIssue(input: {
    issueId: string;
    operationalStatus?: IssueRow["operational_status"];
    communityVerificationStatus?: IssueRow["community_verification_status"];
    externalStatus?: string | null;
    resolvedAt?: string | null;
    organizationId?: string | null;
  }): Promise<void>;
}
