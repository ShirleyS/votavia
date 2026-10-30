import {
  ALCALDIA,
  type AddEvidenceInput,
  type Case,
  type CaseEventType,
  type CaseFilters,
  type CaseTimelineEvent,
  type CivicPlatformService,
  type CommunityVerificationSummary,
  type EvidenceItem,
  type Issue,
  type IssueDetail,
  type IssueFilters,
  type IssueSupportResult,
  type CaseAnalysis,
  type DraftAnalysisRequest,
  type DraftAnalysisResponse,
  type UpdateCaseInput,
  type OperationalUpdateInput,
  type RecordVerificationInput,
  type OfficialRecord,
  type OfficialRecordStatusHistoryEntry,
  type VerificationVerdict,
  type CommunitySupport,
  type CreateCaseInput,
  type CreateObservationInput,
  type NearbyCaseQuery,
  type Paginated,
  type ParticipantContext,
  type PublicStats,
  type RelatedReport,
  type ReportObservation,
} from "@/shared/votavia-contract";
import type {
  CaseAggregate,
  CaseRow,
  EvidenceRow,
  IssueAggregate,
  ObservationRow,
  OfficialRecordRow,
} from "@/server/repositories/rows";
import type { CaseRepository } from "@/server/repositories/repository";
import { distanceMeters } from "@/lib/utils";
import { hasOrganizationRole } from "@/server/auth/roles";
import {
  analyzeDraft,
  analyzePersistedCase,
  storedAnalysisToPayload,
  type CaseAnalysisPayload,
} from "@/server/services/case-analysis";
import { STATUS_META } from "@/lib/taxonomy";

const DEFAULT_PAGE_SIZE = 12;

const EVENT_TITLES: Partial<Record<CaseEventType, string>> = {
  reported: "Reporte recibido",
  under_review: "En revisión",
  assigned: "Asignado a un equipo",
  in_progress: "Trabajo en proceso",
  pending_verification: "Pendiente de verificación",
  resolved: "Resuelto",
  closed: "Caso cerrado",
};

function toCase(aggregate: CaseAggregate, participant?: ParticipantContext): Case {
  const row = aggregate.row;
  return {
    case_id: row.id,
    display_id: row.display_id,
    category: row.category,
    status: row.status,
    title: row.title,
    description: row.description,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      colonia: row.colonia,
      address_hint: row.address_hint,
      alcaldia: ALCALDIA,
    },
    colonia: row.colonia,
    latitude: row.latitude,
    longitude: row.longitude,
    photos: aggregate.photos
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((photo) => ({
        photo_id: photo.id,
        case_id: photo.case_id,
        url: photo.url,
        kind: photo.kind,
        caption: photo.caption,
        created_at: photo.created_at,
      })),
    support_count: aggregate.support_count,
    supported_by_me: aggregate.supported_by_me,
    observation_count: aggregate.observation_count,
    has_safety_concern: row.has_safety_concern,
    has_accessibility_concern: row.has_accessibility_concern,
    is_demo: row.is_demo,
    is_published: row.is_published,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    issue_id: row.issue_id ?? null,
    is_mine: Boolean(
      participant?.user_id && row.created_by_user_id && row.created_by_user_id === participant.user_id,
    ),
  };
}

function canView(aggregate: CaseAggregate, participant?: ParticipantContext) {
  if (aggregate.row.is_published) return true;
  if (!participant?.user_id) return false;
  if (aggregate.row.created_by_user_id === participant.user_id) return true;
  return participant.role === "government" || participant.role === "admin";
}

function canViewIssue(aggregate: IssueAggregate, participant?: ParticipantContext) {
  if (aggregate.row.is_public) return true;
  if (!participant?.user_id) return false;
  if (aggregate.row.created_by_user_id === participant.user_id) return true;
  return participant.role === "government" || participant.role === "admin";
}

function toObservation(row: ObservationRow): ReportObservation {
  return {
    observation_id: row.id,
    case_id: row.case_id,
    kind: row.kind,
    body: row.body,
    actor_type: row.author_type,
    author_label: row.author_label,
    created_at: row.created_at,
  };
}

function authorLabel(participant: ParticipantContext) {
  if (participant.user_id) return "Vecina o vecino registrado";
  return "Vecina o vecino de la colonia";
}

/** Deterministic duplicate candidate scoring (semantic matching arrives later). */
export function scoreNearbyCase(
  origin: { latitude: number; longitude: number; category?: string; text?: string },
  candidate: CaseRow,
): number {
  const meters = distanceMeters(
    { latitude: origin.latitude, longitude: origin.longitude },
    { latitude: candidate.latitude, longitude: candidate.longitude },
  );
  let score = 0;
  if (meters <= 120) score += 60;
  else if (meters <= 250) score += 45;
  else if (meters <= 400) score += 25;
  else if (meters <= 600) score += 10;

  if (candidate.category === origin.category) score += 25;

  const tokens = (origin.text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length >= 4);
  if (tokens.length) {
    const haystack = `${candidate.title} ${candidate.description}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    score += Math.min(15, hits * 3);
  }
  if (candidate.status === "resolved" || candidate.status === "closed") score -= 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function toIssue(aggregate: IssueAggregate): Issue {
  const row = aggregate.row;
  return {
    issue_id: row.id,
    display_id: row.display_id,
    title: row.title,
    description: row.description,
    category: row.category,
    origin: row.origin,
    operational_status: row.operational_status,
    external_status: row.external_status,
    community_verification_status: row.community_verification_status,
    latitude: row.latitude,
    longitude: row.longitude,
    colonia: row.colonia,
    organization_id: row.organization_id,
    is_public: row.is_public,
    support_count: aggregate.support_count,
    supported_by_me: aggregate.supported_by_me,
    report_count: aggregate.report_count,
    official_record_count: aggregate.official_record_count,
    verification: {
      confirmed: aggregate.verification_counts.confirmed,
      disputed: aggregate.verification_counts.disputed,
      verified_resolved: aggregate.verification_counts.verified_resolved,
      total:
        aggregate.verification_counts.confirmed +
        aggregate.verification_counts.disputed +
        aggregate.verification_counts.verified_resolved,
      my_verdict: aggregate.my_verdict,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
  };
}

function toOfficialRecord(row: OfficialRecordRow): OfficialRecord {
  return {
    official_record_id: row.id,
    source_system: row.source_system,
    source_record_id: row.source_record_id,
    dedupe_key: row.dedupe_key ?? null,
    source_dataset: row.source_dataset ?? null,
    external_folio: row.external_folio,
    source_url: row.source_url,
    original_category: row.original_category,
    original_status: row.original_status,
    status_normalized: row.status_normalized ?? null,
    title: row.title,
    description: row.description,
    reported_at: row.reported_at,
    source_closed_at: row.source_closed_at ?? null,
    responsible_agency: row.responsible_agency ?? null,
    alcaldia: row.alcaldia ?? null,
    collector_schema_version: row.collector_schema_version ?? null,
    extraction_method: row.extraction_method ?? null,
    data_quality_flags: row.data_quality_flags ?? [],
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    colonia: row.colonia,
    address_hint: row.address_hint,
    imported_at: row.imported_at,
    source_created_at: row.source_created_at ?? null,
    source_updated_at: row.source_updated_at,
    source_fetched_at: row.source_fetched_at ?? null,
    first_seen_at: row.first_seen_at ?? row.imported_at,
    last_synced_at: row.last_synced_at ?? row.imported_at,
    is_active: row.is_active ?? true,
    license: row.license ?? null,
    license_url: row.license_url ?? null,
    attribution: row.attribution ?? null,
    license_verified_from: row.license_verified_from ?? null,
    redistribution: row.redistribution ?? "unknown",
    redistribution_note: row.redistribution_note ?? null,
    provenance: row.provenance ?? {},
  };
}

function toEvidence(row: EvidenceRow): EvidenceItem {
  return {
    evidence_id: row.id,
    issue_id: row.issue_id,
    case_id: row.case_id,
    kind: row.kind,
    url: row.url,
    caption: row.caption,
    uploader_role: row.uploader_role,
    organization_id: row.organization_id,
    is_public: row.is_public,
    created_at: row.created_at,
  };
}

const VERDICT_LABEL: Record<VerificationVerdict, string> = {
  confirmed: "La comunidad confirma que el problema sigue",
  disputed: "La comunidad disputa la resolución",
  verified_resolved: "La comunidad verifica que quedó resuelto",
};

const OPERATIONAL_LABEL: Record<Issue["operational_status"], string> = {
  new: "Nuevo",
  triaged: "Clasificado",
  assigned: "Asignado",
  in_progress: "En proceso",
  completed: "Trabajo completado",
  cancelled: "Cancelado",
};

export class CaseService implements CivicPlatformService {
  constructor(private readonly repo: CaseRepository) {}

  async listCases(
    filters: CaseFilters = {},
    participant?: ParticipantContext,
  ): Promise<Paginated<Case>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
    const { aggregates, total } = await this.repo.list(
      { ...filters, page, pageSize },
      participant?.participant_key,
    );
    return {
      items: aggregates.map((aggregate) => toCase(aggregate, participant)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async getCase(id: string, participant?: ParticipantContext): Promise<Case | null> {
    const aggregate = await this.repo.getById(id, participant?.participant_key);
    if (!aggregate || !canView(aggregate, participant)) return null;
    const item = toCase(aggregate, participant);
    return this.enrichWithIssue(item, participant);
  }

  /** Adds shared-issue context (origin, three status domains) to a report. */
  async enrichWithIssue(item: Case, participant?: ParticipantContext): Promise<Case> {
    if (!item.issue_id) return item;
    const aggregate = await this.repo.getIssue(
      item.issue_id,
      participant?.participant_key,
      participant?.user_id ?? null,
    );
    if (!aggregate) return item;
    return {
      ...item,
      issue_display_id: aggregate.row.display_id,
      origin: aggregate.row.origin,
      operational_status: aggregate.row.operational_status,
      external_status: aggregate.row.external_status,
      community_verification_status: aggregate.row.community_verification_status,
      official_record_count: aggregate.official_record_count,
    };
  }

  async createCase(input: CreateCaseInput, participant: ParticipantContext): Promise<Case> {
    const aggregate = await this.repo.create(input, participant);
    // Every report starts inside a shared issue. Duplicate grouping (Session 3)
    // may later attach more reports to the same issue.
    await this.repo.createIssue({
      caseId: aggregate.row.id,
      title: input.title,
      description: input.description,
      category: input.category,
      latitude: input.latitude,
      longitude: input.longitude,
      colonia: input.colonia,
      createdByUserId: aggregate.row.created_by_user_id,
      isPublic: true,
      createdAt: aggregate.row.created_at,
    });
    const created = await this.repo.getById(aggregate.row.id, participant.participant_key);
    return created ? this.enrichWithIssue(toCase(created, participant), participant) : toCase(aggregate, participant);
  }

  /* ---------------- shared civic model ---------------- */

  async listIssues(
    filters: IssueFilters = {},
    participant?: ParticipantContext,
  ): Promise<Paginated<Issue>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
    const { issues, total } = await this.repo.listIssues(
      { ...filters, page, pageSize },
      participant?.participant_key,
      participant?.user_id ?? null,
    );
    return {
      items: issues.map(toIssue),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async getIssue(id: string, participant?: ParticipantContext): Promise<IssueDetail | null> {
    const aggregate = await this.repo.getIssue(
      id,
      participant?.participant_key,
      participant?.user_id ?? null,
    );
    if (!aggregate || !canViewIssue(aggregate, participant)) return null;

    const [reports, records, evidence] = await Promise.all([
      this.repo.reportsForIssue(aggregate.row.id, participant?.participant_key),
      this.repo.officialRecordsForIssue(aggregate.row.id),
      this.repo.issueEvidence(aggregate.row.id),
    ]);

    const issue = toIssue(aggregate);
    return {
      ...issue,
      reports: reports.map((report) => toCase(report, participant)),
      official_records: records.map(toOfficialRecord),
      evidence: evidence.map(toEvidence),
    };
  }

  async supportIssue(issueId: string, participant: ParticipantContext): Promise<IssueSupportResult> {
    const aggregate = await this.repo.getIssue(
      issueId,
      participant.participant_key,
      participant.user_id,
    );
    if (!aggregate || !canViewIssue(aggregate, participant)) {
      throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
    }
    const result = await this.repo.addIssueSupport(aggregate.row.id, participant);
    if (result.added) {
      await this.repo.appendEvent({
        caseId: null,
        issueId: aggregate.row.id,
        type: "community_support",
        actorType: participant.user_id ? "citizen" : "community",
        actorUserId: participant.user_id,
        organizationId: null,
        title: "Apoyo de la comunidad",
        description: null,
        isPublic: true,
      });
    }
    return {
      issue_id: aggregate.row.id,
      support_count: result.support_count,
      supported_by_me: true,
    };
  }

  async removeIssueSupport(
    issueId: string,
    participant: ParticipantContext,
  ): Promise<IssueSupportResult> {
    const aggregate = await this.repo.getIssue(issueId);
    if (!aggregate) throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
    const result = await this.repo.removeIssueSupport(aggregate.row.id, participant);
    if (result.removed) {
      await this.repo.appendEvent({
        caseId: null,
        issueId: aggregate.row.id,
        type: "support_removed",
        actorType: "citizen",
        actorUserId: participant.user_id,
        organizationId: null,
        title: "Se retiró un apoyo",
        description: null,
        isPublic: true,
      });
    }
    return {
      issue_id: aggregate.row.id,
      support_count: result.support_count,
      supported_by_me: false,
    };
  }

  async recordVerification(
    issueId: string,
    input: RecordVerificationInput,
  ): Promise<CommunityVerificationSummary> {
    if (!input.participant.user_id) {
      throw Object.assign(
        new Error("Inicia sesión para verificar este caso."),
        { status: 401 },
      );
    }
    const aggregate = await this.repo.getIssue(issueId);
    if (!aggregate || !canViewIssue(aggregate, input.participant)) {
      throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
    }

    await this.repo.upsertVerification({
      issueId: aggregate.row.id,
      userId: input.participant.user_id,
      verdict: input.verdict,
      note: input.note ?? null,
    });

    // A government completion claim alone never becomes verified_resolved:
    // only a community verdict can set that status.
    await this.repo.updateIssue({
      issueId: aggregate.row.id,
      communityVerificationStatus: input.verdict,
    });
    await this.repo.appendEvent({
      caseId: null,
      issueId: aggregate.row.id,
      type: "community_verification",
      actorType: "citizen",
      actorUserId: input.participant.user_id,
      organizationId: null,
      title: VERDICT_LABEL[input.verdict],
      description: input.note ?? null,
      isPublic: true,
    });

    const refreshed = await this.repo.getIssue(aggregate.row.id);
    const counts = refreshed?.verification_counts ?? {
      confirmed: 0,
      disputed: 0,
      verified_resolved: 0,
    };
    return {
      confirmed: counts.confirmed,
      disputed: counts.disputed,
      verified_resolved: counts.verified_resolved,
      total: counts.confirmed + counts.disputed + counts.verified_resolved,
      my_verdict: input.verdict,
    };
  }

  async getOfficialRecordStatusHistory(
    officialRecordId: string,
  ): Promise<OfficialRecordStatusHistoryEntry[]> {
    const rows = await this.repo.officialRecordStatusHistory(officialRecordId);
    return rows.map((row) => ({
      history_id: row.id,
      official_record_id: row.official_record_id,
      status_text: row.status_text,
      status_normalized: row.status_normalized,
      changed_at: row.changed_at,
      observed_at: row.observed_at,
      source_updated_at: row.source_updated_at,
      sync_run_id: row.sync_run_id,
      is_current: row.is_current,
    }));
  }

  async listEvidence(issueId: string): Promise<EvidenceItem[]> {
    const rows = await this.repo.issueEvidence(issueId);
    return rows.map(toEvidence);
  }

  async addEvidence(input: AddEvidenceInput): Promise<EvidenceItem> {
    const aggregate = await this.repo.getIssue(input.issueId);
    if (!aggregate || !canViewIssue(aggregate, input.participant)) {
      throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
    }

    if (input.caseId) {
      const report = await this.repo.getById(input.caseId);
      if (!report || report.row.issue_id !== aggregate.row.id) {
        throw Object.assign(
          new Error("El reporte no pertenece a este caso compartido."),
          { status: 422 },
        );
      }
    }

    const row = await this.repo.addEvidenceRow({
      issueId: aggregate.row.id,
      caseId: input.caseId ?? null,
      kind: input.kind,
      url: input.url,
      caption: input.caption ?? null,
      participant: input.participant,
      organizationId: input.organizationId ?? null,
    });
    await this.repo.appendEvent({
      caseId: input.caseId ?? null,
      issueId: aggregate.row.id,
      type: "evidence_added",
      actorType: row.uploader_role,
      actorUserId: input.participant.user_id,
      organizationId: input.organizationId ?? null,
      title:
        input.kind === "government_intervention"
          ? "Evidencia de intervención publicada"
          : input.kind === "resolution_proof"
            ? "Evidencia de resolución publicada"
            : "Nueva evidencia de la comunidad",
      description: input.caption ?? null,
      isPublic: true,
    });
    return toEvidence(row);
  }

  async recordOperationalUpdate(
    issueId: string,
    input: OperationalUpdateInput,
  ): Promise<IssueDetail> {
    const { resolveActor } = await import("@/server/auth/organization");
    const actor = await resolveActor(input.participant);
    if (!hasOrganizationRole(actor.memberships, input.organizationId, "responder")) {
      throw Object.assign(
        new Error("Tu cuenta no tiene permiso sobre esa organización."),
        { status: 403 },
      );
    }
    const aggregate = await this.repo.getIssue(issueId);
    if (!aggregate) throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
    if (aggregate.row.organization_id && aggregate.row.organization_id !== input.organizationId) {
      throw Object.assign(new Error("Este caso pertenece a otra organización."), { status: 403 });
    }

    const completed = input.operationalStatus === "completed";
    await this.repo.updateIssue({
      issueId: aggregate.row.id,
      operationalStatus: input.operationalStatus,
      externalStatus: input.externalStatus,
      resolvedAt: completed ? new Date().toISOString() : undefined,
      organizationId: input.organizationId,
    });

    await this.repo.appendEvent({
      caseId: null,
      issueId: aggregate.row.id,
      type: "government_update",
      actorType: "government",
      actorUserId: input.participant.user_id,
      organizationId: input.organizationId,
      title: OPERATIONAL_LABEL[input.operationalStatus],
      description: input.note ?? null,
      isPublic: true,
    });

    // A government completion claim opens community verification; it does not
    // mark the issue as verified_resolved by itself.
    if (completed && aggregate.row.community_verification_status !== "verified_resolved") {
      await this.repo.updateIssue({
        issueId: aggregate.row.id,
        communityVerificationStatus: "unreviewed",
      });
    }

    const detail = await this.getIssue(aggregate.row.id, input.participant);
    if (!detail) throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
    return detail;
  }

  /* ---------------- reporter-owned management ---------------- */

  /**
   * Ownership rule: the signed-in user must own the report (or hold an
   * elevated role). An anonymous visitor can never edit anything, even while
   * holding the same participant cookie they used to submit.
   */
  private async assertCanManage(
    aggregate: CaseAggregate,
    participant: ParticipantContext,
  ): Promise<void> {
    const ownership = await this.repo.ownership(aggregate.row.id);
    const elevated = participant.role === "admin" || participant.role === "government";
    // Guest submissions are claimed by email before they can be managed;
    // the participant cookie alone never grants edit rights.
    const sameUser =
      Boolean(participant.user_id) &&
      ownership?.created_by_user_id != null &&
      ownership.created_by_user_id === participant.user_id;

    if (!elevated && !sameUser) {
      throw Object.assign(
        new Error("Solo quien reportó puede modificar este reporte."),
        { status: 403 },
      );
    }
  }

  async updateCase(caseId: string, input: UpdateCaseInput): Promise<Case> {
    const aggregate = await this.repo.getById(caseId, input.participant.participant_key);
    if (!aggregate) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
    await this.assertCanManage(aggregate, input.participant);

    const editable: CaseAggregate["row"]["status"][] = ["reported", "under_review"];
    if (!editable.includes(aggregate.row.status) && input.participant.role !== "admin") {
      throw Object.assign(
        new Error(
          "Este reporte ya está en atención. Agrega una observación en lugar de editarlo.",
        ),
        { status: 409 },
      );
    }

    const updated = await this.repo.updateCase(aggregate.row.id, {
      title: input.title,
      description: input.description,
      category: input.category,
      address_hint: input.address_hint,
    });
    if (!updated) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });

    if (aggregate.row.issue_id) {
      await this.repo.appendEvent({
        caseId: aggregate.row.id,
        issueId: aggregate.row.issue_id,
        type: "report_updated",
        actorType: "citizen",
        actorUserId: input.participant.user_id,
        organizationId: null,
        title: "El reporte se actualizó",
        description: "Quien reportó actualizó la información del caso.",
        isPublic: true,
      });
    }

    return this.enrichWithIssue(toCase(updated, input.participant), input.participant);
  }

  /**
   * Withdrawing keeps the record: it closes the report and records why. Citizen
   * data is not deleted, so counts and audit history stay honest.
   */
  async withdrawCase(caseId: string, participant: ParticipantContext): Promise<Case> {
    const aggregate = await this.repo.getById(caseId, participant.participant_key);
    if (!aggregate) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
    await this.assertCanManage(aggregate, participant);

    if (aggregate.row.status === "closed") {
      return this.enrichWithIssue(toCase(aggregate, participant), participant);
    }

    // A withdrawal is not a resolution: keep `resolved_at` empty.
    await this.repo.setStatus(aggregate.row.id, "closed", null);
    if (aggregate.row.issue_id) {
      await this.repo.updateIssue({
        issueId: aggregate.row.issue_id,
        operationalStatus: "cancelled",
      });
      await this.repo.appendEvent({
        caseId: aggregate.row.id,
        issueId: aggregate.row.issue_id,
        type: "report_withdrawn",
        actorType: "citizen",
        actorUserId: participant.user_id,
        organizationId: null,
        title: "El reporte se retiró",
        description: "Quien reportó retiró el reporte.",
        isPublic: true,
      });
    }

    const refreshed = await this.repo.getById(aggregate.row.id, participant.participant_key);
    return this.enrichWithIssue(
      toCase(refreshed ?? aggregate, participant),
      participant,
    );
  }

  /* ---------------- advisory AI ---------------- */

  async analyzeCase(
    caseId: string,
    participant?: ParticipantContext,
  ): Promise<CaseAnalysis | null> {
    const item = await this.getCase(caseId, participant);
    if (!item) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
    const payload = await analyzePersistedCase(this.repo, item);
    return payload ? { analysis: payload.analysis, extras: payload.extras } : null;
  }

  async getCaseAnalysis(caseId: string): Promise<CaseAnalysis | null> {
    const row = await this.repo.analysisForCase(caseId);
    const payload: CaseAnalysisPayload | null = storedAnalysisToPayload(row);
    return payload ? { analysis: payload.analysis, extras: payload.extras } : null;
  }

  async analyzeDraft(request: DraftAnalysisRequest): Promise<DraftAnalysisResponse | null> {
    const result = await analyzeDraft(this.repo, request);
    if (!result) return null;

    const byId = new Map(result.candidates.map((candidate) => [candidate.case_id, candidate]));
    const duplicates = (result.duplicates?.matches ?? [])
      .filter((match) => match.relationship !== "different_problem")
      .map((match) => {
        const candidate = byId.get(match.case_id);
        return {
          case_id: match.case_id,
          display_id: candidate?.case_id ?? match.case_id,
          title: candidate?.title ?? "Reporte cercano",
          category: candidate?.category ?? request.category ?? "other",
          status: candidate?.status ?? "reported",
          distance_meters: match.distance_meters ?? 0,
          score: match.confidence ?? 0.5,
          reason: match.explanation,
          relationship: match.relationship,
        };
      });

    return {
      suggested_category: result.classification.suggested_category,
      suggested_title: result.classification.suggested_title,
      summary: result.classification.normalized_summary,
      severity: result.classification.severity,
      confidence: result.classification.confidence,
      needs_more_information: result.classification.needs_more_information,
      missing_information: result.classification.missing_information,
      is_fallback: result.classification.fallback,
      duplicates,
    };
  }

  async supportCase(id: string, participant: ParticipantContext): Promise<CommunitySupport> {
    const aggregate = await this.repo.getById(id, participant.participant_key);
    if (!aggregate || !canView(aggregate, participant)) {
      throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
    }
    const result = await this.repo.support(aggregate.row.id, participant);
    return {
      case_id: aggregate.row.id,
      support_count: result.support_count,
      supported_by_me: true,
    };
  }

  async addObservation(id: string, input: CreateObservationInput): Promise<ReportObservation> {
    const aggregate = await this.repo.getById(id);
    if (!aggregate || !canView(aggregate, input.participant)) {
      throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
    }
    const row = await this.repo.addObservation({
      caseId: aggregate.row.id,
      kind: input.kind,
      body: input.body,
      participant: input.participant,
      authorLabel: authorLabel(input.participant),
    });
    return toObservation(row);
  }

  async getCaseObservations(
    id: string,
    participant?: ParticipantContext,
  ): Promise<ReportObservation[]> {
    const aggregate = await this.repo.getById(id);
    if (!aggregate || !canView(aggregate, participant)) return [];
    const rows = await this.repo.observations(aggregate.row.id);
    return rows.map(toObservation);
  }

  async getCaseTimeline(
    id: string,
    participant?: ParticipantContext,
  ): Promise<CaseTimelineEvent[]> {
    const aggregate = await this.repo.getById(id);
    if (!aggregate || !canView(aggregate, participant)) return [];
    const rows = await this.repo.events(aggregate.row.id);
    return rows
      .filter((row) => row.is_public)
      .map((row) => ({
        event_id: row.id,
        case_id: row.case_id,
        type: row.type,
        actor_type: row.actor_type,
        title: row.title || EVENT_TITLES[row.type] || STATUS_META[aggregate.row.status].label,
        description: row.description,
        created_at: row.created_at,
        is_public: row.is_public,
        metadata: row.metadata,
      }));
  }

  async findNearbyCases(query: NearbyCaseQuery): Promise<RelatedReport[]> {
    const radius = query.radiusMeters ?? 400;
    const limit = query.limit ?? 5;
    const aggregates = await this.repo.allAggregates();
    const scored: Array<{ aggregate: CaseAggregate; score: number; meters: number }> = [];

    for (const aggregate of aggregates) {
      const meters = distanceMeters(
        { latitude: query.latitude, longitude: query.longitude },
        { latitude: aggregate.row.latitude, longitude: aggregate.row.longitude },
      );
      if (meters > radius) continue;
      const score = scoreNearbyCase(
        { latitude: query.latitude, longitude: query.longitude, category: query.category },
        aggregate.row,
      );
      if (score < 35) continue;
      scored.push({ aggregate, score, meters });
    }

    scored.sort((a, b) => b.score - a.score || a.meters - b.meters);
    return scored.slice(0, limit).map(({ aggregate, meters }) => ({
      case_id: aggregate.row.id,
      display_id: aggregate.row.display_id,
      title: aggregate.row.title,
      category: aggregate.row.category,
      status: aggregate.row.status,
      support_count: aggregate.support_count,
      distance_meters: meters,
      latitude: aggregate.row.latitude,
      longitude: aggregate.row.longitude,
      created_at: aggregate.row.created_at,
    }));
  }

  async getPublicStats(): Promise<PublicStats> {
    const aggregates = await this.repo.allAggregates();
    const cases = aggregates.map((aggregate) => toCase(aggregate));

    const byCategoryMap = new Map<string, { count: number; resolved: number }>();
    const byStatusMap = new Map<string, number>();
    const byColoniaMap = new Map<string, { count: number; resolved: number; supports: number }>();

    for (const item of cases) {
      const cat = byCategoryMap.get(item.category) ?? { count: 0, resolved: 0 };
      cat.count += 1;
      if (item.status === "resolved") cat.resolved += 1;
      byCategoryMap.set(item.category, cat);

      byStatusMap.set(item.status, (byStatusMap.get(item.status) ?? 0) + 1);

      const col = byColoniaMap.get(item.colonia) ?? { count: 0, resolved: 0, supports: 0 };
      col.count += 1;
      col.supports += item.support_count;
      if (item.status === "resolved") col.resolved += 1;
      byColoniaMap.set(item.colonia, col);
    }

    return {
      total_cases: cases.length,
      resolved_cases: cases.filter((c) => c.status === "resolved").length,
      total_supports: cases.reduce((sum, c) => sum + c.support_count, 0),
      total_observations: cases.reduce((sum, c) => sum + c.observation_count, 0),
      is_demo: cases.every((c) => c.is_demo) && cases.length > 0,
      by_category: [...byCategoryMap.entries()]
        .map(([category, value]) => ({ category: category as Case["category"], ...value }))
        .sort((a, b) => b.count - a.count),
      by_status: [...byStatusMap.entries()]
        .map(([status, count]) => ({ status: status as Case["status"], count }))
        .sort((a, b) => b.count - a.count),
      by_colonia: [...byColoniaMap.entries()]
        .map(([colonia, value]) => ({ colonia, ...value }))
        .sort((a, b) => b.count - a.count),
      recent_resolved: cases
        .filter((c) => c.status === "resolved")
        .sort((a, b) => new Date(b.resolved_at ?? b.updated_at).getTime() - new Date(a.resolved_at ?? a.updated_at).getTime())
        .slice(0, 3),
    };
  }
}
