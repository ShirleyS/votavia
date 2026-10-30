import type {
  PriorityFactor,
  PriorityInput,
  PriorityLevel,
  PrioritySuggestion,
  Severity,
} from "../types";
import { clamp01, isIsoDate } from "./validation";

const DAY_MS = 86_400_000;

const SEVERITY_VALUE: Record<Severity, number> = {
  low: 0.2,
  medium: 0.45,
  high: 0.75,
  critical: 1,
};

/**
 * Explainable attention score. Deliberately NOT a probability, an SLA or a
 * replacement for fieldwork: it orders review work.
 */
const WEIGHTS = {
  safety_severity: 0.3,
  independent_reports: 0.18,
  unique_supporters: 0.1,
  duration_unresolved: 0.15,
  geographic_concentration: 0.12,
  available_evidence: 0.1,
  historical_context: 0.05,
} as const;

function logScale(value: number, points: Array<[number, number]>): number {
  if (value <= 0) return 0.1;
  for (const [threshold, score] of points) {
    if (value <= threshold) return score;
  }
  return 1;
}

function durationValue(input: PriorityInput): { value: number; days: number | null } {
  if (!isIsoDate(input.reported_at)) return { value: 0.35, days: null };
  const end = isIsoDate(input.resolved_at)
    ? Date.parse(input.resolved_at as string)
    : input.now && isIsoDate(input.now)
      ? Date.parse(input.now)
      : Date.now();
  const days = Math.max(0, (end - Date.parse(input.reported_at)) / DAY_MS);
  return { value: logScale(days, [[1, 0.1], [7, 0.3], [30, 0.6], [90, 0.85], [365, 1]]), days };
}

export function suggestPriority(input: PriorityInput): PrioritySuggestion {
  const severity: Severity = input.severity ?? "medium";
  const reports = Math.max(1, Math.round(input.independent_reports ?? 1));
  const supporters = Math.max(0, Math.round(input.unique_supporters ?? 0));
  const nearby = Math.max(0, Math.round(input.nearby_reports ?? 0));
  const evidence = Math.max(0, Math.round(input.evidence_count ?? 0));
  const historical = Math.max(0, Math.round(input.historical_matches ?? 0));
  const duration = durationValue(input);

  const values = {
    safety_severity: SEVERITY_VALUE[severity],
    independent_reports: logScale(reports, [[1, 0.2], [2, 0.45], [3, 0.65], [5, 0.85], [8, 1]]),
    unique_supporters: logScale(supporters, [[1, 0.1], [5, 0.35], [20, 0.6], [75, 0.85], [200, 1]]),
    duration_unresolved: duration.value,
    geographic_concentration: logScale(nearby, [[0, 0.2], [2, 0.45], [5, 0.7], [10, 1]]),
    available_evidence: logScale(evidence, [[0, 0.1], [1, 0.35], [2, 0.55], [4, 0.8], [6, 1]]),
    historical_context: logScale(historical, [[0, 0.1], [1, 0.4], [3, 0.7], [5, 1]]),
  } as const;

  const factors: PriorityFactor[] = [
    {
      code: "safety_severity",
      label: "Gravedad de seguridad sugerida",
      weight: WEIGHTS.safety_severity,
      value: values.safety_severity,
      contribution: points(WEIGHTS.safety_severity, values.safety_severity),
      evidence: `Gravedad sugerida: ${severity}. No verificada en campo.`,
    },
    {
      code: "independent_reports",
      label: "Reportes independientes",
      weight: WEIGHTS.independent_reports,
      value: values.independent_reports,
      contribution: points(WEIGHTS.independent_reports, values.independent_reports),
      evidence: `${reports} reporte(s) independiente(s) vinculados.`,
    },
    {
      code: "unique_supporters",
      label: "Personas distintas que lo apoyan",
      weight: WEIGHTS.unique_supporters,
      value: values.unique_supporters,
      contribution: points(WEIGHTS.unique_supporters, values.unique_supporters),
      evidence: `${supporters} persona(s) distinta(s) reportaron o apoyaron.`,
    },
    {
      code: "duration_unresolved",
      label: "Tiempo sin resolver",
      weight: WEIGHTS.duration_unresolved,
      value: values.duration_unresolved,
      contribution: points(WEIGHTS.duration_unresolved, values.duration_unresolved),
      evidence:
        duration.days === null
          ? "Sin fecha de reporte para calcular antigüedad."
          : `Abierto desde hace ${Math.floor(duration.days)} día(s).`,
    },
    {
      code: "geographic_concentration",
      label: "Concentración geográfica",
      weight: WEIGHTS.geographic_concentration,
      value: values.geographic_concentration,
      contribution: points(WEIGHTS.geographic_concentration, values.geographic_concentration),
      evidence: `${nearby} reporte(s) cercanos en la misma zona/categoría.`,
    },
    {
      code: "available_evidence",
      label: "Evidencia disponible",
      weight: WEIGHTS.available_evidence,
      value: values.available_evidence,
      contribution: points(WEIGHTS.available_evidence, values.available_evidence),
      evidence: `${evidence} elemento(s) de evidencia (fotos, observaciones o registros).`,
    },
    {
      code: "historical_context",
      label: "Contexto histórico",
      weight: WEIGHTS.historical_context,
      value: values.historical_context,
      contribution: points(WEIGHTS.historical_context, values.historical_context),
      evidence: `${historical} registro(s) histórico(s) relacionados proporcionados.`,
    },
  ];

  const score = Math.round(factors.reduce((total, factor) => total + factor.contribution, 0));

  const nonSupporterSignals = [
    values.safety_severity,
    values.independent_reports,
    values.duration_unresolved,
    values.geographic_concentration,
    values.available_evidence,
    values.historical_context,
  ];
  const supportersOnly =
    values.unique_supporters >= 0.3 && nonSupporterSignals.every((value) => value < 0.45);

  let level = levelFor(score);
  if (supportersOnly) level = capLevel(level, "medium");
  // Urgency needs more than a string of supporters or a single unverified report.
  if (level === "urgent" && values.safety_severity < 0.75 && values.independent_reports < 0.65) {
    level = "high";
  }

  const explanation = supportersOnly
    ? `Sugerencia ${level}: el apoyo ciudadano es el principal indicio; no basta por sí solo para elevar la urgencia. Revisar evidencia y verificar en sitio.`
    : `Sugerencia ${level} con base en gravedad, reportes independientes, antigüedad, concentración y evidencia disponible. Es una recomendación de revisión, no un hecho verificado.`;

  return {
    level,
    score: clampScore(score),
    factors,
    explanation,
    supporters_only: supportersOnly,
    confidence_label: "heuristic",
    model_generated: false,
    is_verified: false,
    requires_human_review: true,
  };
}

function points(weight: number, value: number): number {
  return Math.round(weight * clamp01(value) * 1000) / 10;
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

export function levelFor(score: number): PriorityLevel {
  if (score >= 80) return "urgent";
  if (score >= 62) return "high";
  if (score >= 40) return "medium";
  return "low";
}

const LEVEL_ORDER: PriorityLevel[] = ["low", "medium", "high", "urgent"];

function capLevel(level: PriorityLevel, cap: PriorityLevel): PriorityLevel {
  return LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(cap) ? cap : level;
}
