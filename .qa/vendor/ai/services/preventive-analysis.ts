import type { CaseCategory } from "@/shared/votavia-contract";
import { getAIClient } from "../client";
import { buildRiskExplanationPrompt } from "../prompts/explain-risk-signals";
import { preventiveExplanationModelSchema } from "../schemas";
import {
  AI_ANALYSIS_VERSION,
  type AIDeps,
  type GeoInput,
  type InspectionFlag,
  type PreventiveAnalysis,
  type PreventiveExplanation,
  type PreventiveExplanationResult,
  type PreventiveInput,
  type PreventiveRecord,
  type PreventiveSignal,
  type PreventiveSignalType,
  type PreventiveWindow,
  type Severity,
} from "../types";
import { centroidOf, haversineMeters, isValidCoordinate } from "../utils/distance";
import {
  analysisKey,
  cleanBullets,
  isIsoDate,
  limitText,
  normalizeCategory,
  normalizeSeverity,
  normalizeText,
} from "../utils/validation";

const DAY_MS = 86_400_000;
const CLUSTER_RADIUS_M = 250;
const MAX_EVIDENCE_IDS = 10;

interface PreparedRecord {
  id: string;
  source: string;
  category: CaseCategory;
  rawCategory: string;
  occurredAt: number | null;
  colonia: string | null;
  coordinate: GeoInput | null;
  severity: Severity;
}

interface Cluster {
  category: CaseCategory;
  precision: "coordinates" | "colonia";
  colonia: string | null;
  points: GeoInput[];
  centroid: GeoInput | null;
  records: PreparedRecord[];
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function prepareRecords(records: readonly PreventiveRecord[]): {
  prepared: PreparedRecord[];
  rejected: number;
  withoutDates: number;
  withoutCoordinates: number;
} {
  const prepared: PreparedRecord[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  let withoutDates = 0;
  let withoutCoordinates = 0;

  for (const record of records) {
    if (!record || typeof record.id !== "string" || !record.id.trim() || seen.has(record.id)) {
      rejected += 1;
      continue;
    }
    seen.add(record.id);
    const rawCategory = typeof record.category === "string" ? record.category.trim() : "";
    if (!rawCategory) {
      rejected += 1;
      continue;
    }
    const occurredAt = record.occurred_at && isIsoDate(record.occurred_at)
      ? Date.parse(record.occurred_at)
      : null;
    if (occurredAt === null) withoutDates += 1;
    const coordinate = isValidCoordinate({
      latitude: record.latitude,
      longitude: record.longitude,
    })
      ? { latitude: record.latitude as number, longitude: record.longitude as number }
      : null;
    if (!coordinate) withoutCoordinates += 1;

    prepared.push({
      id: record.id,
      source: record.source?.trim() || "fuente no especificada",
      category: normalizeCategory(rawCategory) ?? "other",
      rawCategory,
      occurredAt,
      colonia: record.colonia?.trim() || null,
      coordinate,
      severity: normalizeSeverity(record.severity, "medium"),
    });
  }

  return { prepared, rejected, withoutDates, withoutCoordinates };
}

function buildClusters(records: readonly PreparedRecord[]): Cluster[] {
  const clusters: Cluster[] = [];
  const ordered = [...records]
    .filter((record) => record.occurredAt !== null)
    .sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));

  for (const record of ordered) {
    if (record.coordinate) {
      const coordinate = record.coordinate;
      const match = clusters.find(
        (cluster) =>
          cluster.precision === "coordinates" &&
          cluster.category === record.category &&
          cluster.centroid !== null &&
          haversineMeters(cluster.centroid, coordinate) <= CLUSTER_RADIUS_M,
      );
      if (match) {
        match.records.push(record);
        match.points.push(coordinate);
        match.centroid = centroidOf(match.points);
        if (!match.colonia && record.colonia) match.colonia = record.colonia;
      } else {
        clusters.push({
          category: record.category,
          precision: "coordinates",
          colonia: record.colonia,
          points: [coordinate],
          centroid: coordinate,
          records: [record],
        });
      }
      continue;
    }

    if (!record.colonia) continue;
    const key = normalizeText(record.colonia);
    const match = clusters.find(
      (cluster) =>
        cluster.precision === "colonia" &&
        cluster.category === record.category &&
        cluster.colonia !== null &&
        normalizeText(cluster.colonia) === key,
    );
    if (match) {
      match.records.push(record);
    } else {
      clusters.push({
        category: record.category,
        precision: "colonia",
        colonia: record.colonia,
        points: [],
        centroid: null,
        records: [record],
      });
    }
  }

  return clusters;
}

function areaLabel(cluster: Cluster): string {
  if (cluster.colonia) {
    return cluster.precision === "colonia"
      ? cluster.colonia
      : `${cluster.colonia} (aprox.)`;
  }
  if (cluster.centroid) {
    return `Zona ${cluster.centroid.latitude.toFixed(4)}, ${cluster.centroid.longitude.toFixed(4)}`;
  }
  return "Zona sin identificar";
}

function signalId(cluster: Cluster, type: PreventiveSignalType): string {
  return `sig_${analysisKey("preventive", {
    category: cluster.category,
    precision: cluster.precision,
    colonia: cluster.colonia ? normalizeText(cluster.colonia) : null,
    centroid: cluster.centroid
      ? [Math.round(cluster.centroid.latitude * 500), Math.round(cluster.centroid.longitude * 500)]
      : null,
    type,
  }).slice(0, 12)}`;
}

function scoreFor(input: {
  currentCount: number;
  currentSeverities: readonly Severity[];
  distinctDays: number;
  emerging: boolean;
}): number {
  const severityWeight = input.currentSeverities.reduce((total, severity) => {
    if (severity === "critical") return total + 20;
    if (severity === "high") return total + 10;
    if (severity === "medium") return total + 4;
    return total + 1;
  }, 0);
  const score =
    input.currentCount * 10 +
    severityWeight +
    (input.distinctDays >= 3 ? 10 : 0) +
    (input.emerging ? 15 : 0);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function findingText(input: {
  signalType: PreventiveSignalType;
  category: CaseCategory;
  area: string;
  currentCount: number;
  previousCount: number | null;
  days: number;
}): string {
  const base = `${input.currentCount} reporte(s) de ${input.category} en ${input.area} durante los últimos ${input.days} días`;
  if (input.signalType === "emerging_concentration" && input.previousCount !== null) {
    return input.previousCount === 0
      ? `${base}. No había reportes de esta categoría en la ventana anterior, pero hay datos comparables.`
      : `${base}, frente a ${input.previousCount} en la ventana anterior.`;
  }
  if (input.signalType === "recurring_problem") {
    return `${base}, con reportes en al menos dos momentos distintos; el problema reaparece en la zona.`;
  }
  if (input.signalType === "high_severity_reports") {
    return `${base}, incluyendo reportes marcados con severidad alta o crítica.`;
  }
  return `${base}, en al menos dos días distintos.`;
}

function windowFor(nowMs: number, days: number, prepared: readonly PreparedRecord[]): PreventiveWindow {
  const currentStart = nowMs - days * DAY_MS;
  const previousStart = currentStart - days * DAY_MS;
  const dated = prepared.filter((record) => record.occurredAt !== null);
  const current = dated.filter(
    (record) => (record.occurredAt as number) > currentStart && (record.occurredAt as number) <= nowMs,
  );
  const previous = dated.filter(
    (record) =>
      (record.occurredAt as number) > previousStart && (record.occurredAt as number) <= currentStart,
  );
  const currentDays = new Set(current.map((record) => dayKey(record.occurredAt as number))).size;
  const previousDays = new Set(previous.map((record) => dayKey(record.occurredAt as number))).size;
  const dataStart = dated.reduce(
    (min, record) => Math.min(min, record.occurredAt as number),
    Number.POSITIVE_INFINITY,
  );

  let comparable = false;
  let reason = "";
  if (current.length < 3 || previous.length < 3) {
    reason = "Alguna de las ventanas tiene menos de 3 registros; no se comparan tendencias.";
  } else if (currentDays < 2 || previousDays < 2) {
    reason = "Las ventanas no tienen suficiente dispersión temporal para compararse.";
  } else if (dataStart > previousStart) {
    reason = `La cobertura de datos comienza el ${iso(dataStart).slice(0, 10)} y no cubre la ventana anterior completa.`;
  } else {
    comparable = true;
    reason = "Ambas ventanas tienen registros y cobertura temporal suficiente.";
  }

  return {
    days,
    current_start: iso(currentStart),
    current_end: iso(nowMs),
    previous_start: iso(previousStart),
    previous_end: iso(currentStart),
    comparable,
    reason,
  };
}

function buildSignal(input: {
  cluster: Cluster;
  type: PreventiveSignalType;
  window: PreventiveWindow;
  nowMs: number;
  minRecords: number;
}): PreventiveSignal | null {
  const { cluster, window, nowMs, minRecords } = input;
  const currentStart = Date.parse(window.current_start);
  const previousStart = Date.parse(window.previous_start);
  const current = cluster.records.filter(
    (record) => (record.occurredAt as number) > currentStart && (record.occurredAt as number) <= nowMs,
  );
  const previous = cluster.records.filter(
    (record) =>
      (record.occurredAt as number) > previousStart && (record.occurredAt as number) <= currentStart,
  );
  if (current.length === 0) return null;

  const distinctDays = new Set(current.map((record) => dayKey(record.occurredAt as number))).size;
  const comparable = window.comparable;
  const previousCount = comparable ? previous.length : null;
  const emerging =
    comparable &&
    current.length >= minRecords &&
    (previous.length === 0 || current.length >= previous.length * 2);
  const recurring = previous.length >= 2 && current.length >= 2 && distinctDays >= 2;
  const highSeverity = current.filter(
    (record) => record.severity === "high" || record.severity === "critical",
  ).length;

  if (input.type === "emerging_concentration" && !emerging) return null;
  if (input.type === "repeated_reports" && (current.length < minRecords || distinctDays < 2)) {
    return null;
  }
  if (input.type === "recurring_problem" && !recurring) return null;
  if (input.type === "high_severity_reports" && highSeverity < 2) return null;

  const area = areaLabel(cluster);
  const evidence = [...current]
    .sort((a, b) => (b.occurredAt as number) - (a.occurredAt as number))
    .slice(0, MAX_EVIDENCE_IDS)
    .map((record) => record.id);
  const limitations: string[] = [];
  if (cluster.precision === "colonia") {
    limitations.push("La agrupación usa la colonia, no coordenadas exactas.");
  }
  if (!comparable) limitations.push(window.reason);
  if (current.length === 1) limitations.push("La señal se basa en un solo reporte reciente.");
  limitations.push("El índice de atención es una heurística, no una probabilidad.");

  return {
    signal_id: signalId(cluster, input.type),
    signal_type: input.type,
    area_label: area,
    colonia: cluster.colonia,
    category: cluster.category,
    finding: findingText({
      signalType: input.type,
      category: cluster.category,
      area,
      currentCount: current.length,
      previousCount,
      days: window.days,
    }),
    evidence_record_ids: evidence,
    current_window_count: current.length,
    previous_window_count: previousCount,
    change_ratio:
      previousCount && previousCount > 0
        ? Math.round((current.length / previousCount) * 100) / 100
        : null,
    distinct_days: distinctDays,
    spatial_precision: cluster.precision,
    centroid: cluster.centroid,
    radius_meters: cluster.precision === "coordinates" ? CLUSTER_RADIUS_M : null,
    score: scoreFor({
      currentCount: current.length,
      currentSeverities: current.map((record) => record.severity),
      distinctDays,
      emerging,
    }),
    limitations,
  };
}

/**
 * Stage A: deterministic preventive analysis. No model call, no probabilities.
 */
export function calculatePreventiveSignals(input: PreventiveInput): PreventiveAnalysis {
  const nowMs = input.now && isIsoDate(input.now) ? Date.parse(input.now) : Date.now();
  const days = Math.min(365, Math.max(1, Math.round(input.window_days ?? 30)));
  const minRecords = Math.min(10, Math.max(2, Math.round(input.min_records ?? 3)));
  const { prepared, rejected, withoutDates, withoutCoordinates } = prepareRecords(
    input.records ?? [],
  );

  const window = windowFor(nowMs, days, prepared);
  const clusters = buildClusters(prepared);
  const currentStart = Date.parse(window.current_start);
  const previousStart = Date.parse(window.previous_start);

  const signals: PreventiveSignal[] = [];
  for (const cluster of clusters) {
    const current = cluster.records.filter(
      (record) => (record.occurredAt as number) > currentStart && (record.occurredAt as number) <= nowMs,
    );
    if (current.length === 0) continue;
    const previous = cluster.records.filter(
      (record) =>
        (record.occurredAt as number) > previousStart &&
        (record.occurredAt as number) <= currentStart,
    );
    const distinctDays = new Set(current.map((record) => dayKey(record.occurredAt as number))).size;
    const emerging =
      window.comparable &&
      current.length >= minRecords &&
      (previous.length === 0 || current.length >= previous.length * 2);
    const recurring = previous.length >= 2 && current.length >= 2 && distinctDays >= 2;
    const repeated = current.length >= minRecords && distinctDays >= 2;

    const primary: PreventiveSignalType | null = emerging
      ? "emerging_concentration"
      : repeated
        ? "repeated_reports"
        : recurring
          ? "recurring_problem"
          : null;
    if (primary) {
      const signal = buildSignal({ cluster, type: primary, window, nowMs, minRecords });
      if (signal) signals.push(signal);
    }
    const highSeverity = current.filter(
      (record) => record.severity === "high" || record.severity === "critical",
    ).length;
    if (highSeverity >= 2) {
      const signal = buildSignal({
        cluster,
        type: "high_severity_reports",
        window,
        nowMs,
        minRecords,
      });
      if (signal) signals.push(signal);
    }
  }

  signals.sort((a, b) => b.score - a.score || b.current_window_count - a.current_window_count);

  const inspectionFlags: InspectionFlag[] = signals
    .filter(
      (signal) =>
        signal.signal_type !== "high_severity_reports" &&
        signal.current_window_count >= minRecords,
    )
    .map((signal) => ({
      signal_id: signal.signal_id,
      area_label: signal.area_label,
      category: signal.category,
      reason: signal.finding,
      evidence_record_ids: signal.evidence_record_ids,
    }));

  const limitations: string[] = [];
  if (prepared.length < 5) limitations.push("Datos escasos: la muestra es demasiado pequeña para conclusiones firmes.");
  if (withoutDates > 0) limitations.push(`${withoutDates} registro(s) sin fecha válida no participaron en las ventanas.`);
  if (withoutCoordinates > 0) limitations.push(`${withoutCoordinates} registro(s) sin coordenadas; se agruparon por colonia cuando fue posible.`);
  if (!window.comparable) limitations.push(window.reason);
  if (signals.length === 0) limitations.push("No se detectaron concentraciones que superen el umbral mínimo configurado.");
  limitations.push("Análisis preliminar basado únicamente en los registros entregados; no es una predicción.");

  const currentCount = prepared.filter(
    (record) => record.occurredAt !== null && (record.occurredAt as number) > currentStart && (record.occurredAt as number) <= nowMs,
  ).length;
  const previousCount = prepared.filter(
    (record) =>
      record.occurredAt !== null &&
      (record.occurredAt as number) > previousStart &&
      (record.occurredAt as number) <= currentStart,
  ).length;

  const categoryCounts = new Map<CaseCategory, number>();
  for (const record of prepared) {
    categoryCounts.set(record.category, (categoryCounts.get(record.category) ?? 0) + 1);
  }

  return {
    generated_at: iso(nowMs),
    window,
    signals,
    inspection_flags: inspectionFlags,
    statistics: {
      records_received: input.records?.length ?? 0,
      records_used: prepared.filter((record) => record.occurredAt !== null).length,
      records_rejected: rejected,
      records_without_dates: withoutDates,
      records_without_coordinates: withoutCoordinates,
      clusters_evaluated: clusters.length,
      current_window_records: currentCount,
      previous_window_records: previousCount,
      categories: [...categoryCounts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    },
    limitations,
    confidence_label: "preliminary",
    requires_human_review: true,
    analysis_version: AI_ANALYSIS_VERSION,
    model: null,
  };
}

function deterministicExplanation(signal: PreventiveSignal): PreventiveExplanation {
  return {
    signal_id: signal.signal_id,
    finding: signal.finding,
    recommended_action:
      "Revisar los reportes citados y considerar una inspección preventiva en la zona antes de programar trabajo.",
    limitations: signal.limitations,
  };
}

/**
 * Stage B: the model only explains signals that code already calculated.
 * It cannot add evidence ids, counts, probabilities or new signals.
 */
export async function explainPreventiveSignals(
  input: PreventiveSignal[] | PreventiveAnalysis,
  deps: AIDeps = {},
): Promise<PreventiveExplanationResult> {
  const analyzedAt = (deps.now?.() ?? new Date()).toISOString();
  const signals = Array.isArray(input) ? input : input.signals;
  const windowInfo = Array.isArray(input)
    ? { days: 30, comparable: false, reason: "Ventana no proporcionada." }
    : {
        days: input.window.days,
        comparable: input.window.comparable,
        reason: input.window.reason,
      };
  const globalLimitations = Array.isArray(input)
    ? ["Análisis preliminar; no es una predicción."]
    : input.limitations;

  if (signals.length === 0) {
    return {
      explanations: [],
      overall_note: "No hay señales calculadas que explicar.",
      model: null,
      analyzed_at: analyzedAt,
      analysis_version: AI_ANALYSIS_VERSION,
      fallback: false,
    };
  }

  const client = deps.client ?? getAIClient();
  const fallback = (): PreventiveExplanationResult => ({
    explanations: signals.map(deterministicExplanation),
    overall_note:
      "Análisis preliminar generado localmente. Revisar la evidencia antes de cualquier intervención; no es una predicción.",
    model: client.model,
    analyzed_at: analyzedAt,
    analysis_version: AI_ANALYSIS_VERSION,
    fallback: true,
  });

  if (!client.configured) return fallback();

  const prompt = buildRiskExplanationPrompt({
    signals: signals.slice(0, 12).map((signal) => ({
      signal_id: signal.signal_id,
      signal_type: signal.signal_type,
      area_label: signal.area_label,
      category: signal.category,
      finding: signal.finding,
      evidence_record_ids: signal.evidence_record_ids,
      current_window_count: signal.current_window_count,
      previous_window_count: signal.previous_window_count,
      distinct_days: signal.distinct_days,
      spatial_precision: signal.spatial_precision,
      limitations: signal.limitations,
    })),
    window: windowInfo,
    global_limitations: globalLimitations,
  });

  const result = await client.completeJson(prompt, preventiveExplanationModelSchema);
  if (!result.ok) return fallback();

  const byId = new Map<string, PreventiveExplanation>();
  for (const explanation of result.data.explanations) {
    if (!signals.some((signal) => signal.signal_id === explanation.signal_id)) continue;
    if (byId.has(explanation.signal_id)) continue;
    byId.set(explanation.signal_id, {
      signal_id: explanation.signal_id,
      finding: limitText(explanation.finding, 700).text,
      recommended_action: limitText(explanation.recommended_action, 700).text,
      limitations: cleanBullets(explanation.limitations, 4, 240),
    });
  }

  return {
    explanations: signals.map((signal) => {
      const model = byId.get(signal.signal_id);
      if (!model) return deterministicExplanation(signal);
      return {
        signal_id: signal.signal_id,
        finding: model.finding.length >= 10 ? model.finding : signal.finding,
        recommended_action:
          model.recommended_action.length >= 10
            ? model.recommended_action
            : deterministicExplanation(signal).recommended_action,
        limitations:
          model.limitations.length > 0 ? model.limitations : signal.limitations,
      };
    }),
    overall_note:
      result.data.overall_note.trim().length >= 10
        ? limitText(result.data.overall_note, 800).text
        : "Análisis preliminar: revisar la evidencia antes de intervenir; no es una predicción.",
    model: result.model,
    analyzed_at: analyzedAt,
    analysis_version: AI_ANALYSIS_VERSION,
    fallback: false,
  };
}
