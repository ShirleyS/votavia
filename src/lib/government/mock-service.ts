import {
  createFallbackAnalysis,
  mockActivity,
  mockAnalyses,
  mockCases,
  mockDispatchOrders,
  mockRiskSignals,
  mockSpecialists,
  mockTrend,
} from "./mock-data";
import type {
  ActivityItem,
  CaseAnalysis,
  CasePriority,
  CaseStatus,
  CompletionClaim,
  CompletionClaimInput,
  DisputeResponseInput,
  DispatchBoardItem,
  DispatchOrder,
  DispatchState,
  GovernmentCase,
  GovernmentCaseFilters,
  GovernmentDashboard,
  GovernmentEvidenceInput,
  GovernmentEvidenceRecord,
  GovernmentService,
  RiskSignal,
  SpecialistRecommendation,
} from "./types";

interface MockStore {
  cases: GovernmentCase[];
  orders: DispatchOrder[];
  activity: ActivityItem[];
}

const STORAGE_KEY = "votavia-government-mock-v2";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function initialStore(): MockStore {
  return {
    cases: clone(mockCases),
    orders: clone(mockDispatchOrders),
    activity: clone(mockActivity),
  };
}

function migrateStoredCases(cases: GovernmentCase[]): GovernmentCase[] {
  return cases.map((stored) => {
    const seed = mockCases.find((item) => item.id === stored.id);
    if (!seed) return stored;
    return {
      ...clone(seed),
      ...stored,
      officialRecord: stored.officialRecord ?? seed.officialRecord,
      communityVerification:
        stored.communityVerification ?? seed.communityVerification,
      priorityBreakdown: stored.priorityBreakdown ?? seed.priorityBreakdown,
      independentReportCount:
        stored.independentReportCount ?? seed.independentReportCount,
      governmentEvidence:
        stored.governmentEvidence ?? seed.governmentEvidence,
      completionClaims: stored.completionClaims ?? seed.completionClaims,
      dispute: stored.dispute ?? seed.dispute,
      assignedOperatorId:
        stored.assignedOperatorId ?? seed.assignedOperatorId,
      assignedOperatorName:
        stored.assignedOperatorName ?? seed.assignedOperatorName,
    };
  });
}

function loadStore(): MockStore {
  if (typeof window === "undefined") return initialStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialStore();
    const parsed = JSON.parse(raw) as MockStore;
    if (!Array.isArray(parsed.cases) || !Array.isArray(parsed.orders)) {
      return initialStore();
    }
    return {
      cases: migrateStoredCases(parsed.cases),
      orders: parsed.orders,
      activity: Array.isArray(parsed.activity) ? parsed.activity : clone(mockActivity),
    };
  } catch {
    return initialStore();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function recommendationOrder(category: GovernmentCase["category"]): string[] {
  const byCategory: Record<GovernmentCase["category"], string[]> = {
    agua: ["sp-4", "sp-2", "sp-1", "sp-3", "sp-5", "sp-6"],
    drenaje: ["sp-4", "sp-2", "sp-6", "sp-3", "sp-1", "sp-5"],
    baches: ["sp-2", "sp-3", "sp-4", "sp-6", "sp-1", "sp-5"],
    alumbrado: ["sp-1", "sp-3", "sp-2", "sp-5", "sp-4", "sp-6"],
    movilidad: ["sp-3", "sp-2", "sp-1", "sp-5", "sp-6", "sp-4"],
    parques: ["sp-5", "sp-2", "sp-3", "sp-4", "sp-6", "sp-1"],
    residuos: ["sp-6", "sp-5", "sp-3", "sp-2", "sp-1", "sp-4"],
    seguridad: ["sp-3", "sp-1", "sp-5", "sp-2", "sp-4", "sp-6"],
    otros: ["sp-3", "sp-2", "sp-1", "sp-5", "sp-6", "sp-4"],
  };
  return byCategory[category];
}

export class MockGovernmentService implements GovernmentService {
  private store: MockStore = loadStore();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
    } catch {
      // Session state still works if storage is unavailable.
    }
  }

  private emit(): void {
    this.persist();
    this.listeners.forEach((listener) => listener());
  }

  private findCase(id: string): GovernmentCase {
    const found = this.store.cases.find((item) => item.id === id);
    if (!found) throw new Error(`Caso no encontrado: ${id}`);
    return found;
  }

  private addActivity(item: Omit<ActivityItem, "id" | "at">): void {
    this.store.activity.unshift({
      ...item,
      id: `act-${Date.now()}`,
      at: nowIso(),
    });
    this.store.activity = this.store.activity.slice(0, 30);
  }

  private addCaseEvent(
    item: GovernmentCase,
    label: string,
    detail: string,
    actor: GovernmentCase["events"][number]["actor"],
  ): void {
    item.events.push({
      id: `evt-${Date.now()}-${item.events.length}`,
      at: nowIso(),
      label,
      detail,
      actor,
    });
    item.updatedAt = nowIso();
  }

  async getDashboard(): Promise<GovernmentDashboard> {
    const cases = this.store.cases;
    const orders = this.store.orders;
    const openCases = cases.filter(
      (item) => item.status !== "resolved" && item.status !== "closed",
    );
    const categoryCount = openCases.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.category] = (acc[item.category] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const coloniaMap = new Map<
      string,
      { count: number; critical: number; resolved: number }
    >();
    cases.forEach((item) => {
      const current = coloniaMap.get(item.colonia) ?? {
        count: 0,
        critical: 0,
        resolved: 0,
      };
      current.count += 1;
      if (item.priority === "critical" || item.priority === "high") {
        current.critical += 1;
      }
      if (item.status === "resolved" || item.status === "closed") {
        current.resolved += 1;
      }
      coloniaMap.set(item.colonia, current);
    });

    return {
      counts: {
        open: openCases.length,
        review: cases.filter((item) =>
          ["reported", "under_review"].includes(item.status),
        ).length,
        priority: openCases.filter((item) =>
          ["high", "critical"].includes(item.priority),
        ).length,
        unassigned: openCases.filter((item) => !item.departmentId).length,
        activeInterventions: orders.filter((order) =>
          ["accepted", "scheduled", "in_progress"].includes(order.state),
        ).length,
        pendingVerification: cases.filter(
          (item) => item.status === "pending_verification",
        ).length,
        completedInterventions: orders.filter((order) =>
          ["completed", "verified"].includes(order.state),
        ).length,
      },
      categories: Object.entries(categoryCount)
        .map(([category, count]) => ({
          category: category as GovernmentCase["category"],
          count,
        }))
        .sort((a, b) => b.count - a.count),
      colonias: Array.from(coloniaMap.entries())
        .map(([colonia, values]) => ({ colonia, ...values }))
        .sort((a, b) => b.count - a.count),
      trend: clone(mockTrend),
      activity: clone(this.store.activity.slice(0, 7)),
      aiInsight: {
        title: "Posible relación entre fuga y reportes cercanos",
        body: "La fuga de Roma Norte comparte tramo y tipo de afectación con dos reportes recientes. Conviene revisar la red antes de autorizar pavimento.",
        support: "3 reportes · 2 observaciones vecinales",
        caseId: "case-0847",
      },
      preventivePreview: clone(mockRiskSignals.slice(0, 3)),
    };
  }

  async listCases(
    filters: GovernmentCaseFilters = {},
  ): Promise<GovernmentCase[]> {
    const query = filters.query?.trim().toLowerCase() ?? "";
    return clone(
      this.store.cases
        .filter((item) => {
          if (filters.category && filters.category !== "all" && item.category !== filters.category) return false;
          if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
          if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) return false;
          if (filters.colonia && filters.colonia !== "all" && item.colonia !== filters.colonia) return false;
          if (!query) return true;
          return [item.title, item.folio, item.description, item.address, item.colonia]
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    );
  }

  async getCase(id: string): Promise<GovernmentCase | null> {
    const found = this.store.cases.find((item) => item.id === id);
    return found ? clone(found) : null;
  }

  async getCaseAnalysis(id: string): Promise<CaseAnalysis> {
    const analysis = mockAnalyses[id];
    return clone(analysis ?? createFallbackAnalysis(id));
  }

  async updateCasePriority(id: string, priority: CasePriority): Promise<void> {
    const item = this.findCase(id);
    item.priority = priority;
    this.addCaseEvent(
      item,
      "Prioridad actualizada",
      `La mesa de gobierno cambió la prioridad a ${priority}.`,
      "Government",
    );
    this.addActivity({
      title: `Prioridad actualizada · ${item.folio}`,
      detail: `Nueva prioridad registrada en el caso ${item.folio}.`,
      kind: "review",
      caseId: id,
    });
    this.emit();
  }

  async updateCaseStatus(id: string, status: CaseStatus): Promise<void> {
    const item = this.findCase(id);
    item.status = status;
    if (status === "in_progress") item.progress = Math.max(item.progress, 60);
    if (status === "resolved") item.progress = 100;
    this.addCaseEvent(
      item,
      "Estado actualizado",
      `El caso cambió a estado ${status}.`,
      "Government",
    );
    this.emit();
  }

  async assignDepartment(id: string, departmentId: string): Promise<void> {
    const item = this.findCase(id);
    item.departmentId = departmentId;
    if (["reported", "under_review"].includes(item.status)) {
      item.status = "assigned";
    }
    item.progress = Math.max(item.progress, 28);
    this.addCaseEvent(
      item,
      "Departamento asignado",
      "La mesa de gobierno definió el área responsable del caso.",
      "Government",
    );
    this.addActivity({
      title: `Caso asignado · ${item.folio}`,
      detail: "Se definió el área responsable para dar seguimiento.",
      kind: "dispatch",
      caseId: id,
    });
    this.emit();
  }

  async assignOperator(
    id: string,
    operatorId: string,
    operatorName: string,
  ): Promise<void> {
    const item = this.findCase(id);
    item.assignedOperatorId = operatorId;
    item.assignedOperatorName = operatorName;
    this.addCaseEvent(
      item,
      "Operador asignado",
      `${operatorName} quedó a cargo del seguimiento operativo del caso.`,
      "Government",
    );
    this.addActivity({
      title: `Responsable operativo actualizado · ${item.folio}`,
      detail: `${operatorName} recibió el seguimiento del caso.`,
      kind: "review",
      caseId: id,
    });
    this.emit();
  }

  async getDispatchRecommendations(
    id: string,
  ): Promise<SpecialistRecommendation[]> {
    const item = this.findCase(id);
    return recommendationOrder(item.category)
      .map((specialistId) => mockSpecialists.find((spec) => spec.id === specialistId))
      .filter((spec) => Boolean(spec))
      .slice(0, 3)
      .map((spec) => {
        const specialist = clone(spec!);
        return {
          specialist,
          matchReason:
            item.departmentId && specialist.coverage.includes(item.colonia)
              ? `Cobertura confirmada en ${item.colonia} y especialidad alineada al reporte.`
              : `Especialidad compatible con ${item.category}; requiere confirmar cobertura.`,
          qualificationMatch: `Cumple: ${specialist.qualification}`,
          coverageNote: specialist.coverage.includes(item.colonia)
            ? `Atiende ${item.colonia}`
            : `Cobertura cercana: ${specialist.coverage.slice(0, 2).join(", ")}`,
        };
      });
  }

  async getDispatchOrder(caseId: string): Promise<DispatchOrder | null> {
    const order = this.store.orders.find((item) => item.caseId === caseId);
    return order ? clone(order) : null;
  }

  async listDispatchBoard(): Promise<DispatchBoardItem[]> {
    return this.store.orders.map((order) => ({
      assignmentId: order.id,
      caseId: order.caseId,
      specialistId: order.specialistId,
      specialistName:
        mockSpecialists.find((spec) => spec.id === order.specialistId)?.name ??
        order.specialistId,
      state: order.state,
      createdAt: order.createdAt,
      updatedAt: order.timeline.at(-1)?.at ?? order.createdAt,
    }));
  }

  async authorizeDispatch(
    caseId: string,
    specialistId: string,
  ): Promise<DispatchOrder> {
    const item = this.findCase(caseId);
    const specialist = mockSpecialists.find((spec) => spec.id === specialistId);
    if (!specialist) throw new Error("Especialista no encontrado");
    let order = this.store.orders.find((entry) => entry.caseId === caseId);
    const at = nowIso();
    if (order) {
      order.specialistId = specialistId;
      order.state = "authorized";
      order.timeline.push({
        id: `dt-${Date.now()}`,
        at,
        label: "Asignación autorizada",
        detail: `Se autorizó a ${specialist.name} para atender el caso.`,
      });
    } else {
      order = {
        id: `ord-${Date.now()}`,
        caseId,
        specialistId,
        state: "authorized",
        createdAt: at,
        timeline: [
          {
            id: `dt-${Date.now()}`,
            at,
            label: "Asignación autorizada",
            detail: `Se autorizó a ${specialist.name} para atender el caso.`,
          },
        ],
        evidence: [],
      };
      this.store.orders.push(order);
    }
    item.assignedSpecialistId = specialistId;
    item.status = "assigned";
    item.progress = Math.max(item.progress, 35);
    this.addCaseEvent(
      item,
      "Despacho autorizado",
      `${specialist.name} fue autorizado para atender el caso.`,
      "Government",
    );
    this.addActivity({
      title: `Despacho autorizado · ${item.folio}`,
      detail: `${specialist.name} recibió la orden de trabajo.`,
      kind: "dispatch",
      caseId,
    });
    this.emit();
    return clone(order);
  }

  async advanceDispatch(caseId: string, state: DispatchState): Promise<void> {
    const item = this.findCase(caseId);
    const order = this.store.orders.find((entry) => entry.caseId === caseId);
    if (!order) throw new Error("No existe una orden de despacho");
    const labels: Record<DispatchState, string> = {
      recommended: "Recomendación actualizada",
      authorized: "Asignación autorizada",
      accepted: "Especialista aceptó",
      scheduled: "Visita programada",
      in_progress: "Trabajo iniciado",
      completed: "Trabajo terminado",
      verified: "Trabajo verificado",
      returned: "Trabajo devuelto",
    };
    order.state = state;
    order.timeline.push({
      id: `dt-${Date.now()}`,
      at: nowIso(),
      label: labels[state],
      detail: "Actualización registrada desde la consola de gobierno.",
    });
    if (state === "in_progress") {
      item.status = "in_progress";
      item.progress = Math.max(item.progress, 62);
    }
    if (state === "completed") {
      item.status = "pending_verification";
      item.progress = Math.max(item.progress, 82);
    }
    this.addCaseEvent(item, labels[state], "Actualización de la orden de trabajo.", "Government");
    this.emit();
  }

  async verifyIntervention(
    caseId: string,
    decision: "verified" | "returned",
  ): Promise<void> {
    const item = this.findCase(caseId);
    const order = this.store.orders.find((entry) => entry.caseId === caseId);
    if (!order) throw new Error("No existe una orden de despacho para verificar");
    if (decision === "verified") {
      order.state = "verified";
      order.timeline.push({
        id: `dt-${Date.now()}`,
        at: nowIso(),
        label: "Trabajo verificado",
        detail: "Gobierno validó la evidencia y cerró la intervención.",
      });
      item.status = "resolved";
      item.progress = 100;
      this.addCaseEvent(
        item,
        "Intervención verificada",
        "La evidencia fue validada operativamente por gobierno. La verificación ciudadana conserva su propio estado.",
        "Government",
      );
    } else {
      order.state = "returned";
      order.timeline.push({
        id: `dt-${Date.now()}`,
        at: nowIso(),
        label: "Trabajo devuelto",
        detail: "Gobierno solicitó corrección y nueva evidencia.",
      });
      item.status = "in_progress";
      item.progress = Math.min(item.progress, 70);
      this.addCaseEvent(
        item,
        "Intervención devuelta",
        "Se solicitó al especialista corregir el trabajo y cargar nueva evidencia.",
        "Government",
      );
    }
    this.addActivity({
      title: `${decision === "verified" ? "Intervención verificada" : "Intervención devuelta"} · ${item.folio}`,
      detail:
        decision === "verified"
          ? "La evidencia del especialista fue aprobada."
          : "Se solicitó corrección al especialista.",
      kind: "verification",
      caseId,
    });
    this.emit();
  }

  async publishOutcome(caseId: string, outcome: string): Promise<void> {
    const item = this.findCase(caseId);
    if (
      item.dispute?.status === "open" ||
      item.communityVerification?.status === "disputed"
    ) {
      throw new Error(
        "No se puede publicar un cierre mientras la ciudadanía mantenga una disputa abierta.",
      );
    }
    item.publicOutcome = outcome.trim();
    item.publishedAt = nowIso();
    item.status = "closed";
    item.progress = 100;
    this.addCaseEvent(
      item,
      "Resultado publicado",
      "El dictamen y la evidencia final ya son visibles para la ciudadanía.",
      "Government",
    );
    this.addActivity({
      title: `Resultado publicado · ${item.folio}`,
      detail: "El cierre del caso ya es público.",
      kind: "publication",
      caseId,
    });
    this.emit();
  }

  async uploadGovernmentEvidence(
    caseId: string,
    input: GovernmentEvidenceInput,
  ): Promise<GovernmentEvidenceRecord> {
    const item = this.findCase(caseId);
    if (!input.title.trim() || !input.note.trim() || !input.url) {
      throw new Error("La evidencia requiere título, descripción y archivo.");
    }
    const record: GovernmentEvidenceRecord = {
      id: `gev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: input.kind,
      title: input.title.trim(),
      note: input.note.trim(),
      url: input.url,
      fileName: input.fileName,
      performedAt: input.performedAt,
      submittedAt: nowIso(),
      departmentId: input.departmentId,
      operatorName: input.operatorName,
      authorId: input.authorId,
    };
    item.governmentEvidence = [...(item.governmentEvidence ?? []), record];
    this.addCaseEvent(
      item,
      "Evidencia de gobierno cargada",
      `${record.title} · ${record.operatorName}. Queda en el historial auditable.`,
      "Government",
    );
    this.addActivity({
      title: `Evidencia cargada · ${item.folio}`,
      detail: `${record.operatorName} agregó ${record.title}.`,
      kind: "verification",
      caseId,
    });
    this.emit();
    return clone(record);
  }

  async recordCompletionClaim(
    caseId: string,
    input: CompletionClaimInput,
  ): Promise<CompletionClaim> {
    const item = this.findCase(caseId);
    if (!input.summary.trim()) {
      throw new Error("Describe la intervención realizada antes de declarar el cierre.");
    }
    const evidence = item.governmentEvidence ?? [];
    const validEvidenceIds = input.evidenceIds.filter((evidenceId) =>
      evidence.some((entry) => entry.id === evidenceId),
    );
    if (validEvidenceIds.length === 0) {
      throw new Error("Asocia al menos una evidencia de gobierno al cierre operativo.");
    }

    const claim: CompletionClaim = {
      id: `claim-${Date.now()}`,
      claimedAt: nowIso(),
      claimedBy: input.claimedBy,
      departmentId: input.departmentId,
      summary: input.summary.trim(),
      evidenceIds: validEvidenceIds,
      operationalStatusAtClaim: item.status,
      note:
        "Cierre operativo de VotaVía. No reescribe el registro oficial importado, no elimina evidencia previa y no modifica la verificación ciudadana.",
    };
    item.completionClaims = [...(item.completionClaims ?? []), claim];
    item.status = "pending_verification";
    item.progress = Math.max(item.progress, 88);
    this.addCaseEvent(
      item,
      "Cierre operativo declarado",
      `${input.claimedBy} registró un aviso de trabajo terminado. La verificación ciudadana sigue siendo independiente.`,
      "Government",
    );
    this.addActivity({
      title: `Trabajo declarado terminado · ${item.folio}`,
      detail: "El aviso de cierre espera revisión y validación ciudadana.",
      kind: "verification",
      caseId,
    });
    this.emit();
    return clone(claim);
  }

  async respondToDispute(
    caseId: string,
    input: DisputeResponseInput,
  ): Promise<void> {
    const item = this.findCase(caseId);
    if (!item.dispute) throw new Error("Este caso no tiene una disputa activa.");
    if (!input.text.trim()) throw new Error("Escribe una respuesta para la ciudadanía.");

    let followUpId: string | undefined;
    if (input.followUpEvidence) {
      const evidence = await this.uploadGovernmentEvidence(
        caseId,
        input.followUpEvidence,
      );
      followUpId = evidence.id;
    }

    item.dispute.responses.push({
      id: `dresp-${Date.now()}`,
      text: input.text.trim(),
      respondedAt: nowIso(),
      respondedBy: input.authorName,
      departmentId: input.departmentId,
      followUpEvidenceIds: followUpId ? [followUpId] : [],
    });
    item.dispute.status = "responded";
    this.addCaseEvent(
      item,
      "Respuesta a la disputa ciudadana",
      `${input.authorName} respondió sin cambiar el resultado de verificación ciudadana.`,
      "Government",
    );
    this.addActivity({
      title: `Disputa atendida · ${item.folio}`,
      detail: "La mesa de gobierno agregó una respuesta y conservó la evidencia original.",
      kind: "verification",
      caseId,
    });
    this.emit();
  }

  async getPreventiveSignals(): Promise<RiskSignal[]> {
    return clone(mockRiskSignals);
  }

  resetMockData(): void {
    this.store = initialStore();
    this.emit();
  }
}

export const governmentService = new MockGovernmentService();
