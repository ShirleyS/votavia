import type {
  EscalationContext,
  EscalationSignal,
  EscalationSignalCode,
  PriorityEscalation,
  PriorityLevel,
  PrioritySuggestion,
  PreventiveSignalType,
} from "../types";
import { levelFor } from "./priority";

/**
 * Deterministic escalation policy.
 *
 * The base attention score answers "how serious does this single report look?".
 * Escalation answers "how much corroboration has accumulated since?". It runs
 * entirely in code, applies automatically, and stays explainable: every point
 * added is attributed to a named signal.
 */
export const ESCALATION_POLICY = {
  /** Maximum points escalation may add, regardless of how many signals exist. */
  max_bonus: 25,
  /** Signals required to escalate when none of them is individually strong. */
  min_signals: 2,
  /** A single signal at or above this size can escalate on its own. */
  strong_signal_points: 10,
  /** Escalation raises the review level by at most one step per evaluation. */
  max_level_steps: 1,
  /** Distinct strong signals required before an escalated issue can reach urgent. */
  urgent_min_strong_signals: 2,
  /** Minimum independent reports before they count as an escalation signal. */
  min_independent_reports: 3,
  /** Minimum evidence items before they count as an escalation signal. */
  min_evidence_items: 3,
} as const;

export const ESCALATION_SIGNAL_POINTS: Record<EscalationSignalCode, number> = {
  emerging_concentration: 12,
  persistence_after_closure: 12,
  repeated_reports: 10,
  high_severity_reports: 10,
  recurring_problem: 8,
  independent_reports: 6,
  evidence_accumulation: 4,
};

const LABELS: Record<EscalationSignalCode, string> = {
  independent_reports: "Reportes independientes acumulados",
  evidence_accumulation: "Evidencia acumulada",
  repeated_reports: "Reportes repetidos en la zona",
  emerging_concentration: "Concentración emergente",
  recurring_problem: "Problema recurrente",
  high_severity_reports: "Reportes de alta gravedad",
  persistence_after_closure: "Persistencia tras cierre oficial",
};

const LEVEL_ORDER: PriorityLevel[] = ["low", "medium", "high", "urgent"];

function step(level: PriorityLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

function signal(code: EscalationSignalCode, evidence: string): EscalationSignal {
  return { code, label: LABELS[code], points: ESCALATION_SIGNAL_POINTS[code], evidence };
}

/** Maps a preventive cluster signal to its escalation counterpart. */
const PREVENTIVE_TO_ESCALATION: Record<PreventiveSignalType, EscalationSignalCode> = {
  repeated_reports: "repeated_reports",
  emerging_concentration: "emerging_concentration",
  recurring_problem: "recurring_problem",
  high_severity_reports: "high_severity_reports",
};

/**
 * Builds the distinct escalation signals present in the context. Repeated
 * corroboration is counted once: a preventive cluster signal already implies
 * multiple independent reports, so it suppresses the plain reports signal.
 */
export function collectEscalationSignals(context: EscalationContext): EscalationSignal[] {
  const signals = new Map<EscalationSignalCode, EscalationSignal>();
  const preventive = context.preventive_signals ?? [];

  for (const type of preventive) {
    const code = PREVENTIVE_TO_ESCALATION[type];
    if (!code) continue;
    signals.set(code, signal(code, `Señal preventiva calculada: ${type.replaceAll("_", " ")}.`));
  }

  if (context.persists_after_closure === true) {
    signals.set(
      "persistence_after_closure",
      signal(
        "persistence_after_closure",
        "Hay evidencia ciudadana posterior al cierre oficial que indica persistencia.",
      ),
    );
  }

  const reports = Math.max(0, Math.round(context.independent_reports ?? 0));
  const clusterSignalPresent =
    signals.has("repeated_reports") ||
    signals.has("emerging_concentration") ||
    signals.has("recurring_problem");
  if (reports >= ESCALATION_POLICY.min_independent_reports && !clusterSignalPresent) {
    signals.set(
      "independent_reports",
      signal("independent_reports", `${reports} reportes independientes vinculados al mismo problema.`),
    );
  }

  const evidence = Math.max(0, Math.round(context.evidence_count ?? 0));
  if (evidence >= ESCALATION_POLICY.min_evidence_items) {
    signals.set(
      "evidence_accumulation",
      signal("evidence_accumulation", `${evidence} elementos de evidencia adjuntos.`),
    );
  }

  return [...signals.values()].sort((a, b) => b.points - a.points);
}

function isoNow(value: string | null | undefined): string {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function raisedLevel(
  base: PriorityLevel,
  score: number,
  strongSignals: number,
): PriorityLevel {
  const target = levelFor(score);
  if (step(target) <= step(base)) return base;
  const capped = LEVEL_ORDER[Math.min(step(base) + ESCALATION_POLICY.max_level_steps, 3)];
  if (capped === "urgent" && strongSignals < ESCALATION_POLICY.urgent_min_strong_signals) {
    return "high";
  }
  return capped;
}

/**
 * Applies automatic escalation to a base priority suggestion.
 *
 * Rules:
 * - Supporters-only suggestions never escalate: popularity is not corroboration.
 * - Escalation needs either two distinct signals or one strong signal.
 * - The bonus is capped and the review level can rise at most one step.
 * - Reaching `urgent` requires at least two distinct strong signals.
 *
 * The result is still advisory for action: dispatch, assignment and status
 * remain human decisions, which is why `requires_human_review` stays true.
 */
export function escalatePriority(
  base: PrioritySuggestion,
  context: EscalationContext = {},
): PrioritySuggestion {
  const signals = base.supporters_only ? [] : collectEscalationSignals(context);
  const strongest = signals.reduce((max, item) => Math.max(max, item.points), 0);
  const qualified =
    !base.supporters_only &&
    (signals.length >= ESCALATION_POLICY.min_signals ||
      strongest >= ESCALATION_POLICY.strong_signal_points);

  const evaluatedAt = isoNow(context.now);

  if (!qualified) {
    const escalation: PriorityEscalation = {
      applied: false,
      reason: base.supporters_only
        ? "No se escala: el apoyo ciudadano por sí solo no cuenta como corroboración."
        : "No se escala: no hay suficientes señales de corroboración.",
      signals,
      bonus: 0,
      threshold_signals: ESCALATION_POLICY.min_signals,
      from_level: base.level,
      from_score: base.score,
      to_level: base.level,
      to_score: base.score,
      level_changed: false,
      auto_applied: true,
      evaluated_at: evaluatedAt,
    };
    return { ...base, escalation };
  }

  const rawBonus = signals.reduce((total, item) => total + item.points, 0);
  const bonus = Math.min(ESCALATION_POLICY.max_bonus, rawBonus);
  const score = Math.min(100, Math.max(0, base.score + bonus));
  const strongSignals = signals.filter(
    (item) => item.points >= ESCALATION_POLICY.strong_signal_points,
  ).length;
  const level = raisedLevel(base.level, score, strongSignals);

  const escalation: PriorityEscalation = {
    applied: true,
    reason: `Escalada automática: +${bonus} puntos por ${signals.length} señal(es) de corroboración (${signals
      .map((item) => item.label)
      .join(", ")}).`,
    signals,
    bonus,
    threshold_signals: ESCALATION_POLICY.min_signals,
    from_level: base.level,
    from_score: base.score,
    to_level: level,
    to_score: score,
    level_changed: level !== base.level,
    auto_applied: true,
    evaluated_at: evaluatedAt,
  };

  return {
    ...base,
    level,
    score,
    explanation: `${base.explanation} ${escalation.reason}`,
    escalation,
  };
}
