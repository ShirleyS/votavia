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
  DispatchOrder,
  DispatchState,
  GovernmentCase,
  GovernmentCaseFilters,
  GovernmentDashboard,
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

function loadStore(): MockStore {
  if (typeof window === "undefined") return initialStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialStore();
    const parsed = JSON.parse(raw) as MockStore;
    if (!Array.isArray(parsed.cases) || !Array.isArray(parsed.orders)) {
      return initialStore();
    }
    return parsed;
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
        "La evidencia fue validada por gobierno. Falta publicar el resultado.",
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

  async getPreventiveSignals(): Promise<RiskSignal[]> {
    return clone(mockRiskSignals);
  }

  resetMockData(): void {
    this.store = initialStore();
    this.emit();
  }
}

export const governmentService = new MockGovernmentService();
