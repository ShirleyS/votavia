/**
 * VotaVía — motor de reglas de despacho (Reglas de Despacho v1.0).
 *
 * Implementación determinista y sin efectos secundarios del manual operativo:
 * urgencia → enrutamiento → presupuesto → SLA → permisos.
 *
 * El motor **propone**; nunca escribe estado. El despachador confirma o
 * reasigna. Ninguna función de este módulo toca `external_status` ni
 * `community_verification_status`.
 */

// ---------------------------------------------------------------------------
// Tipos base
// ---------------------------------------------------------------------------

export const DISPATCH_CATEGORIES = [
  "road_damage",
  "street_lighting",
  "trees_vegetation",
  "sidewalk_accessibility",
  "waste_sanitation",
  "traffic_signals",
  "signage",
  "water_leak",
  "drainage",
  "parks_public_spaces",
  "other",
] as const;

export type DispatchCategory = (typeof DISPATCH_CATEGORIES)[number];

export type UrgencyLevel = "low" | "medium" | "high" | "critical";
export type DispatchTarget = "government" | "private";
export type DispatchRole = "responder" | "supervisor" | "admin";

export type BudgetVerdict =
  | "within_cap"
  | "requires_supervisor"
  | "exceeds_supervisor_cap"
  | "not_eligible";

export type SlaState = "on_track" | "at_risk" | "breached" | "not_applicable";

/** Alias aceptado por el manual (p. ej. `garbage`) → categoría canónica. */
const CATEGORY_ALIASES: Record<string, DispatchCategory> = {
  garbage: "waste_sanitation",
  waste: "waste_sanitation",
  water: "water_leak",
  agua: "water_leak",
  baches: "road_damage",
  alumbrado: "street_lighting",
  arboles: "trees_vegetation",
  banquetas: "sidewalk_accessibility",
  residuos: "waste_sanitation",
  semaforos: "traffic_signals",
  drenaje: "drainage",
};

export function normalizeCategory(category: string): DispatchCategory {
  if ((DISPATCH_CATEGORIES as readonly string[]).includes(category)) {
    return category as DispatchCategory;
  }
  if (CATEGORY_ALIASES[category]) return CATEGORY_ALIASES[category];
  return "other";
}

// ---------------------------------------------------------------------------
// Política de categorías (Tablas 3, 4 y 5)
// ---------------------------------------------------------------------------

export interface CategoryPolicy {
  label: string;
  /** Responsable gubernamental por regulación. */
  governmentOwner: string;
  /** `false` = exclusividad absoluta de gobierno (★). */
  admitsPrivate: boolean;
  /** Tope base que puede autorizar un `responder` (MXN). `null` = sin política. */
  baseCapMxn: number | null;
  /** Tope máximo con autorización de `supervisor` (MXN). */
  supervisorCapMxn: number | null;
  /** Evidencia exigida para liberar el pago. */
  requiredEvidence: string | null;
}

export const CATEGORY_POLICY: Record<DispatchCategory, CategoryPolicy> = {
  road_damage: {
    label: "Baches / pavimento",
    governmentOwner: "Obras y Servicios (Alcaldía)",
    admitsPrivate: true,
    baseCapMxn: 3000,
    supervisorCapMxn: 8000,
    requiredEvidence: "Foto antes/después + dimensiones",
  },
  street_lighting: {
    label: "Alumbrado público",
    governmentOwner: "Alumbrado Público (PAI)",
    admitsPrivate: true,
    baseCapMxn: 4000,
    supervisorCapMxn: 10000,
    requiredEvidence: "Foto antes/después + folio SAP",
  },
  trees_vegetation: {
    label: "Árboles / vegetación",
    governmentOwner: "Servicios Urbanos (Alcaldía)",
    admitsPrivate: true,
    baseCapMxn: 5000,
    supervisorCapMxn: 15000,
    requiredEvidence: "Foto + permiso ambiental",
  },
  sidewalk_accessibility: {
    label: "Banquetas / accesibilidad",
    governmentOwner: "Obras y Servicios (Alcaldía)",
    admitsPrivate: true,
    baseCapMxn: 4000,
    supervisorCapMxn: 12000,
    requiredEvidence: "Foto + dimensiones",
  },
  waste_sanitation: {
    label: "Limpia / residuos",
    governmentOwner: "Limpia y Traslado (PAI)",
    admitsPrivate: true,
    baseCapMxn: 2000,
    supervisorCapMxn: 6000,
    requiredEvidence: "Foto + volumen estimado",
  },
  traffic_signals: {
    label: "Semáforos / señalización vial",
    governmentOwner: "Secretaría de Movilidad",
    admitsPrivate: false,
    baseCapMxn: null,
    supervisorCapMxn: null,
    requiredEvidence: null,
  },
  signage: {
    label: "Señalamientos viales",
    governmentOwner: "Secretaría de Movilidad",
    admitsPrivate: false,
    baseCapMxn: null,
    supervisorCapMxn: null,
    requiredEvidence: null,
  },
  water_leak: {
    label: "Agua / drenaje",
    governmentOwner: "SACMEX",
    admitsPrivate: false,
    baseCapMxn: null,
    supervisorCapMxn: null,
    requiredEvidence: null,
  },
  drainage: {
    label: "Drenaje / alcantarillado",
    governmentOwner: "SACMEX",
    admitsPrivate: false,
    baseCapMxn: null,
    supervisorCapMxn: null,
    requiredEvidence: null,
  },
  parks_public_spaces: {
    label: "Parques y espacios públicos",
    governmentOwner: "Servicios Urbanos (Alcaldía)",
    admitsPrivate: false,
    baseCapMxn: null,
    supervisorCapMxn: null,
    requiredEvidence: null,
  },
  other: {
    label: "Otro",
    governmentOwner: "Mesa de gobierno",
    admitsPrivate: false,
    baseCapMxn: null,
    supervisorCapMxn: null,
    requiredEvidence: null,
  },
};

// ---------------------------------------------------------------------------
// 3. Urgencia
// ---------------------------------------------------------------------------

export type DimensionScore = 0 | 1 | 2 | 3;

export interface UrgencyInput {
  /** 3 = lesión ya ocurrida. */
  riskToPeople: DimensionScore;
  /** 3 = daño mayor (>20 cm, poste caído). */
  materialSeverity: DimensionScore;
  /** Apoyos ciudadanos deduplicados (`vv_pid`). */
  supportCount: number;
  /** 3 = crítico ya; 0 = puede esperar 72 h. */
  temporalSensitivity: DimensionScore;
}

export interface UrgencyResult {
  level: UrgencyLevel;
  score: number;
  /** Desglose para la bitácora y la UI. */
  breakdown: {
    riskPoints: number;
    severityPoints: number;
    populationPoints: number;
    temporalPoints: number;
  };
  /** `true` cuando `riskToPeople === 3` forza crítica. */
  forcedByRisk: boolean;
}

const POPULATION_POINTS = (supports: number): number =>
  supports >= 50 ? 2 : supports >= 20 ? 1 : 0;

export function levelFromScore(score: number): UrgencyLevel {
  if (score >= 7) return "critical";
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

/** Sección 3.5: `max(riesgo*3, severidad) + población + temporal`. */
export function scoreUrgency(input: UrgencyInput): UrgencyResult {
  const riskPoints = input.riskToPeople * 3;
  const severityPoints = input.materialSeverity;
  const populationPoints = POPULATION_POINTS(input.supportCount);
  const temporalPoints = input.temporalSensitivity;

  const raw = Math.max(riskPoints, severityPoints) + populationPoints + temporalPoints;
  const score = Math.min(raw, 13);
  const forcedByRisk = input.riskToPeople === 3;

  return {
    level: forcedByRisk ? "critical" : levelFromScore(score),
    score,
    breakdown: { riskPoints, severityPoints, populationPoints, temporalPoints },
    forcedByRisk,
  };
}

// ---------------------------------------------------------------------------
// 4. Enrutamiento (R-01 … R-04)
// ---------------------------------------------------------------------------

export interface RoutingInput {
  category: DispatchCategory;
  urgency: UrgencyLevel;
  /** Presupuesto disponible bajo el tope para esta categoría. */
  budgetAvailable: boolean;
  /** Existe al menos una organización con membresía verificada, capacidad y zona. */
  privateCapacity: boolean;
  /**
   * SLA *esperado* de gobierno para este caso, en horas. `null` = desconocido.
   * Sólo la excepción R-04 (urgencia media) lo usa.
   */
  expectedGovernmentSlaHours?: number | null;
  /** R-04: el supervisor autoriza particular en urgencia baja de alta visibilidad. */
  supervisorAuthorizedLowUrgencyPrivate?: boolean;
  /** Visibilidad social del caso (apoyos deduplicados). */
  supportCount?: number;
}

export interface RoutingResult {
  target: DispatchTarget;
  /** Regla que decidió (o `none` si fue el default). */
  rule: "R-01" | "R-02" | "R-03" | "R-04" | "default";
  /** Explicación legible para la bitácora. */
  reasons: string[];
  /** Por qué **no** se propuso particular, cuando aplica. */
  blockers: string[];
}

const HIGH_VISIBILITY_SUPPORTS = 100;

export function routeDispatch(input: RoutingInput): RoutingResult {
  const policy = CATEGORY_POLICY[input.category];
  const reasons: string[] = [];
  const blockers: string[] = [];

  // R-01 · Exclusividad de gobierno.
  if (!policy.admitsPrivate) {
    return {
      target: "government",
      rule: "R-01",
      reasons: [
        `${policy.label} es exclusiva de ${policy.governmentOwner} por regulación; no se ofrece a particulares.`,
      ],
      blockers: ["exclusividad_de_gobierno"],
    };
  }

  if (!input.privateCapacity) blockers.push("sin_capacidad_particular");
  if (!input.budgetAvailable) blockers.push("presupuesto_no_disponible");

  const privatePossible = input.privateCapacity && input.budgetAvailable;

  switch (input.urgency) {
    case "critical": {
      if (privatePossible) {
        return {
          target: "private",
          rule: "R-02",
          reasons: [
            "Urgencia crítica con presupuesto disponible y capacidad particular verificada.",
            "SLA objetivo de 2–4 horas.",
          ],
          blockers: [],
        };
      }
      reasons.push("Urgencia crítica, pero no hay capacidad particular o presupuesto disponible.");
      return { target: "government", rule: "R-02", reasons, blockers };
    }

    case "high": {
      if (privatePossible) {
        return {
          target: "private",
          rule: "R-03",
          reasons: ["Urgencia alta con disponibilidad particular.", "SLA objetivo de 8 horas."],
          blockers: [],
        };
      }
      reasons.push("Urgencia alta sin disponibilidad particular: se propone gobierno con SLA 24 h.");
      return { target: "government", rule: "R-03", reasons, blockers };
    }

    case "medium": {
      const sla = input.expectedGovernmentSlaHours;
      if (sla != null && sla > 24 && privatePossible) {
        return {
          target: "private",
          rule: "R-04",
          reasons: [
            `El SLA esperado de gobierno (${sla} h) excede 24 h; se ofrece particular.`,
          ],
          blockers: [],
        };
      }
      reasons.push("Urgencia media: gobierno por defecto.");
      if (sla == null) {
        reasons.push("SLA esperado de gobierno desconocido; no se aplica la excepción de 24 h.");
      } else if (sla <= 24) {
        reasons.push(`SLA esperado de gobierno (${sla} h) no excede 24 h.`);
      }
      return { target: "government", rule: "R-04", reasons, blockers };
    }

    case "low": {
      const visible = (input.supportCount ?? 0) >= HIGH_VISIBILITY_SUPPORTS;
      if (input.supervisorAuthorizedLowUrgencyPrivate && visible && privatePossible) {
        return {
          target: "private",
          rule: "R-04",
          reasons: [
            `Urgencia baja con alta visibilidad (${input.supportCount} apoyos) y autorización de supervisor.`,
          ],
          blockers: [],
        };
      }
      reasons.push("Urgencia baja: gobierno por defecto.");
      if (input.supervisorAuthorizedLowUrgencyPrivate && !visible) {
        reasons.push(`La autorización no aplica: se requieren ≥${HIGH_VISIBILITY_SUPPORTS} apoyos.`);
      }
      return { target: "government", rule: "R-04", reasons, blockers };
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Presupuesto
// ---------------------------------------------------------------------------

export interface BudgetInput {
  category: DispatchCategory;
  amountMxn: number;
  /** Rol de quien autoriza. */
  role: DispatchRole;
}

export interface BudgetResult {
  verdict: BudgetVerdict;
  allowed: boolean;
  requiresSupervisor: boolean;
  baseCapMxn: number | null;
  supervisorCapMxn: number | null;
  reasons: string[];
}

export function evaluateBudget(input: BudgetInput): BudgetResult {
  const policy = CATEGORY_POLICY[input.category];
  const { baseCapMxn, supervisorCapMxn } = policy;

  if (baseCapMxn == null || supervisorCapMxn == null) {
    return {
      verdict: "not_eligible",
      allowed: false,
      requiresSupervisor: false,
      baseCapMxn,
      supervisorCapMxn,
      reasons: [
        `${policy.label} no admite gasto con particulares; el caso regresa a ${policy.governmentOwner}.`,
      ],
    };
  }

  if (input.amountMxn < 0 || !Number.isFinite(input.amountMxn)) {
    return {
      verdict: "not_eligible",
      allowed: false,
      requiresSupervisor: false,
      baseCapMxn,
      supervisorCapMxn,
      reasons: ["Monto inválido."],
    };
  }

  if (input.amountMxn <= baseCapMxn) {
    return {
      verdict: "within_cap",
      allowed: true,
      requiresSupervisor: false,
      baseCapMxn,
      supervisorCapMxn,
      reasons: [`$${input.amountMxn} está dentro del tope base ($${baseCapMxn}).`],
    };
  }

  if (input.amountMxn <= supervisorCapMxn) {
    const canApprove = input.role === "supervisor" || input.role === "admin";
    return {
      verdict: "requires_supervisor",
      allowed: canApprove,
      requiresSupervisor: true,
      baseCapMxn,
      supervisorCapMxn,
      reasons: [
        `$${input.amountMxn} excede el tope base ($${baseCapMxn}) y requiere supervisor.`,
        canApprove
          ? `Autorizado por rol ${input.role}.`
          : "El rol del despachador no puede autorizar este monto.",
      ],
    };
  }

  return {
    verdict: "exceeds_supervisor_cap",
    allowed: false,
    requiresSupervisor: false,
    baseCapMxn,
    supervisorCapMxn,
    reasons: [
      `$${input.amountMxn} excede el tope con supervisor ($${supervisorCapMxn}).`,
      "El caso regresa a gobierno y debe documentarse el sobrecosto en la bitácora.",
    ],
  };
}

// ---------------------------------------------------------------------------
// 8. SLA
// ---------------------------------------------------------------------------

export interface SlaTarget {
  /** Objetivo en horas; `null` = no aplica (particular en urgencia baja). */
  targetHours: number | null;
  /** Ventana mínima (crítica: 2–4 h). */
  minHours?: number;
  /** Penalización por incumplimiento descrita en la Tabla 6. */
  penalty: string | null;
}

export function slaTarget(level: UrgencyLevel, target: DispatchTarget): SlaTarget {
  if (target === "private") {
    switch (level) {
      case "critical":
        return { targetHours: 4, minHours: 2, penalty: "Suspensión tras 1 incumplimiento" };
      case "high":
        return { targetHours: 8, penalty: "Suspensión tras 2 incumplimientos consecutivos" };
      case "medium":
        return { targetHours: 24, penalty: "Suspensión tras 3 incumplimientos consecutivos" };
      case "low":
        return { targetHours: null, penalty: null };
    }
  }

  switch (level) {
    case "critical":
      return { targetHours: 24, penalty: null };
    case "high":
      return { targetHours: 24, penalty: null };
    case "medium":
      return { targetHours: 48, penalty: null };
    case "low":
      return { targetHours: 72, penalty: null };
  }
}

const WARNING_RATIO = 0.8;

export interface SlaEvaluation {
  state: SlaState;
  targetHours: number | null;
  elapsedHours: number;
  remainingHours: number | null;
  /** 0–1; 1 = agotado. */
  ratio: number | null;
}

export function evaluateSla(params: {
  level: UrgencyLevel;
  target: DispatchTarget;
  assignedAt: Date;
  now: Date;
  /** Horas pausadas por falta de evidencia del ciudadano. */
  pausedHours?: number;
}): SlaEvaluation {
  const target = slaTarget(params.level, params.target);
  if (target.targetHours == null) {
    return {
      state: "not_applicable",
      targetHours: null,
      elapsedHours: 0,
      remainingHours: null,
      ratio: null,
    };
  }

  const paused = params.pausedHours ?? 0;
  const elapsedHours = Math.max(
    0,
    (params.now.getTime() - params.assignedAt.getTime()) / 3_600_000 - paused,
  );
  const remainingHours = target.targetHours - elapsedHours;
  const ratio = elapsedHours / target.targetHours;

  const state: SlaState = ratio >= 1 ? "breached" : ratio >= WARNING_RATIO ? "at_risk" : "on_track";

  return { state, targetHours: target.targetHours, elapsedHours, remainingHours, ratio };
}

// ---------------------------------------------------------------------------
// 10. Permisos por rol (Tabla 7)
// ---------------------------------------------------------------------------

export const DISPATCH_ACTIONS = [
  "assign_within_cap",
  "assign_above_cap",
  "reassign_government_to_private",
  "reassign_private_to_government",
  "recategorize",
  "suspend_specialist",
  "remove_organization",
  "adjust_budget_caps",
] as const;

export type DispatchAction = (typeof DISPATCH_ACTIONS)[number];

const PERMISSIONS: Record<DispatchAction, DispatchRole[]> = {
  assign_within_cap: ["responder", "supervisor", "admin"],
  assign_above_cap: ["supervisor", "admin"],
  reassign_government_to_private: ["supervisor", "admin"],
  reassign_private_to_government: ["responder", "supervisor", "admin"],
  recategorize: ["supervisor", "admin"],
  suspend_specialist: ["supervisor", "admin"],
  remove_organization: ["admin"],
  adjust_budget_caps: ["admin"],
};

export function canPerform(role: DispatchRole, action: DispatchAction): boolean {
  return PERMISSIONS[action].includes(role);
}

// ---------------------------------------------------------------------------
// Eventos y regla de oro
// ---------------------------------------------------------------------------

export const DISPATCH_EVENT_TYPES = [
  "dispatch_assigned",
  "dispatch_reassigned",
  "budget_approved",
  "budget_rejected",
  "specialist_suspended",
  "category_recategorized",
  "sla_breached",
  "case_triaged",
  "case_in_progress",
  "case_completed",
  "case_cancelled",
] as const;

export type DispatchEventType = (typeof DISPATCH_EVENT_TYPES)[number];

/**
 * Sección 12.3: un cierre operativo **no** escribe verificación ciudadana.
 * Devuelve el estado de verificación resultante de un cierre, o lanza si se
 * intenta saltar la regla de oro.
 */
export function communityVerificationOnCompletion(attempted?: string): "unreviewed" {
  if (attempted && attempted !== "unreviewed") {
    throw new DispatchRuleError(
      "golden_rule_violation",
      "El cierre operativo sólo puede abrir la verificación comunitaria (`unreviewed`).",
    );
  }
  return "unreviewed";
}

export class DispatchRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DispatchRuleError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 11. Casos límite
// ---------------------------------------------------------------------------

export interface CategoryConflict {
  category: DispatchCategory;
  recategorized: boolean;
  source: "official" | "citizen";
  reason: string;
}

/**
 * 11.3: cuando el registro oficial contradice al ciudadano, predomina el
 * oficial. La decisión final sigue siendo humana.
 */
export function resolveCategoryConflict(params: {
  citizenCategory: DispatchCategory;
  officialCategory: DispatchCategory | null;
}): CategoryConflict {
  const { citizenCategory, officialCategory } = params;
  if (!officialCategory || officialCategory === citizenCategory) {
    return {
      category: citizenCategory,
      recategorized: false,
      source: "citizen",
      reason: "Sin contradicción con el registro oficial.",
    };
  }
  return {
    category: officialCategory,
    recategorized: true,
    source: "official",
    reason: `El registro oficial clasifica el caso como "${CATEGORY_POLICY[officialCategory].label}", distinto de "${CATEGORY_POLICY[citizenCategory].label}". Predomina el registro oficial; el supervisor debe confirmar la recategorización.`,
  };
}

/** 11.4: apoyos anómalos → revisión humana antes de recalcular urgencia. */
export function needsSupportAudit(params: {
  supportsFromSameDevice: number;
  supportingDevices: number;
  supportCount: number;
}): boolean {
  if (params.supportingDevices === 0) return false;
  const perDevice = params.supportsFromSameDevice / params.supportingDevices;
  return params.supportsFromSameDevice >= 10 || perDevice >= 0.5;
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

export interface DispatchEvaluationInput {
  category: DispatchCategory;
  urgency: UrgencyInput;
  role: DispatchRole;
  /** Monto propuesto para particular (sólo si el destino es particular). */
  budgetAmountMxn?: number;
  privateCapacity: boolean;
  budgetAvailable: boolean;
  expectedGovernmentSlaHours?: number | null;
  supervisorAuthorizedLowUrgencyPrivate?: boolean;
}

export interface DispatchProposal {
  category: DispatchCategory;
  urgency: UrgencyResult;
  routing: RoutingResult;
  budget: BudgetResult | null;
  sla: SlaTarget;
  /** Permiso del rol actual para ejecutar la propuesta. */
  allowedByRole: boolean;
  /** Resumen para mostrar al despachador. */
  summary: string;
}

export function evaluateDispatch(input: DispatchEvaluationInput): DispatchProposal {
  const urgency = scoreUrgency(input.urgency);
  const routing = routeDispatch({
    category: input.category,
    urgency: urgency.level,
    budgetAvailable: input.budgetAvailable,
    privateCapacity: input.privateCapacity,
    expectedGovernmentSlaHours: input.expectedGovernmentSlaHours ?? null,
    supervisorAuthorizedLowUrgencyPrivate: input.supervisorAuthorizedLowUrgencyPrivate,
    supportCount: input.urgency.supportCount,
  });

  let budget: BudgetResult | null = null;
  if (routing.target === "private") {
    budget = evaluateBudget({
      category: input.category,
      amountMxn: input.budgetAmountMxn ?? 0,
      role: input.role,
    });
  }

  const sla = slaTarget(urgency.level, routing.target);

  // Tabla 7: asignar dentro del tope lo puede hacer un responder; por encima,
  // sólo supervisor/admin. El permiso del rol y la aprobación presupuestal
  // deben cumplirse ambos.
  const action: DispatchAction =
    budget?.verdict === "requires_supervisor" ? "assign_above_cap" : "assign_within_cap";
  const allowedByRole = canPerform(input.role, action) && (budget?.allowed ?? true);

  const budgetNote =
    budget == null
      ? "sin gasto con particulares"
      : budget.verdict === "within_cap"
        ? `dentro del tope ($${budget.baseCapMxn})`
        : budget.verdict === "requires_supervisor"
          ? `requiere supervisor ($${budget.baseCapMxn}–$${budget.supervisorCapMxn})`
          : "excede el tope con supervisor";

  const slaNote = sla.targetHours ? `SLA ${sla.targetHours} h` : "SLA no aplica";

  return {
    category: input.category,
    urgency,
    routing,
    budget,
    sla,
    allowedByRole,
    summary: `${CATEGORY_POLICY[input.category].label} · urgencia ${urgency.level} (${urgency.score}/13) → ${routing.target === "private" ? "particular" : "gobierno"} · ${slaNote} · ${budgetNote}`,
  };
}
