import { describe, expect, it } from "vitest";
import { buildSimilarCases } from "@/server/services/case-analysis";
import type { CaseAggregate, CaseRow } from "@/server/repositories/rows";
import type { DuplicateDetectionResult } from "@/lib/ai/types";

function row(overrides: Partial<CaseRow> & { id: string }): CaseRow {
  return {
    display_sequence: 1,
    display_id: `VOT-${overrides.id}`,
    category: "street_lighting",
    status: "reported",
    title: `Caso ${overrides.id}`,
    description: "Luminaria apagada frente al parque desde hace tres semanas.",
    latitude: 19.41,
    longitude: -99.17,
    colonia: "Condesa",
    address_hint: null,
    has_safety_concern: false,
    has_accessibility_concern: false,
    created_by_user_id: null,
    reporter_email: null,
    is_demo: false,
    is_published: true,
    resolved_at: null,
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

function aggregate(rowValue: CaseRow, supportCount = 0): CaseAggregate {
  return { row: rowValue, photos: [], support_count: supportCount, observation_count: 0, supported_by_me: false };
}

function matches(
  entries: Array<{
    case_id: string;
    relationship: DuplicateDetectionResult["matches"][number]["relationship"];
    confidence: number | null;
    explanation?: string;
    distance_meters?: number | null;
  }>,
): DuplicateDetectionResult {
  return {
    analyzed_case_id: null,
    matches: entries.map((entry) => ({
      case_id: entry.case_id,
      relationship: entry.relationship,
      explanation: entry.explanation ?? "Los reportes describen la misma luminaria.",
      evidence: ["misma luminaria", "misma cuadra"],
      confidence: entry.confidence,
      distance_meters: entry.distance_meters ?? 40,
      category_match: true,
    })),
    shortlisted_count: entries.length,
    compared_with_model: true,
    model: "deepseek-flash",
    analysis_version: "1",
    analyzed_at: "2026-10-30T10:00:00.000Z",
    fallback: false,
    notes: [],
    comparison_method: "model",
  };
}

describe("buildSimilarCases", () => {
  it("keeps open cases ranked same_problem first, then by confidence", () => {
    const aggregates = [
      aggregate(row({ id: "a" }), 4),
      aggregate(row({ id: "b" }), 2),
      aggregate(row({ id: "c" }), 9),
    ];

    const result = buildSimilarCases(
      matches([
        { case_id: "a", relationship: "related_problem", confidence: 0.9 },
        { case_id: "b", relationship: "same_problem", confidence: 0.6 },
        { case_id: "c", relationship: "same_problem", confidence: 0.8 },
      ]),
      aggregates,
    );

    expect(result.map((item) => item.case_id)).toEqual(["c", "b", "a"]);
    expect(result[0]).toMatchObject({
      display_id: "VOT-c",
      support_count: 9,
      confidence: 0.8,
      relationship: "same_problem",
    });
    expect(result[0]?.evidence.length).toBeGreaterThan(0);
  });

  it("drops different_problem, resolved cases and low-confidence matches", () => {
    const aggregates = [
      aggregate(row({ id: "same" })),
      aggregate(row({ id: "different" })),
      aggregate(row({ id: "resolved", status: "resolved" })),
      aggregate(row({ id: "weak" })),
    ];

    const result = buildSimilarCases(
      matches([
        { case_id: "same", relationship: "same_problem", confidence: 0.7 },
        { case_id: "different", relationship: "different_problem", confidence: 0.99 },
        { case_id: "resolved", relationship: "same_problem", confidence: 0.95 },
        { case_id: "weak", relationship: "uncertain", confidence: 0.1 },
      ]),
      aggregates,
    );

    expect(result.map((item) => item.case_id)).toEqual(["same"]);
  });

  it("caps the list at three suggestions and tolerates missing candidates", () => {
    const aggregates = ["a", "b", "c", "d"].map((id) => aggregate(row({ id })));

    const result = buildSimilarCases(
      matches([
        { case_id: "a", relationship: "same_problem", confidence: 0.9 },
        { case_id: "b", relationship: "same_problem", confidence: 0.8 },
        { case_id: "c", relationship: "same_problem", confidence: 0.7 },
        { case_id: "d", relationship: "same_problem", confidence: 0.6 },
        { case_id: "missing", relationship: "same_problem", confidence: 0.99 },
      ]),
      aggregates,
    );

    expect(result).toHaveLength(3);
  });

  it("returns nothing when there was no comparison", () => {
    expect(buildSimilarCases(null, [])).toEqual([]);
  });
});
