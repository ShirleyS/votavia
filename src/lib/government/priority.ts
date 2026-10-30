import type {
  CasePriority,
  CommunityPriorityBreakdown,
  GovernmentCase,
} from "./types";

/** Puntaje transparente compartido por la muestra y el adaptador del núcleo. */
export interface PriorityInput {
  reportedAt: string;
  priority: CasePriority;
  supportCount: number;
  independentReports: number;
  relatedCount: number;
  safetyConcern: boolean;
  safetyNote?: string;
}

const REFERENCE_NOW = () => Date.now();

function daysSince(iso: string): number {
  return Math.max(0, Math.ceil((REFERENCE_NOW() - new Date(iso).getTime()) / 86_400_000));
}

export function computePriorityBreakdown(input: PriorityInput): CommunityPriorityBreakdown {
  const safety = input.safetyConcern
    ? 30
    : input.priority === "critical"
      ? 22
      : input.priority === "high"
        ? 12
        : 4;
  const reports = Math.min(25, input.independentReports * 3);
  const support = Math.min(20, Math.round(input.supportCount / 6));
  const concentration = input.relatedCount >= 2 ? 13 : 7;
  const persistence = Math.min(10, daysSince(input.reportedAt) * 2);
  return {
    score: safety + reports + support + concentration + persistence,
    maxScore: 100,
    items: [
      {
        key: "safety",
        label: "Riesgo de seguridad",
        detail: input.safetyConcern
          ? input.safetyNote ?? "La comunidad señaló un riesgo de seguridad."
          : "Sin riesgo de seguridad señalado en el reporte.",
        points: safety,
        maxPoints: 30,
      },
      {
        key: "reports",
        label: "Reportes independientes",
        detail: `${input.independentReports} reportes distintos, no sólo apoyos al mismo reporte.`,
        points: reports,
        maxPoints: 25,
      },
      {
        key: "support",
        label: "Apoyo ciudadano",
        detail: `${input.supportCount} personas únicas apoyan el reporte.`,
        points: support,
        maxPoints: 20,
      },
      {
        key: "concentration",
        label: "Concentración geográfica",
        detail:
          input.relatedCount > 0
            ? `${input.relatedCount} reportes vinculados dentro de la misma colonia.`
            : "Sin reportes vinculados en la misma colonia.",
        points: concentration,
        maxPoints: 15,
      },
      {
        key: "persistence",
        label: "Persistencia",
        detail: `El primer reporte tiene ${daysSince(input.reportedAt)} días y sigue abierto.`,
        points: persistence,
        maxPoints: 10,
      },
    ],
    note:
      "El riesgo de seguridad pesa más que la popularidad. Los apoyos no se cuentan como reportes independientes.",
  };
}

export function priorityFromBreakdown(
  breakdown: CommunityPriorityBreakdown,
  safetyConcern: boolean,
): CasePriority {
  if (breakdown.score >= 78) return "critical";
  if (breakdown.score >= 58) return "high";
  if (safetyConcern) return "high";
  if (breakdown.score >= 36) return "medium";
  return "low";
}

/** Recalcula el desglose de un expediente ya armado (misma fórmula). */
export function breakdownForCase(item: GovernmentCase): CommunityPriorityBreakdown {
  return computePriorityBreakdown({
    reportedAt: item.reportedAt,
    priority: item.priority,
    supportCount: item.citizen.supportCount,
    independentReports: item.independentReportCount ?? item.citizen.reportsCount,
    relatedCount: item.relatedCaseIds.length,
    safetyConcern: item.citizen.safetyConcern,
    safetyNote: item.citizen.safetyNote,
  });
}
