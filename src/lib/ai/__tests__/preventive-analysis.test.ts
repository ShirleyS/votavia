import { describe, expect, it } from "vitest";
import {
  calculatePreventiveSignals,
  explainPreventiveSignals,
} from "../services/preventive-analysis";
import type { PreventiveAnalysis, PreventiveRecord } from "../types";
import { createMockClient, daysAgo } from "./test-helpers";

const NOW = "2026-10-30T12:00:00.000Z";
const CENTER = { latitude: 19.42, longitude: -99.16 };

function record(
  id: string,
  days: number,
  overrides: Partial<PreventiveRecord> = {},
): PreventiveRecord {
  return {
    id,
    source: "reportes_votavia",
    category: "traffic_signals",
    occurred_at: daysAgo(days, NOW),
    colonia: "Centro",
    ...CENTER,
    severity: "medium",
    ...overrides,
  };
}

function geographicFixture(): PreventiveRecord[] {
  return [
    record("base-1", 70, { severity: "low" }),
    record("prev-1", 35),
    record("prev-2", 45),
    record("prev-3", 55),
    record("cur-1", 5, { severity: "high", latitude: 19.4202 }),
    record("cur-2", 12, { severity: "high", longitude: -99.1601 }),
    record("cur-3", 20),
  ];
}

function repeatedAnalysis(): PreventiveAnalysis {
  return calculatePreventiveSignals({ records: geographicFixture(), now: NOW });
}

describe("calculatePreventiveSignals", () => {
  it("detects a geographic cluster and repeated reports", () => {
    const analysis = repeatedAnalysis();
    const repeated = analysis.signals.find(
      (signal) => signal.signal_type === "repeated_reports",
    );

    expect(repeated).toBeDefined();
    if (!repeated) return;
    expect(repeated.category).toBe("traffic_signals");
    expect(repeated.current_window_count).toBe(3);
    expect(repeated.previous_window_count).toBe(3);
    expect(repeated.distinct_days).toBe(3);
    expect(repeated.spatial_precision).toBe("coordinates");
    expect(repeated.radius_meters).toBe(250);
    expect(repeated.centroid).not.toBeNull();
    expect(repeated.score).toBeGreaterThan(0);
    expect(repeated.score).toBeLessThanOrEqual(100);
    expect(repeated.evidence_record_ids.sort()).toEqual(["cur-1", "cur-2", "cur-3"]);
    expect(repeated.finding).toContain("3 reporte(s)");
    expect(analysis.window.comparable).toBe(true);
    expect(analysis.confidence_label).toBe("preliminary");
    expect(analysis.model).toBeNull();
  });

  it("flags high-severity concentrations without inventing probabilities", () => {
    const analysis = repeatedAnalysis();
    const high = analysis.signals.find(
      (signal) => signal.signal_type === "high_severity_reports",
    );

    expect(high).toBeDefined();
    expect(high?.signal_type).toBe("high_severity_reports");
    expect(high?.limitations.join(" ")).toContain("no una probabilidad");
    expect(analysis.inspection_flags.length).toBeGreaterThan(0);
  });

  it("detects an emerging concentration when the current window doubles", () => {
    const records = [
      record("base-1", 70, { severity: "low" }),
      record("prev-1", 35),
      record("prev-2", 45),
      record("prev-3", 55),
      ...[3, 5, 8, 11, 16, 22].map((days, index) =>
        record(`cur-${index + 1}`, days, { severity: "high" }),
      ),
    ];
    const analysis = calculatePreventiveSignals({ records, now: NOW });
    const emerging = analysis.signals.find(
      (signal) => signal.signal_type === "emerging_concentration",
    );

    expect(emerging).toBeDefined();
    expect(emerging?.current_window_count).toBe(6);
    expect(emerging?.previous_window_count).toBe(3);
    expect(emerging?.change_ratio).toBe(2);
  });

  it("stays quiet with sparse data and says so", () => {
    const analysis = calculatePreventiveSignals({
      records: [record("a", 5), record("b", 10)],
      now: NOW,
    });

    expect(analysis.signals).toEqual([]);
    expect(analysis.limitations.join(" ")).toContain("Datos escasos");
    expect(analysis.limitations.join(" ")).toContain("No se detectaron concentraciones");
  });

  it("does not compare windows without enough historical coverage", () => {
    const records = [
      record("base-1", 70, { severity: "low" }),
      record("cur-1", 5),
      record("cur-2", 10),
      record("cur-3", 20),
    ];
    const analysis = calculatePreventiveSignals({ records, now: NOW });
    const repeated = analysis.signals.find(
      (signal) => signal.signal_type === "repeated_reports",
    );

    expect(analysis.window.comparable).toBe(false);
    expect(analysis.window.reason).toContain("menos de 3 registros");
    expect(repeated?.previous_window_count).toBeNull();
    expect(repeated?.limitations.join(" ")).toContain("menos de 3 registros");
  });

  it("detects recurrence across two windows", () => {
    const records = [
      record("base-1", 70, { severity: "low" }),
      record("prev-1", 35),
      record("prev-2", 45),
      record("cur-1", 5),
      record("cur-2", 15),
    ];
    const analysis = calculatePreventiveSignals({ records, now: NOW });
    const recurring = analysis.signals.find(
      (signal) => signal.signal_type === "recurring_problem",
    );

    expect(recurring).toBeDefined();
    expect(recurring?.finding).toContain("reaparece");
  });

  it("returns no signal when all reports fall on one day", () => {
    const records = [
      record("base-1", 70, { severity: "low" }),
      record("a", 5),
      record("b", 5),
      record("c", 5),
    ];
    const analysis = calculatePreventiveSignals({ records, now: NOW });

    expect(analysis.signals).toEqual([]);
    expect(analysis.statistics.current_window_records).toBe(3);
  });

  it("falls back to colonia clusters when coordinates are missing", () => {
    const plain = (id: string, days: number): PreventiveRecord => ({
      id,
      source: "datos_abiertos_cdmx",
      category: "street_lighting",
      occurred_at: daysAgo(days, NOW),
      colonia: "Doctores",
    });
    const records = [
      plain("base-1", 70),
      plain("prev-1", 35),
      plain("prev-2", 45),
      plain("prev-3", 55),
      plain("cur-1", 5),
      plain("cur-2", 12),
      plain("cur-3", 20),
    ];
    const analysis = calculatePreventiveSignals({ records, now: NOW });
    const signal = analysis.signals.find(
      (item) => item.signal_type === "repeated_reports",
    );

    expect(signal?.spatial_precision).toBe("colonia");
    expect(signal?.radius_meters).toBeNull();
    expect(signal?.area_label).toBe("Doctores");
    expect(signal?.limitations.join(" ")).toContain("usa la colonia");
  });

  it("counts incomplete metadata instead of hiding it", () => {
    const records = [
      record("a", 5),
      { ...record("b", 10), occurred_at: "no-es-fecha" },
      record("c", 15, { latitude: undefined, longitude: undefined }),
    ];
    const analysis = calculatePreventiveSignals({ records, now: NOW });

    expect(analysis.statistics.records_received).toBe(3);
    expect(analysis.statistics.records_without_dates).toBe(1);
    expect(analysis.statistics.records_without_coordinates).toBe(1);
    expect(analysis.statistics.records_used).toBe(2);
  });

  it("rejects duplicate and malformed records", () => {
    const records = [
      record("same", 5),
      record("same", 6),
      record("empty", 7, { category: "" }),
    ];
    const analysis = calculatePreventiveSignals({ records, now: NOW });

    expect(analysis.statistics.records_rejected).toBe(2);
  });
});

describe("explainPreventiveSignals", () => {
  it("explains only signals that were calculated", async () => {
    const analysis = repeatedAnalysis();
    const signal = analysis.signals[0];
    const client = createMockClient({
      response: {
        explanations: [
          {
            signal_id: signal.signal_id,
            finding: "La concentración coincide con reportes recientes en el mismo cruce.",
            recommended_action: "Programar una inspección preventiva del controlador.",
            limitations: ["Datos preliminares."],
          },
        ],
        overall_note: "Revisar la evidencia antes de intervenir; no es una predicción.",
      },
    });
    const result = await explainPreventiveSignals(analysis, {
      client,
      now: () => new Date(NOW),
    });

    expect(result.fallback).toBe(false);
    expect(result.explanations).toHaveLength(analysis.signals.length);
    expect(result.explanations[0].finding).toContain("concentración");
    expect(client.calls).toHaveLength(1);
  });

  it("ignores invented signal ids and keeps deterministic text", async () => {
    const analysis = repeatedAnalysis();
    const signal = analysis.signals[0];
    const client = createMockClient({
      response: {
        explanations: [
          {
            signal_id: "sig_inventado",
            finding: "Señal inventada.",
            recommended_action: "Hacer algo inventado.",
            limitations: [],
          },
        ],
        overall_note: "Nota general suficientemente larga para conservarse.",
      },
    });
    const result = await explainPreventiveSignals(analysis, { client });

    expect(result.explanations[0].signal_id).toBe(signal.signal_id);
    expect(result.explanations[0].finding).toBe(signal.finding);
  });

  it("falls back deterministically when the model fails", async () => {
    const analysis = repeatedAnalysis();
    const client = createMockClient({
      fail: { code: "timeout", message: "Tiempo agotado.", retryable: true },
    });
    const result = await explainPreventiveSignals(analysis, { client });

    expect(result.fallback).toBe(true);
    expect(result.explanations).toHaveLength(analysis.signals.length);
    expect(result.explanations[0].recommended_action).toContain("inspección preventiva");
  });

  it("returns an empty explanation set when there are no signals", async () => {
    const result = await explainPreventiveSignals([]);

    expect(result.explanations).toEqual([]);
    expect(result.model).toBeNull();
    expect(result.fallback).toBe(false);
  });
});
