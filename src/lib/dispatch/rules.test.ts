import { describe, expect, it } from "vitest";
import {
  CATEGORY_POLICY,
  canPerform,
  communityVerificationOnCompletion,
  DispatchRuleError,
  evaluateBudget,
  evaluateDispatch,
  evaluateSla,
  levelFromScore,
  needsSupportAudit,
  normalizeCategory,
  resolveCategoryConflict,
  routeDispatch,
  scoreUrgency,
  slaTarget,
} from "./rules";

describe("urgencia (sección 3.5)", () => {
  it("calcula max(riesgo*3, severidad) + población + temporal", () => {
    const result = scoreUrgency({
      riskToPeople: 2,
      materialSeverity: 3,
      supportCount: 60,
      temporalSensitivity: 2,
    });
    expect(result.breakdown).toEqual({
      riskPoints: 6,
      severityPoints: 3,
      populationPoints: 2,
      temporalPoints: 2,
    });
    expect(result.score).toBe(10);
    expect(result.level).toBe("critical");
  });

  it("fuerza crítica cuando hay riesgo a personas = 3", () => {
    const result = scoreUrgency({
      riskToPeople: 3,
      materialSeverity: 0,
      supportCount: 0,
      temporalSensitivity: 0,
    });
    expect(result.level).toBe("critical");
    expect(result.forcedByRisk).toBe(true);
  });

  it.each([
    [0, "low"],
    [2, "low"],
    [3, "medium"],
    [4, "medium"],
    [5, "high"],
    [6, "high"],
    [7, "critical"],
    [13, "critical"],
  ] as const)("umbral %i → %s", (score, level) => {
    expect(levelFromScore(score)).toBe(level);
  });

  it("compone el puntaje con las cuatro dimensiones", () => {
    // severidad 2 + población 1 (25 apoyos) + temporal 1 = 4 → media
    const result = scoreUrgency({
      riskToPeople: 0,
      materialSeverity: 2,
      supportCount: 25,
      temporalSensitivity: 1,
    });
    expect(result.score).toBe(4);
    expect(result.level).toBe("medium");
  });

  it("puntaje de población sigue los tramos 20/50", () => {
    const base = { riskToPeople: 0, materialSeverity: 0, temporalSensitivity: 0 } as const;
    expect(scoreUrgency({ ...base, supportCount: 19 }).breakdown.populationPoints).toBe(0);
    expect(scoreUrgency({ ...base, supportCount: 20 }).breakdown.populationPoints).toBe(1);
    expect(scoreUrgency({ ...base, supportCount: 50 }).breakdown.populationPoints).toBe(2);
  });
});

describe("R-01 exclusividad de gobierno", () => {
  it.each(["traffic_signals", "signage", "water_leak", "drainage"] as const)(
    "%s nunca se ofrece a particulares",
    (category) => {
      const result = routeDispatch({
        category,
        urgency: "critical",
        privateCapacity: true,
        budgetAvailable: true,
      });
      expect(result.target).toBe("government");
      expect(result.rule).toBe("R-01");
      expect(result.blockers).toContain("exclusividad_de_gobierno");
    },
  );
});

describe("R-02 / R-03 urgencia crítica y alta", () => {
  it("crítica con capacidad y presupuesto → particular", () => {
    const result = routeDispatch({
      category: "road_damage",
      urgency: "critical",
      privateCapacity: true,
      budgetAvailable: true,
    });
    expect(result).toMatchObject({ target: "private", rule: "R-02" });
  });

  it("crítica sin capacidad → gobierno y explica el bloqueo", () => {
    const result = routeDispatch({
      category: "road_damage",
      urgency: "critical",
      privateCapacity: false,
      budgetAvailable: true,
    });
    expect(result.target).toBe("government");
    expect(result.blockers).toContain("sin_capacidad_particular");
  });

  it("alta sin presupuesto → gobierno", () => {
    const result = routeDispatch({
      category: "street_lighting",
      urgency: "high",
      privateCapacity: true,
      budgetAvailable: false,
    });
    expect(result.target).toBe("government");
    expect(result.blockers).toContain("presupuesto_no_disponible");
  });

  it("alta con disponibilidad → particular", () => {
    const result = routeDispatch({
      category: "street_lighting",
      urgency: "high",
      privateCapacity: true,
      budgetAvailable: true,
    });
    expect(result.target).toBe("private");
  });
});

describe("R-04 urgencia media y baja", () => {
  it("media con SLA de gobierno desconocido → gobierno (matriz base)", () => {
    const result = routeDispatch({
      category: "road_damage",
      urgency: "medium",
      privateCapacity: true,
      budgetAvailable: true,
    });
    expect(result.target).toBe("government");
  });

  it("media con SLA esperado > 24 h → particular", () => {
    const result = routeDispatch({
      category: "road_damage",
      urgency: "medium",
      privateCapacity: true,
      budgetAvailable: true,
      expectedGovernmentSlaHours: 48,
    });
    expect(result).toMatchObject({ target: "private", rule: "R-04" });
  });

  it("baja sólo va a particular con autorización y ≥100 apoyos", () => {
    const withoutApproval = routeDispatch({
      category: "road_damage",
      urgency: "low",
      privateCapacity: true,
      budgetAvailable: true,
      supportCount: 150,
    });
    expect(withoutApproval.target).toBe("government");

    const withApproval = routeDispatch({
      category: "road_damage",
      urgency: "low",
      privateCapacity: true,
      budgetAvailable: true,
      supportCount: 150,
      supervisorAuthorizedLowUrgencyPrivate: true,
    });
    expect(withApproval.target).toBe("private");

    const lowVisibility = routeDispatch({
      category: "road_damage",
      urgency: "low",
      privateCapacity: true,
      budgetAvailable: true,
      supportCount: 40,
      supervisorAuthorizedLowUrgencyPrivate: true,
    });
    expect(lowVisibility.target).toBe("government");
  });
});

describe("presupuesto (sección 5)", () => {
  it("dentro del tope base lo autoriza un responder", () => {
    const result = evaluateBudget({ category: "road_damage", amountMxn: 3000, role: "responder" });
    expect(result.verdict).toBe("within_cap");
    expect(result.allowed).toBe(true);
  });

  it("entre topes exige supervisor y rechaza al responder", () => {
    const asResponder = evaluateBudget({
      category: "road_damage",
      amountMxn: 5000,
      role: "responder",
    });
    expect(asResponder.verdict).toBe("requires_supervisor");
    expect(asResponder.allowed).toBe(false);

    const asSupervisor = evaluateBudget({
      category: "road_damage",
      amountMxn: 5000,
      role: "supervisor",
    });
    expect(asSupervisor.allowed).toBe(true);
  });

  it("sobre el tope con supervisor regresa a gobierno", () => {
    const result = evaluateBudget({ category: "road_damage", amountMxn: 9000, role: "admin" });
    expect(result.verdict).toBe("exceeds_supervisor_cap");
    expect(result.allowed).toBe(false);
  });

  it("categorías exclusivas no admiten gasto", () => {
    const result = evaluateBudget({ category: "water_leak", amountMxn: 1000, role: "admin" });
    expect(result.verdict).toBe("not_eligible");
    expect(result.allowed).toBe(false);
  });

  it("respeta los topes de la Tabla 4", () => {
    expect(CATEGORY_POLICY.street_lighting.baseCapMxn).toBe(4000);
    expect(CATEGORY_POLICY.trees_vegetation.supervisorCapMxn).toBe(15000);
    expect(CATEGORY_POLICY.waste_sanitation.baseCapMxn).toBe(2000);
  });
});

describe("SLA (sección 8)", () => {
  it("particulares tienen SLA más corto que gobierno", () => {
    expect(slaTarget("critical", "private").targetHours).toBe(4);
    expect(slaTarget("critical", "government").targetHours).toBe(24);
    expect(slaTarget("low", "private").targetHours).toBeNull();
  });

  it("marca at_risk al 80% y breached al 100%", () => {
    const assignedAt = new Date("2026-10-31T08:00:00Z");
    const atRisk = evaluateSla({
      level: "high",
      target: "private",
      assignedAt,
      now: new Date("2026-10-31T14:30:00Z"), // 6.5 h de 8 h
    });
    expect(atRisk.state).toBe("at_risk");

    const breached = evaluateSla({
      level: "high",
      target: "private",
      assignedAt,
      now: new Date("2026-10-31T17:00:00Z"), // 9 h
    });
    expect(breached.state).toBe("breached");
  });

  it("descuenta las horas pausadas por falta de evidencia ciudadana", () => {
    const result = evaluateSla({
      level: "high",
      target: "private",
      assignedAt: new Date("2026-10-31T08:00:00Z"),
      now: new Date("2026-10-31T17:00:00Z"), // 9 h transcurridas
      pausedHours: 5, // 4 h efectivas de 8 h
    });
    expect(result.elapsedHours).toBe(4);
    expect(result.state).toBe("on_track");
  });
});

describe("permisos (Tabla 7)", () => {
  it("el responder no asigna sobre el tope ni reasigna a particular", () => {
    expect(canPerform("responder", "assign_within_cap")).toBe(true);
    expect(canPerform("responder", "assign_above_cap")).toBe(false);
    expect(canPerform("responder", "reassign_government_to_private")).toBe(false);
    expect(canPerform("responder", "reassign_private_to_government")).toBe(true);
  });

  it("sólo el admin gestiona organizaciones y topes", () => {
    expect(canPerform("supervisor", "remove_organization")).toBe(false);
    expect(canPerform("admin", "remove_organization")).toBe(true);
    expect(canPerform("admin", "adjust_budget_caps")).toBe(true);
  });
});

describe("regla de oro (sección 12.3)", () => {
  it("el cierre operativo sólo abre verificación comunitaria", () => {
    expect(communityVerificationOnCompletion()).toBe("unreviewed");
    expect(communityVerificationOnCompletion("unreviewed")).toBe("unreviewed");
  });

  it("rechaza escribir verified_resolved desde el cierre operativo", () => {
    expect(() => communityVerificationOnCompletion("verified_resolved")).toThrow(
      DispatchRuleError,
    );
  });
});

describe("casos límite (sección 11)", () => {
  it("el registro oficial prevalece sobre la categoría ciudadana", () => {
    const result = resolveCategoryConflict({
      citizenCategory: "road_damage",
      officialCategory: "water_leak",
    });
    expect(result.category).toBe("water_leak");
    expect(result.recategorized).toBe(true);
    expect(result.source).toBe("official");
  });

  it("no recategoriza cuando coinciden", () => {
    const result = resolveCategoryConflict({
      citizenCategory: "road_damage",
      officialCategory: "road_damage",
    });
    expect(result.recategorized).toBe(false);
  });

  it("detecta patrones de apoyos anómalos", () => {
    expect(
      needsSupportAudit({ supportsFromSameDevice: 12, supportingDevices: 40, supportCount: 120 }),
    ).toBe(true);
    expect(
      needsSupportAudit({ supportsFromSameDevice: 2, supportingDevices: 40, supportCount: 120 }),
    ).toBe(false);
  });

  it("normaliza alias del manual a categorías del contrato", () => {
    expect(normalizeCategory("garbage")).toBe("waste_sanitation");
    expect(normalizeCategory("drenaje")).toBe("drainage");
    expect(normalizeCategory("road_damage")).toBe("road_damage");
    expect(normalizeCategory("desconocida")).toBe("other");
  });
});

describe("orquestador evaluateDispatch", () => {
  it("propone particular para bache crítico dentro del tope", () => {
    const proposal = evaluateDispatch({
      category: "road_damage",
      urgency: { riskToPeople: 2, materialSeverity: 3, supportCount: 60, temporalSensitivity: 2 },
      role: "responder",
      budgetAmountMxn: 2800,
      privateCapacity: true,
      budgetAvailable: true,
    });
    expect(proposal.routing.target).toBe("private");
    expect(proposal.budget?.verdict).toBe("within_cap");
    expect(proposal.sla.targetHours).toBe(4);
    expect(proposal.allowedByRole).toBe(true);
  });

  it("marca falta de permiso cuando el responder supera el tope base", () => {
    const proposal = evaluateDispatch({
      category: "road_damage",
      urgency: { riskToPeople: 2, materialSeverity: 3, supportCount: 60, temporalSensitivity: 2 },
      role: "responder",
      budgetAmountMxn: 5000,
      privateCapacity: true,
      budgetAvailable: true,
    });
    expect(proposal.budget?.verdict).toBe("requires_supervisor");
    expect(proposal.allowedByRole).toBe(false);
  });

  it("un caso de agua crítico nunca genera gasto con particulares", () => {
    const proposal = evaluateDispatch({
      category: "water_leak",
      urgency: { riskToPeople: 3, materialSeverity: 3, supportCount: 80, temporalSensitivity: 3 },
      role: "admin",
      privateCapacity: true,
      budgetAvailable: true,
    });
    expect(proposal.routing.target).toBe("government");
    expect(proposal.budget).toBeNull();
    expect(proposal.sla.targetHours).toBe(24);
  });
});
