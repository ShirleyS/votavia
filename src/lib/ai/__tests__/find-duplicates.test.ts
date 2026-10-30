import { describe, expect, it } from "vitest";
import { findDuplicateReports } from "../services/find-duplicates";
import type { DuplicateCandidateInput, GeoInput, ReportInput } from "../types";
import { createMockClient, missingKeyError } from "./test-helpers";

const NOW = new Date("2026-10-30T12:00:00.000Z");

const report: ReportInput = {
  case_id: "case-1",
  description: "El semáforo del cruce no funciona desde ayer y nadie lo ha reportado.",
  category: "traffic_signals",
  location: { latitude: 19.42, longitude: -99.16, colonia: "Centro" },
};

function candidate(
  overrides: Partial<DuplicateCandidateInput> & { case_id: string },
): DuplicateCandidateInput {
  return {
    description: "El semáforo está descompuesto y no cambia a verde.",
    category: "traffic_signals",
    status: "reported",
    location: { latitude: 19.4203, longitude: -99.16, colonia: "Centro" },
    created_at: "2026-10-29T10:00:00.000Z",
    ...overrides,
  };
}

function comparison(
  caseId: string,
  relationship = "same_problem",
  confidence = 0.9,
) {
  return {
    case_id: caseId,
    relationship,
    explanation: "Ambos reportes describen la misma falla en el mismo cruce.",
    evidence: ["misma categoría", "misma esquina"],
    confidence,
  };
}

describe("findDuplicateReports", () => {
  it("finds the same problem described with different wording", async () => {
    const client = createMockClient({
      response: { comparisons: [comparison("case-2")] },
    });
    const result = await findDuplicateReports(
      report,
      [candidate({ case_id: "case-2" })],
      { client, now: () => NOW },
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].relationship).toBe("same_problem");
    expect(result.matches[0].distance_meters).not.toBeNull();
    expect(result.compared_with_model).toBe(true);
    expect(result.fallback).toBe(false);
    expect(client.calls).toHaveLength(1);
  });

  it("sends multiple nearby candidates in a single bounded request", async () => {
    const client = createMockClient({
      response: {
        comparisons: [
          comparison("case-3", "different_problem", 0.5),
          comparison("case-2", "same_problem", 0.88),
        ],
      },
    });
    const result = await findDuplicateReports(
      report,
      [
        candidate({ case_id: "case-2" }),
        candidate({
          case_id: "case-3",
          description: "Falta pintura en el paso peatonal del mismo cruce.",
          location: { latitude: 19.4205, longitude: -99.1602 },
        }),
      ],
      { client, now: () => NOW },
    );

    expect(client.calls).toHaveLength(1);
    expect(result.shortlisted_count).toBe(2);
    expect(result.matches.map((match) => match.case_id)).toEqual(["case-2", "case-3"]);
    expect(result.matches[0].relationship).toBe("same_problem");
  });

  it("rejects the same category when the location is far away", async () => {
    const client = createMockClient({ response: { comparisons: [] } });
    const result = await findDuplicateReports(
      report,
      [
        candidate({
          case_id: "case-far",
          location: { latitude: 19.45, longitude: -99.16, colonia: "Centro" },
        }),
      ],
      { client, now: () => NOW },
    );

    expect(result.shortlisted_count).toBe(0);
    expect(result.matches).toHaveLength(0);
    expect(result.notes.join(" ")).toContain("fuera del radio");
    expect(client.calls).toHaveLength(0);
  });

  it("rejects a different problem at the same location", async () => {
    const client = createMockClient({ response: { comparisons: [] } });
    const result = await findDuplicateReports(
      report,
      [candidate({ case_id: "case-lamp", category: "street_lighting" })],
      { client, now: () => NOW },
    );

    expect(result.shortlisted_count).toBe(0);
    expect(result.notes.join(" ")).toContain("categoría no compatible");
    expect(client.calls).toHaveLength(0);
  });

  it("excludes resolved cases unless explicitly requested", async () => {
    const client = createMockClient({ response: { comparisons: [comparison("case-2")] } });
    const candidates = [candidate({ case_id: "case-2", status: "resolved" })];

    const excluded = await findDuplicateReports(report, candidates, {
      client,
      now: () => NOW,
    });
    expect(excluded.shortlisted_count).toBe(0);

    const included = await findDuplicateReports(report, candidates, {
      client,
      now: () => NOW,
      includeResolved: true,
    });
    expect(included.shortlisted_count).toBe(1);
  });

  it("returns an empty result when there are no candidates", async () => {
    const client = createMockClient({ response: { comparisons: [] } });
    const result = await findDuplicateReports(report, [], { client, now: () => NOW });

    expect(result.matches).toEqual([]);
    expect(result.compared_with_model).toBe(false);
    expect(result.notes.join(" ")).toContain("No se encontraron candidatos");
  });

  it("discards comparisons with unknown case ids", async () => {
    const client = createMockClient({
      response: { comparisons: [comparison("case-2"), comparison("ghost-case")] },
    });
    const result = await findDuplicateReports(
      report,
      [candidate({ case_id: "case-2" })],
      { client, now: () => NOW },
    );

    expect(result.matches.map((match) => match.case_id)).toEqual(["case-2"]);
    expect(result.matches.some((match) => match.case_id === "ghost-case")).toBe(false);
    expect(result.notes.join(" ")).toContain("identificadores no solicitados");
  });

  it("marks candidates uncertain when the model output is invalid", async () => {
    const client = createMockClient({ response: { comparisons: [{ case_id: 5 }] } });
    const result = await findDuplicateReports(
      report,
      [candidate({ case_id: "case-2" })],
      { client, now: () => NOW },
    );

    expect(result.fallback).toBe(true);
    expect(result.matches[0].relationship).toBe("uncertain");
    expect(result.notes.join(" ")).toContain("schema_validation");
  });

  it("falls back deterministically when the AI is not configured", async () => {
    const client = createMockClient({ configured: false });
    const result = await findDuplicateReports(
      report,
      [candidate({ case_id: "case-2" })],
      { client, now: () => NOW },
    );

    expect(result.fallback).toBe(true);
    expect(result.compared_with_model).toBe(false);
    expect(result.matches[0].relationship).toBe("uncertain");
    expect(result.matches[0].distance_meters).not.toBeNull();
  });

  it("falls back safely on a model error", async () => {
    const client = createMockClient({ fail: missingKeyError });
    const result = await findDuplicateReports(
      report,
      [candidate({ case_id: "case-2" })],
      { client, now: () => NOW },
    );

    expect(result.fallback).toBe(true);
    expect(result.notes.join(" ")).toContain("missing_key");
  });

  it("uses the colonia when the report has no coordinates", async () => {
    const withoutCoords = {
      ...report,
      location: { colonia: "Centro" } as unknown as GeoInput,
    };
    const client = createMockClient({
      response: { comparisons: [comparison("case-2")] },
    });
    const result = await findDuplicateReports(
      withoutCoords,
      [
        candidate({
          case_id: "case-2",
          location: undefined,
          latitude: null,
          longitude: null,
          colonia: "Centro",
        }),
      ],
      { client, now: () => NOW },
    );

    expect(result.shortlisted_count).toBe(1);
    expect(result.matches[0].distance_meters).toBeNull();
    expect(result.notes.join(" ")).toContain("coordenadas válidas");
  });

  it("bounds oversized candidate lists", async () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      candidate({
        case_id: `case-${index + 2}`,
        location: {
          latitude: 19.42 + index * 0.00001,
          longitude: -99.16,
          colonia: "Centro",
        },
      }),
    );
    const client = createMockClient({ response: { comparisons: [] } });
    const result = await findDuplicateReports(report, candidates, {
      client,
      now: () => NOW,
    });

    expect(result.shortlisted_count).toBeLessThanOrEqual(8);
    expect(result.matches.length).toBeLessThanOrEqual(8);
  });
});
