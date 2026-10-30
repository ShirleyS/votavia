/**
 * Adaptador de la consola de gobierno contra el núcleo de Session 1.
 *
 * Fuente de verdad: `/api/issues`, `/api/issues/[id]`, `/api/issues/[id]/evidence`,
 * `/api/issues/[id]/operational`, `/api/official-records/[id]/history` y
 * `/api/organizations/me` (ver `contract.ts`).
 *
 * Contratos que Session 1 todavía NO expone y que este adaptador resuelve con
 * fixtures LOCALES claramente etiquetados (ver `PENDING_CONTRACTS`):
 *  - asignación de área/operador distinta de `organization_id`
 *  - respuesta oficial a disputas
 *  - publicación de resultado/cierre
 *  - feed de actividad dedicado
 *  - despacho de especialistas (Ismael): sólo se usa un `DispatchGateway` de prueba
 *
 * Nada de esto crea una segunda base de datos, autenticación ni API pública.
 */
import type {
  Case,
  DispatchAssignment,
  DispatchGateway,
  DispatchRequest,
  EvidenceItem,
  Issue,
  IssueDetail,
  OfficialRecord,
  OrganizationMembership,
  OrganizationRole,
  PaginatedIssues,
} from "./contract";
import { CoreApiError, coreRequest } from "./http";
import {
  computePriorityBreakdown,
  priorityFromBreakdown,
} from "../priority";
import { mockSpecialists } from "../mock-data";
import type {
  ActivityItem,
  CaseAnalysis,
  CaseCategory,
  CaseEvent,
  CasePhoto,
  CasePriority,
  CaseStatus,
  CommunityVerification,
  CompletionClaim,
  CompletionClaimInput,
  DataFreshness,
  DisputeResponse,
  DisputeResponseInput,
  DispatchOrder,
  DispatchState,
  GovernmentCase,
  GovernmentCaseFilters,
  GovernmentDashboard,
  GovernmentEvidenceInput,
  GovernmentEvidenceRecord,
  GovernmentOrganization,
  GovernmentService,
  ImportedGovernmentRecord,
  ResolutionDispute,
  RiskSignal,
  SpecialistRecommendation,
} from "../types";

export const PENDING_CONTRACTS: { id: string; label: string; detail: string }[] = [
  {
    id: "assignment",
    label: "Asignación de área y operador",
    detail:
      "El núcleo sólo acepta `organization_id` en el cambio operativo. Falta un endpoint de responsable/operador; la consola guarda la asignación de forma local y etiquetada.",
  },
  {
    id: "dispute-response",
    label: "Respuesta oficial a disputas",
    detail:
      "No existe endpoint para responder disputas. La respuesta se conserva en el adaptador local y no altera la verificación ciudadana.",
  },
  {
    id: "publish-outcome",
    label: "Publicación de resultado",
    detail:
      "Falta el contrato de publicación. El cierre se registra localmente sobre el estado operativo del núcleo.",
  },
  {
    id: "activity",
    label: "Feed de actividad",
    detail:
      "No hay endpoint de actividad. La bitácora se reconstruye con los eventos del expediente (`created_at`, evidencia, registro oficial).",
  },
  {
    id: "dispatch",
    label: "Despacho de especialistas (Ismael)",
    detail:
      "El contrato `DispatchGateway` no tiene implementación HTTP. Se usa un fixture de prueba rotulado; no se inventan endpoints.",
  },
];

const CATEGORY_TO_CORE: Record<CaseCategory, Issue["category"]> = {
  baches: "road_damage",
  alumbrado: "street_lighting",
  movilidad: "traffic_signals",
  seguridad: "sidewalk_accessibility",
  parques: "parks_public_spaces",
  residuos: "waste_sanitation",
  agua: "other",
  drenaje: "other",
  otros: "other",
};

const CORE_TO_CATEGORY: Record<Issue["category"], CaseCategory> = {
  road_damage: "baches",
  street_lighting: "alumbrado",
  traffic_signals: "movilidad",
  sidewalk_accessibility: "seguridad",
  trees_vegetation: "parques",
  waste_sanitation: "residuos",
  parks_public_spaces: "parques",
  other: "otros",
};

const CATEGORY_DEPARTMENT: Record<CaseCategory, string | undefined> = {
  baches: "obras",
  alumbrado: "alumbrado",
  movilidad: "movilidad",
  seguridad: "proteccion",
  parques: "parques",
  residuos: "residuos",
  agua: "agua",
  drenaje: "agua",
  otros: undefined,
};

const OPERATIONAL_TO_STATUS: Record<
  Issue["operational_status"],
  (issue: Issue) => CaseStatus
> = {
  new: () => "reported",
  triaged: () => "under_review",
  assigned: () => "assigned",
  in_progress: () => "in_progress",
  completed: (issue) =>
    issue.community_verification_status === "verified_resolved"
      ? "resolved"
      : "pending_verification",
  cancelled: () => "closed",
};

const STATUS_TO_OPERATIONAL: Record<
  CaseStatus,
  Issue["operational_status"]
> = {
  reported: "new",
  under_review: "triaged",
  assigned: "assigned",
  in_progress: "in_progress",
  pending_verification: "completed",
  resolved: "completed",
  closed: "completed",
};

const ORG_NAMES: Record<string, string> = {
  "org-demo-cuauhtemoc": "Alcaldía Cuauhtémoc (demostración)",
  // Seeded demo organization (see DEMO_ORGANIZATION_ID). Without this the
  // console greets the operator with the raw UUID.
  "11111111-1111-4111-8111-111111111111": "Alcaldía Cuauhtémoc (demostración)",
};

const OPERATOR_ROLE_PERMISSIONS: Record<
  OrganizationRole,
  import("../types").GovernmentPermission[]
> = {
  responder: ["case:manage", "evidence:upload", "dispute:respond"],
  supervisor: [
    "case:manage",
    "case:assign",
    "evidence:upload",
    "dispute:respond",
  ],
  admin: [
    "case:manage",
    "case:assign",
    "evidence:upload",
    "dispatch:authorize",
    "dispute:respond",
    "outcome:publish",
  ],
};

interface Actor {
  userId: string;
  name: string;
  organizationId: string | null;
  role: OrganizationRole | null;
  memberships: OrganizationMembership[];
}

function freshnessFor(iso: string | null): DataFreshness {
  if (!iso) return "unknown";
  const ageHours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours)) return "unknown";
  if (ageHours <= 24) return "fresh";
  if (ageHours <= 72) return "aging";
  return "stale";
}

const FRESHNESS_LABEL: Record<DataFreshness, string> = {
  fresh: "Sincronizado recientemente",
  aging: "Con rezago de actualización",
  stale: "Dato desactualizado",
  unknown: "Frescura desconocida",
};

function mapOfficialRecord(record?: OfficialRecord): ImportedGovernmentRecord | undefined {
  if (!record) return undefined;
  const reference = record.last_synced_at ?? record.source_updated_at ?? record.imported_at;
  const freshness = freshnessFor(reference);
  return {
    sourceName: `${record.source_system} · registro importado`,
    sourceFolio: record.external_folio ?? record.source_record_id,
    agency: record.responsible_agency ?? "Fuente oficial",
    reportedStatus:
      record.status_normalized ?? record.original_status ?? "Sin estado reportado",
    importedAt: record.imported_at,
    refreshedAt: reference,
    freshness,
    freshnessLabel: FRESHNESS_LABEL[freshness],
    note:
      "Estado reportado por la fuente original. VotaVía no lo reescribe al declarar un cierre operativo. Entorno de demostración, no adopción oficial de CDMX.",
    sourceSystem: record.source_system,
    sourceUrl: record.source_url ?? undefined,
    sourceUpdatedAt: record.source_updated_at ?? undefined,
    redistribution: record.redistribution,
    officialRecordId: record.official_record_id,
  };
}

function mapCommunity(issue: Issue): CommunityVerification {
  const label: Record<
    Issue["community_verification_status"],
    CommunityVerification["status"]
  > = {
    unreviewed: "not_started",
    confirmed: "verified",
    disputed: "disputed",
    verified_resolved: "verified",
  };
  const outcome: Record<Issue["community_verification_status"], string> = {
    unreviewed: "La comunidad todavía no inicia la verificación.",
    confirmed: "Vecinos confirmaron que el problema continúa.",
    disputed: "La comunidad disputa el cierre declarado por gobierno.",
    verified_resolved: "La comunidad verificó que el problema quedó resuelto.",
  };
  return {
    status: label[issue.community_verification_status],
    outcome: outcome[issue.community_verification_status],
    updatedAt: issue.updated_at,
    verifiedNeighbors: issue.verification.confirmed + issue.verification.verified_resolved,
    note:
      "Este estado sólo lo actualiza la ciudadanía. Una acción de gobierno no puede marcarlo como verificado.",
  };
}

const EVIDENCE_KIND_TO_UI: Record<EvidenceItem["kind"], GovernmentEvidenceRecord["kind"]> = {
  government_intervention: "before",
  resolution_proof: "after",
  official_record: "document",
  citizen_followup: "before",
};

const UI_KIND_TO_CORE: Record<GovernmentEvidenceRecord["kind"], EvidenceItem["kind"]> = {
  before: "government_intervention",
  after: "resolution_proof",
  document: "official_record",
};

const PHOTO_TONES: CasePhoto["tone"][] = ["blue", "amber", "green", "slate"];

function mapPhotos(reports: Case[]): CasePhoto[] {
  const photos: CasePhoto[] = [];
  reports.forEach((report) => {
    report.photos.forEach((photo, index) => {
      photos.push({
        id: photo.photo_id,
        url: photo.url,
        alt: photo.caption ?? `Evidencia de ${report.display_id}`,
        caption: photo.caption ?? `Reporte ${report.display_id}`,
        tone: PHOTO_TONES[(photos.length + index) % PHOTO_TONES.length],
      });
    });
  });
  return photos;
}

function progressFor(status: CaseStatus): number {
  return {
    reported: 8,
    under_review: 24,
    assigned: 42,
    in_progress: 64,
    pending_verification: 88,
    resolved: 96,
    closed: 100,
  }[status];
}

function coordinatesFor(latitude: number, longitude: number): { x: number; y: number } {
  // Aproximación determinista para el mapa esquemático de la consola.
  const x = 12 + (Math.abs(longitude * 997) % 76);
  const y = 12 + (Math.abs(latitude * 991) % 76);
  return { x: Math.round(x), y: Math.round(y) };
}

interface Overrides {
  priority?: CasePriority;
  status?: CaseStatus;
  departmentId?: string;
  operator?: { id: string; name: string };
  outcome?: string;
  publishedAt?: string;
  claims: CompletionClaim[];
  disputeResponses: DisputeResponse[];
}

function emptyOverrides(): Overrides {
  return { claims: [], disputeResponses: [] };
}

function mapEvidence(evidence: EvidenceItem): GovernmentEvidenceRecord {
  return {
    id: evidence.evidence_id,
    kind: EVIDENCE_KIND_TO_UI[evidence.kind],
    title: evidence.caption ?? "Evidencia de gobierno",
    note: evidence.caption ?? "Evidencia vinculada al expediente.",
    url: evidence.url,
    performedAt: evidence.created_at,
    submittedAt: evidence.created_at,
    departmentId: "",
    operatorName: evidence.uploader_role,
    authorId: evidence.uploader_role,
    source: "core",
    coreKind: evidence.kind,
    organizationId: evidence.organization_id,
    isPublic: evidence.is_public,
  };
}

function mapEvents(issue: IssueDetail): CaseEvent[] {
  const events: CaseEvent[] = [
    {
      id: `${issue.issue_id}-created`,
      at: issue.created_at,
      label: "Reporte recibido",
      detail: `Origen ${issue.origin} · ${issue.report_count} reporte(s) ciudadano(s).`,
      actor: "Citizen",
    },
  ];
  issue.reports.forEach((report) => {
    if (report.created_at !== issue.created_at) {
      events.push({
        id: `${report.case_id}-linked`,
        at: report.created_at,
        label: "Reporte ciudadano vinculado",
        detail: `${report.display_id} · ${report.support_count} apoyos.`,
        actor: "Citizen",
      });
    }
  });
  issue.official_records.forEach((record) => {
    events.push({
      id: `${record.official_record_id}-import`,
      at: record.imported_at,
      label: "Registro oficial importado",
      detail: `${record.source_system} · ${record.status_normalized ?? record.original_status ?? "sin estado"}.`,
      actor: "System",
    });
  });
  issue.evidence.forEach((evidence) => {
    events.push({
      id: `${evidence.evidence_id}-evidence`,
      at: evidence.created_at,
      label:
        evidence.kind === "government_intervention" || evidence.kind === "resolution_proof"
          ? "Evidencia de gobierno cargada"
          : "Evidencia ciudadana",
      detail: evidence.caption ?? evidence.kind,
      actor: "Government",
    });
  });
  if (issue.resolved_at) {
    events.push({
      id: `${issue.issue_id}-resolved`,
      at: issue.resolved_at,
      label: "Cierre operativo registrado",
      detail: "El estado importado y la verificación ciudadana conservan su propio valor.",
      actor: "Government",
    });
  }
  events.push({
    id: `${issue.issue_id}-updated`,
    at: issue.updated_at,
    label: "Última actualización",
    detail: `Estado operativo: ${issue.operational_status}.`,
    actor: "System",
  });
  return events
    .filter((event, index, all) => all.findIndex((entry) => entry.id === event.id) === index)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function buildDispute(
  issue: Issue,
  overrides: Overrides,
): ResolutionDispute | undefined {
  if (issue.community_verification_status !== "disputed") return undefined;
  return {
    id: `${issue.issue_id}-dispute`,
    claimId: `${issue.issue_id}-claim`,
    openedAt: issue.updated_at,
    citizenName: "Ciudadanía (identidad protegida)",
    reason: "La comunidad disputa el cierre declarado por gobierno.",
    detail:
      "La verificación ciudadana reporta que el problema continúa. La evidencia de gobierno permanece visible para revisión.",
    status: overrides.disputeResponses.length > 0 ? "responded" : "open",
    responses: overrides.disputeResponses,
  };
}

/** Extensión local del fixture; el contrato de Ismael sólo publica las dos primeras. */
export interface ConsoleDispatchGateway extends DispatchGateway {
  assign(
    dispatchRequestId: string,
    specialistId: string,
    assignee: string,
  ): Promise<DispatchAssignment>;
  updateAssignment(
    assignmentId: string,
    status: DispatchAssignment["status"],
    actor: string,
  ): Promise<DispatchAssignment>;
}

export interface CoreAdapterOptions {
  dispatchGateway?: ConsoleDispatchGateway;
  organisationNames?: Record<string, string>;
}

export class CoreGovernmentService implements GovernmentService {
  private actor: Actor = {
    userId: "sin-sesion",
    name: "Mesa de gobierno",
    organizationId: null,
    role: null,
    memberships: [],
  };
  private overrides = new Map<string, Overrides>();
  private listeners = new Set<() => void>();
  private dispatchGateway: ConsoleDispatchGateway;
  private orgNames: Record<string, string>;

  constructor(options: CoreAdapterOptions = {}) {
    this.dispatchGateway = options.dispatchGateway ?? new FixtureDispatchGateway();
    this.orgNames = { ...ORG_NAMES, ...options.organisationNames };
  }

  setActor(actor: Actor): void {
    this.actor = actor;
  }

  getActor(): Actor {
    return this.actor;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private overridesFor(id: string): Overrides {
    let value = this.overrides.get(id);
    if (!value) {
      value = emptyOverrides();
      this.overrides.set(id, value);
    }
    return value;
  }

  async loadSession(): Promise<{
    authenticated: boolean;
    memberships: OrganizationMembership[];
    organizations: GovernmentOrganization[];
    permissions: import("../types").GovernmentPermission[];
  }> {
    const response = await coreRequest<{
      authenticated: boolean;
      memberships: OrganizationMembership[];
    }>("/organizations/me");
    const memberships = response.memberships ?? [];
    const primary = memberships[0] ?? null;
    this.actor = {
      ...this.actor,
      organizationId: primary?.organization_id ?? null,
      role: primary?.role ?? null,
      memberships,
    };
    const organizations: GovernmentOrganization[] = memberships.map((membership) => ({
      id: membership.organization_id,
      name: this.orgNames[membership.organization_id] ?? membership.organization_id,
      role: membership.role,
      scope: membership.scope,
    }));
    return {
      authenticated: Boolean(response.authenticated),
      memberships,
      organizations,
      permissions: primary ? OPERATOR_ROLE_PERMISSIONS[primary.role] : [],
    };
  }

  /**
   * Abre la sesión de demostración del núcleo (`POST /api/auth/demo`).
   *
   * Es el mecanismo canónico de Session 1 cuando no hay Supabase Auth: la
   * consola no crea sesiones propias, sólo llama al endpoint del núcleo. La
   * cuenta resultante es una cuenta de demostración, nunca una cuenta oficial.
   */
  async signInDemo(email: string): Promise<void> {
    await coreRequest("/auth/demo", { method: "POST", json: { email } });
  }

  /** Cierra la sesión del núcleo (`DELETE /api/auth/demo`). */
  async signOut(): Promise<void> {
    await coreRequest("/auth/demo", { method: "DELETE" });
  }

  private async fetchDetail(issueId: string): Promise<IssueDetail> {
    const response = await coreRequest<{ issue: IssueDetail }>(
      `/issues/${encodeURIComponent(issueId)}`,
    );
    if (!response?.issue) {
      throw new CoreApiError("contract", "El núcleo no devolvió el expediente solicitado.", {
        code: "issue_missing",
      });
    }
    return response.issue;
  }

  private async fetchPage(filters: GovernmentCaseFilters = {}): Promise<Issue[]> {
    const params = new URLSearchParams();
    params.set("pageSize", "50");
    if (filters.query) params.set("q", filters.query);
    if (filters.colonia && filters.colonia !== "all") params.set("colonia", filters.colonia);
    if (filters.category && filters.category !== "all") {
      params.set("category", CATEGORY_TO_CORE[filters.category]);
    }
    const response = await coreRequest<PaginatedIssues>(`/issues?${params.toString()}`);
    return response.items ?? [];
  }

  private toCase(detail: IssueDetail, related: string[]): GovernmentCase {
    const issue = detail;
    const baseCategory = CORE_TO_CATEGORY[issue.category];
    const safetyConcern = detail.reports.some((report) => report.has_safety_concern);
    const safetyNote = detail.reports.find((report) => report.has_safety_concern)
      ? "Un reporte ciudadano marcó riesgo de seguridad o accesibilidad."
      : undefined;
    const independentReports = Math.max(1, issue.report_count);
    const breakdown = computePriorityBreakdown({
      reportedAt: issue.created_at,
      priority: "medium",
      supportCount: issue.support_count,
      independentReports,
      relatedCount: related.length,
      safetyConcern,
      safetyNote,
    });
    const derivedPriority = priorityFromBreakdown(breakdown, safetyConcern);
    const overrides = this.overridesFor(issue.issue_id);
    const status = overrides.status ?? OPERATIONAL_TO_STATUS[issue.operational_status](issue);
    const departmentId = overrides.departmentId ?? CATEGORY_DEPARTMENT[baseCategory];
    const governmentEvidence = issue.evidence
      .filter((entry) => entry.kind !== "citizen_followup")
      .map(mapEvidence)
      .map((entry) => ({ ...entry, departmentId: departmentId ?? "" }));
    return {
      id: issue.issue_id,
      folio: issue.display_id,
      title: issue.title,
      description: issue.description,
      category: baseCategory,
      colonia: issue.colonia,
      address: detail.reports[0]?.location.address_hint ?? issue.colonia,
      coordinates: coordinatesFor(issue.latitude, issue.longitude),
      status,
      priority: overrides.priority ?? derivedPriority,
      citizen: {
        name: "Ciudadanía (identidad protegida)",
        phoneMasked: "•••• ••••",
        emailMasked: "•••••@protegido",
        reportsCount: issue.report_count,
        supportCount: issue.support_count,
        safetyConcern,
        safetyNote,
      },
      photos: mapPhotos(detail.reports),
      observations: [],
      reportedAt: issue.created_at,
      updatedAt: issue.updated_at,
      departmentId,
      assignedOperatorId: overrides.operator?.id,
      assignedOperatorName: overrides.operator?.name,
      relatedCaseIds: related,
      publicOutcome: overrides.outcome,
      publishedAt: overrides.publishedAt,
      progress: progressFor(status),
      events: mapEvents(detail),
      officialRecord: mapOfficialRecord(detail.official_records[0]),
      communityVerification: mapCommunity(issue),
      priorityBreakdown: breakdown,
      independentReportCount: independentReports,
      governmentEvidence,
      completionClaims: [...overrides.claims],
      dispute: buildDispute(issue, overrides),
      source: "core",
      issueId: issue.issue_id,
      origin: issue.origin,
      externalStatus: issue.external_status,
      organizationId: issue.organization_id,
      organizationName: issue.organization_id
        ? this.orgNames[issue.organization_id] ?? issue.organization_id
        : undefined,
    };
  }

  private linkRelated(cases: GovernmentCase[]): GovernmentCase[] {
    const byColonia = new Map<string, GovernmentCase[]>();
    cases.forEach((item) => {
      const list = byColonia.get(item.colonia) ?? [];
      list.push(item);
      byColonia.set(item.colonia, list);
    });
    return cases.map((item) => {
      const siblings = (byColonia.get(item.colonia) ?? []).filter(
        (other) => other.id !== item.id,
      );
      return { ...item, relatedCaseIds: siblings.slice(0, 3).map((other) => other.id) };
    });
  }

  async listCases(filters: GovernmentCaseFilters = {}): Promise<GovernmentCase[]> {
    const items = await this.fetchPage(filters);
    const details: IssueDetail[] = [];
    const batchSize = 6;
    for (let index = 0; index < items.length; index += batchSize) {
      const batch = items.slice(index, index + batchSize);
      const resolved = await Promise.all(
        batch.map((issue) => this.fetchDetail(issue.issue_id).catch(() => null)),
      );
      resolved.forEach((detail) => {
        if (detail) details.push(detail);
      });
    }
    const mapped = this.linkRelated(details.map((detail) => this.toCase(detail, [])));
    return mapped.filter((item) => {
      if (filters.status && filters.status !== "all" && item.status !== filters.status) {
        return false;
      }
      if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) {
        return false;
      }
      return true;
    });
  }

  async getCase(id: string): Promise<GovernmentCase | null> {
    try {
      const detail = await this.fetchDetail(id);
      return this.toCase(detail, []);
    } catch (error) {
      if (error instanceof CoreApiError && error.kind === "not_found") return null;
      throw error;
    }
  }

  async getDashboard(): Promise<GovernmentDashboard> {
    const cases = await this.listCases();
    const open = cases.filter((item) => !["resolved", "closed"].includes(item.status));
    const categories = new Map<CaseCategory, number>();
    open.forEach((item) => categories.set(item.category, (categories.get(item.category) ?? 0) + 1));
    const colonias = new Map<string, { count: number; critical: number; resolved: number }>();
    cases.forEach((item) => {
      const entry = colonias.get(item.colonia) ?? { count: 0, critical: 0, resolved: 0 };
      entry.count += 1;
      if (item.priority === "critical") entry.critical += 1;
      if (["resolved", "closed"].includes(item.status)) entry.resolved += 1;
      colonias.set(item.colonia, entry);
    });
    const activity: ActivityItem[] = cases
      .flatMap((item) =>
        item.events.map((event) => ({
          id: `${item.id}-${event.id}`,
          at: event.at,
          title: `${event.label} · ${item.folio}`,
          detail: event.detail,
          kind:
            event.actor === "Citizen"
              ? ("verification" as const)
              : event.actor === "Specialist"
                ? ("dispatch" as const)
                : ("review" as const),
          caseId: item.id,
        })),
      )
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);
    const trend = Array.from({ length: 7 }).map((_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const received = cases.filter((item) => {
        const at = new Date(item.reportedAt).getTime();
        return at >= day.getTime() && at < next.getTime();
      }).length;
      const solved = cases.filter((item) => {
        const at = new Date(item.updatedAt).getTime();
        return at >= day.getTime() && at < next.getTime() && ["resolved", "closed"].includes(item.status);
      }).length;
      return {
        label: new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(day),
        received,
        resolved: solved,
      };
    });
    const priorityCase = [...open].sort(
      (a, b) => (b.priorityBreakdown?.score ?? 0) - (a.priorityBreakdown?.score ?? 0),
    )[0];
    return {
      counts: {
        open: open.length,
        review: open.filter((item) => item.status === "under_review").length,
        priority: open.filter((item) => ["high", "critical"].includes(item.priority)).length,
        unassigned: open.filter((item) => !item.departmentId).length,
        activeInterventions: open.filter((item) => item.status === "in_progress").length,
        pendingVerification: open.filter((item) => item.status === "pending_verification").length,
        completedInterventions: cases.filter((item) => ["resolved", "closed"].includes(item.status)).length,
      },
      categories: [...categories.entries()].map(([category, count]) => ({ category, count })),
      colonias: [...colonias.entries()].map(([colonia, entry]) => ({ colonia, ...entry })),
      trend,
      activity,
      aiInsight: {
        title: "Análisis asistido pendiente de Session 3",
        body:
          "La consola de gobierno no genera recomendaciones propias. Cuando Session 3 publique su contrato, este bloque mostrará el análisis con revisión humana.",
        support: "Sin modelo conectado en este entorno.",
        caseId: priorityCase?.id ?? "",
      },
      preventivePreview: [],
    };
  }

  async getCaseAnalysis(id: string): Promise<CaseAnalysis> {
    return {
      caseId: id,
      state: "unavailable",
      humanReviewRequired: true,
      limitations: [
        "El análisis asistido pertenece a Session 3 y aún no expone contrato HTTP.",
        "La consola no inventa recomendaciones ni puntajes de riesgo.",
      ],
    };
  }

  async getDispatchRecommendations(id: string): Promise<SpecialistRecommendation[]> {
    const category = (await this.getCase(id))?.category ?? "otros";
    return mockSpecialists.map((specialist) => ({
      specialist,
      matchReason:
        "Sugerencia del fixture de contrato de despacho (Ismael). No proviene de un servicio productivo.",
      qualificationMatch: specialist.qualification,
      coverageNote: `Cobertura declarada del fixture · categoría ${category}.`,
    }));
  }

  async updateCasePriority(id: string, priority: CasePriority): Promise<void> {
    this.overridesFor(id).priority = priority;
    this.emit();
  }

  private async postOperational(
    id: string,
    operationalStatus: Issue["operational_status"],
    note: string,
  ): Promise<void> {
    const organizationId = this.actor.organizationId;
    if (!organizationId) {
      throw new CoreApiError(
        "forbidden",
        "Tu cuenta no tiene una organización responsable asignada en VotaVía.",
        { code: "missing_organization" },
      );
    }
    await coreRequest(`/issues/${encodeURIComponent(id)}/operational`, {
      method: "POST",
      json: {
        operational_status: operationalStatus,
        organization_id: organizationId,
        note,
      },
    });
  }

  async updateCaseStatus(id: string, status: CaseStatus): Promise<void> {
    await this.postOperational(
      id,
      STATUS_TO_OPERATIONAL[status],
      "Actualización registrada desde la consola de gobierno.",
    );
    this.overridesFor(id).status = status;
    this.emit();
  }

  async assignDepartment(id: string, departmentId: string): Promise<void> {
    // Contrato pendiente: no existe endpoint de responsable distinto de organization_id.
    this.overridesFor(id).departmentId = departmentId;
    this.emit();
  }

  async assignOperator(id: string, operatorId: string, operatorName: string): Promise<void> {
    // Contrato pendiente: roster de operadores no expuesto por el núcleo.
    this.overridesFor(id).operator = { id: operatorId, name: operatorName };
    this.emit();
  }

  async getDispatchOrder(caseId: string): Promise<DispatchOrder | null> {
    const assignments = await this.dispatchGateway.getAssignments(caseId);
    const assignment = assignments[0];
    if (!assignment) return null;
    return this.mapOrder(assignment);
  }

  private mapOrder(assignment: DispatchAssignment): DispatchOrder {
    const stateMap: Record<DispatchAssignment["status"], DispatchState> = {
      pending: "authorized",
      accepted: "accepted",
      declined: "returned",
      in_progress: "in_progress",
      submitted_for_review: "completed",
      verified: "verified",
      returned: "returned",
      cancelled: "returned",
    };
    const state = stateMap[assignment.status];
    return {
      id: assignment.assignment_id,
      caseId: assignment.case_id,
      specialistId: assignment.specialist_id,
      state,
      createdAt: assignment.updated_at,
      timeline: [
        {
          id: `${assignment.assignment_id}-status`,
          at: assignment.updated_at,
          label: "Estado del despacho (fixture)",
          detail: `Asignación ${assignment.status}. Fuente: fixture del contrato de Ismael.`,
        },
      ],
      evidence: [],
    };
  }

  async authorizeDispatch(caseId: string, specialistId: string): Promise<DispatchOrder> {
    const detail = await this.fetchDetail(caseId);
    const request: DispatchRequest = {
      dispatch_request_id: `disp-${caseId}-${Date.now()}`,
      case_id: caseId,
      display_id: detail.display_id,
      category: detail.category,
      priority:
        detail.category === "road_damage" || detail.reports.some((r) => r.has_safety_concern)
          ? "urgent"
          : "medium",
      location: detail.reports[0]?.location ?? {
        latitude: detail.latitude,
        longitude: detail.longitude,
        colonia: detail.colonia,
        alcaldia: "CDMX",
      },
      requested_by: this.actor.userId,
      requested_at: new Date().toISOString(),
      notes: "Solicitud creada desde la consola de gobierno con fixture local.",
    };
    const created = await this.dispatchGateway.requestDispatch(request);
    const assignment = await this.dispatchGateway.assign(
      created.dispatch_request_id,
      specialistId,
      this.actor.userId,
    );
    this.emit();
    return this.mapOrder(assignment);
  }

  async advanceDispatch(caseId: string, state: DispatchState): Promise<void> {
    const assignment = (await this.dispatchGateway.getAssignments(caseId))[0];
    if (!assignment) {
      throw new CoreApiError("pending_contract", "No hay una asignación de despacho para avanzar.", {
        code: "dispatch_missing",
      });
    }
    const next = {
      recommended: "pending",
      authorized: "pending",
      accepted: "accepted",
      scheduled: "accepted",
      in_progress: "in_progress",
      completed: "submitted_for_review",
      verified: "verified",
      returned: "returned",
    }[state] as DispatchAssignment["status"];
    await this.dispatchGateway.updateAssignment(assignment.assignment_id, next, this.actor.userId);
    this.emit();
  }

  async verifyIntervention(caseId: string, decision: "verified" | "returned"): Promise<void> {
    const assignment = (await this.dispatchGateway.getAssignments(caseId))[0];
    if (!assignment) {
      throw new CoreApiError("pending_contract", "No hay una asignación de despacho por verificar.", {
        code: "dispatch_missing",
      });
    }
    await this.dispatchGateway.updateAssignment(
      assignment.assignment_id,
      decision === "verified" ? "verified" : "returned",
      this.actor.userId,
    );
    this.emit();
  }

  async publishOutcome(caseId: string, outcome: string): Promise<void> {
    await this.postOperational(
      caseId,
      "completed",
      "Publicación de resultado registrada desde la consola de gobierno.",
    );
    const overrides = this.overridesFor(caseId);
    overrides.outcome = outcome.trim();
    overrides.publishedAt = new Date().toISOString();
    overrides.status = "closed";
    this.emit();
  }

  private async uploadFile(caseId: string, input: GovernmentEvidenceInput): Promise<EvidenceItem> {
    const organizationId = this.actor.organizationId;
    if (!organizationId) {
      throw new CoreApiError(
        "forbidden",
        "Tu cuenta no tiene una organización responsable para cargar evidencia.",
        { code: "missing_organization" },
      );
    }
    const blob = dataUrlToBlob(input.url);
    if (!blob) {
      throw new CoreApiError(
        "validation",
        "La evidencia debe ser una imagen o archivo válido seleccionado en la consola.",
        { code: "invalid_evidence_file" },
      );
    }
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        kind: UI_KIND_TO_CORE[input.kind],
        caption: `${input.title} — ${input.note}`,
      }),
    );
    form.append("organization_id", organizationId);
    form.append(
      "photo",
      blob,
      input.fileName ?? `${input.kind}-${Date.now()}.png`,
    );
    const response = await coreRequest<{ evidence: EvidenceItem }>(
      `/issues/${encodeURIComponent(caseId)}/evidence`,
      { method: "POST", form },
    );
    if (!response?.evidence) {
      throw new CoreApiError("contract", "El núcleo no devolvió la evidencia creada.", {
        code: "evidence_missing",
      });
    }
    return response.evidence;
  }

  async uploadGovernmentEvidence(
    caseId: string,
    input: GovernmentEvidenceInput,
  ): Promise<GovernmentEvidenceRecord> {
    const evidence = await this.uploadFile(caseId, input);
    this.emit();
    return { ...mapEvidence(evidence), departmentId: input.departmentId, performedAt: input.performedAt };
  }

  async recordCompletionClaim(
    caseId: string,
    input: CompletionClaimInput,
  ): Promise<CompletionClaim> {
    if (!input.summary.trim()) {
      throw new CoreApiError("validation", "Describe la intervención realizada antes de cerrar.", {
        code: "missing_summary",
      });
    }
    await this.postOperational(
      caseId,
      "completed",
      `Cierre operativo declarado: ${input.summary.trim()}`,
    );
    const claim: CompletionClaim = {
      id: `claim-${Date.now()}`,
      claimedAt: new Date().toISOString(),
      claimedBy: input.claimedBy,
      departmentId: input.departmentId,
      summary: input.summary.trim(),
      evidenceIds: input.evidenceIds,
      operationalStatusAtClaim: "in_progress",
      note:
        "Cierre operativo de VotaVía. No reescribe el registro oficial, no marca verificación ciudadana y no elimina evidencia ni disputas.",
    };
    this.overridesFor(caseId).claims.push(claim);
    this.emit();
    return claim;
  }

  async respondToDispute(caseId: string, input: DisputeResponseInput): Promise<void> {
    if (!input.text.trim()) {
      throw new CoreApiError("validation", "Escribe una respuesta para la ciudadanía.", {
        code: "missing_response",
      });
    }
    let followUpId: string | undefined;
    if (input.followUpEvidence) {
      const evidence = await this.uploadFile(caseId, input.followUpEvidence);
      followUpId = evidence.evidence_id;
    }
    const overrides = this.overridesFor(caseId);
    overrides.disputeResponses.push({
      id: `dresp-${Date.now()}`,
      text: input.text.trim(),
      respondedAt: new Date().toISOString(),
      respondedBy: input.authorName,
      departmentId: input.departmentId,
      followUpEvidenceIds: followUpId ? [followUpId] : [],
    });
    this.emit();
  }

  async getPreventiveSignals(): Promise<RiskSignal[]> {
    return [];
  }
}

function dataUrlToBlob(url: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  try {
    if (isBase64) {
      const binary = atob(match[3]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(match[3])], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Fixture local del `DispatchGateway` de Ismael.
 * Implementa el contrato tipado, no un segundo backend. Se etiqueta como fixture
 * en todas las respuestas que consume la UI.
 */
export class FixtureDispatchGateway implements ConsoleDispatchGateway {
  private requests = new Map<string, DispatchRequest>();
  private assignments = new Map<string, DispatchAssignment>();

  async requestDispatch(input: DispatchRequest): Promise<DispatchRequest> {
    this.requests.set(input.dispatch_request_id, input);
    return input;
  }

  async assign(
    dispatchRequestId: string,
    specialistId: string,
    _assignee: string,
  ): Promise<DispatchAssignment> {
    const request = this.requests.get(dispatchRequestId);
    if (!request) throw new Error("Solicitud de despacho inexistente");
    const specialist =
      mockSpecialists.find((item) => item.id === specialistId) ?? mockSpecialists[0];
    const assignment: DispatchAssignment = {
      assignment_id: `asg-${dispatchRequestId}`,
      dispatch_request_id: dispatchRequestId,
      case_id: request.case_id,
      specialist_id: specialist.id,
      specialist_display_name: specialist.name,
      status: "pending",
      updated_at: new Date().toISOString(),
    };
    this.assignments.set(assignment.assignment_id, assignment);
    return assignment;
  }

  async getAssignments(caseId: string): Promise<DispatchAssignment[]> {
    return [...this.assignments.values()].filter((item) => item.case_id === caseId);
  }

  async updateAssignment(
    assignmentId: string,
    status: DispatchAssignment["status"],
    _actor: string,
  ): Promise<DispatchAssignment> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) throw new Error("Asignación de despacho inexistente");
    const next = { ...assignment, status, updated_at: new Date().toISOString() };
    this.assignments.set(assignmentId, next);
    return next;
  }
}
