import { describe, expect, it } from "vitest";
import { generateCaseBrief } from "../services/generate-case-brief";
import type { CaseBriefInput, HistoricalRecord, ReportClassification } from "../types";
import { createMockClient } from "./test-helpers";

const NOW = new Date("2026-10-30T12:00:00.000Z");

const classification: ReportClassification = {
  suggested_category: "traffic_signals",
  suggested_title: "Semáforo descompuesto",
  normalized_summary: "El semáforo del cruce no funciona y los peatones cruzan sin señal.",
  safety_concerns: ["La falla podría aumentar el riesgo de cruce."],
  accessibility_considerations: [],
  suggested_department: "Secretaría de Movilidad",
  required_specialist_skill: "Ingeniería de tránsito",
  needs_more_information: false,
  missing_information: [],
  uncertainty_notes: null,
  severity: "high",
  confidence: 0.8,
  original_description: "El semáforo no sirve.",
  input_truncated: false,
  model: "mock-model",
  analysis_version: "2026-10-30.1",
  analyzed_at: NOW.toISOString(),
  fallback: false,
};

const historical: HistoricalRecord[] = [
  {
    id: "hist-1",
    source: "datos_abiertos_cdmx",
    category: "traffic_signals",
    occurred_at: "2026-08-01T00:00:00.000Z",
    colonia: "Centro",
  },
  {
    id: "hist-2",
    source: "datos_abiertos_cdmx",
    category: "traffic_signals",
    occurred_at: "2026-09-15T00:00:00.000Z",
    colonia: "Centro",
  },
];

function briefInput(overrides: Partial<CaseBriefInput> = {}): CaseBriefInput {
  return {
    report: {
      case_id: "case-1",
      description:
        "El semáforo de la esquina no sirve y ayer casi atropellan a una señora.",
      category: "traffic_signals",
      location: { latitude: 19.42, longitude: -99.16, colonia: "Centro" },
      status: "under_review",
    },
    classification,
    duplicates: {
      analyzed_case_id: "case-1",
      matches: [
        {
          case_id: "case-2",
          relationship: "same_problem",
          explanation: "Describe la misma falla en el mismo cruce.",
          evidence: [],
          confidence: 0.9,
          distance_meters: 30,
          category_match: true,
        },
      ],
      shortlisted_count: 1,
      compared_with_model: true,
      model: "mock-model",
      analysis_version: "2026-10-30.1",
      analyzed_at: NOW.toISOString(),
      fallback: false,
      notes: [],
    },
    historical_records: historical,
    ...overrides,
  };
}

function briefResponse(overrides: Record<string, unknown> = {}) {
  return {
    summary: "El caso reporta una falla del semáforo en un cruce con riesgo peatonal.",
    potential_risks: [
      {
        risk: "Una falla del semáforo podría aumentar el riesgo de cruce.",
        evidence: ["El semáforo no sirve."],
        uncertainty: null,
      },
    ],
    related_cases: [
      {
        case_id: "case-2",
        relationship: "same_problem",
        explanation: "Misma falla reportada en el mismo cruce.",
      },
      {
        case_id: "caso-inventado",
        relationship: "same_problem",
        explanation: "Este caso no fue proporcionado.",
      },
    ],
    historical_context: {
      summary: "Hay dos registros históricos del mismo cruce en los datos entregados.",
      source_record_ids: ["hist-1", "hist-inventado"],
    },
    suggested_department: "Secretaría de Movilidad",
    jurisdiction: "municipal",
    jurisdiction_note: "Competencia municipal; validar la vía.",
    suggested_action: "Revisar el controlador del semáforo en sitio.",
    priority_factors: ["Riesgo vial en un cruce peatonal."],
    missing_information: [],
    requires_human_review: false,
    ...overrides,
  };
}

describe("generateCaseBrief", () => {
  it("cites only historical records that were actually provided", async () => {
    const client = createMockClient({ response: briefResponse() });
    const result = await generateCaseBrief(briefInput(), { client, now: () => NOW });

    expect(result.historical_context.source_record_ids).toEqual(["hist-1"]);
    expect(result.historical_context.summary).toContain("dos registros históricos");
    expect(result.fallback).toBe(false);
    expect(result.requires_human_review).toBe(true);
  });

  it("removes fabricated related case ids", async () => {
    const client = createMockClient({ response: briefResponse() });
    const result = await generateCaseBrief(briefInput(), { client, now: () => NOW });

    expect(result.related_cases.map((item) => item.case_id)).toEqual(["case-2"]);
    expect(result.related_cases.some((item) => item.case_id === "caso-inventado")).toBe(false);
  });

  it("states clearly when no historical records were provided", async () => {
    const client = createMockClient({
      response: briefResponse({
        historical_context: {
          summary: "Se encontraron antecedentes similares en la zona.",
          source_record_ids: ["anything"],
        },
      }),
    });
    const result = await generateCaseBrief(
      briefInput({ historical_records: [] }),
      { client, now: () => NOW },
    );

    expect(result.historical_context.summary).toBe(
      "No se proporcionaron registros históricos para este caso.",
    );
    expect(result.historical_context.source_record_ids).toEqual([]);
  });

  it("falls back deterministically when the model fails", async () => {
    const client = createMockClient({
      fail: { code: "timeout", message: "El servicio tardó demasiado.", retryable: true },
    });
    const result = await generateCaseBrief(briefInput(), { client, now: () => NOW });

    expect(result.fallback).toBe(true);
    expect(result.requires_human_review).toBe(true);
    expect(result.historical_context.source_record_ids).toEqual(["hist-2", "hist-1"]);
    expect(result.summary).toContain("Centro");
    expect(client.calls).toHaveLength(1);
  });

  it("does not assert an accident the report never mentioned", async () => {
    const client = createMockClient({
      response: briefResponse({
        potential_risks: [
          { risk: "Hubo un accidente en el cruce.", evidence: [], uncertainty: null },
          {
            risk: "La falta de luz podría reducir la visibilidad.",
            evidence: ["La lámpara no prende."],
            uncertainty: null,
          },
        ],
      }),
    });
    const result = await generateCaseBrief(
      briefInput({
        report: {
          case_id: "case-9",
          description: "La lámpara del poste no prende desde hace tres noches.",
          category: "street_lighting",
          location: { latitude: 19.42, longitude: -99.16, colonia: "Centro" },
        },
      }),
      { client, now: () => NOW },
    );

    expect(result.potential_risks.map((risk) => risk.risk).join(" ")).not.toMatch(/accidente/i);
    expect(result.potential_risks.map((risk) => risk.risk).join(" ")).toContain("visibilidad");
  });

  it("keeps an accident risk when the citizen reported one", async () => {
    const client = createMockClient({
      response: briefResponse({
        potential_risks: [
          {
            risk: "Hubo un accidente previo en el cruce.",
            evidence: ["Casi atropellan a una señora."],
            uncertainty: null,
          },
        ],
      }),
    });
    const result = await generateCaseBrief(briefInput(), { client, now: () => NOW });

    expect(result.potential_risks[0].risk).toContain("accidente");
  });

  it("marks unknown jurisdictions as uncertain", async () => {
    const client = createMockClient({
      response: briefResponse({
        jurisdiction: "dependencia_desconocida",
        jurisdiction_note: "No se pudo confirmar la autoridad responsable.",
      }),
    });
    const result = await generateCaseBrief(briefInput(), { client, now: () => NOW });

    expect(result.jurisdiction).toBe("uncertain");
    expect(result.jurisdiction_note).toContain("No se pudo confirmar");
  });

  it("uses deterministic related cases when the model omits them", async () => {
    const client = createMockClient({
      response: briefResponse({ related_cases: [], historical_context: { summary: "", source_record_ids: [] } }),
    });
    const result = await generateCaseBrief(briefInput(), { client, now: () => NOW });

    expect(result.related_cases.map((item) => item.case_id)).toEqual(["case-2"]);
    expect(result.historical_context.source_record_ids).toEqual(["hist-2", "hist-1"]);
  });

  it("returns a deterministic brief when the AI is not configured", async () => {
    const client = createMockClient({ configured: false });
    const result = await generateCaseBrief(briefInput(), { client, now: () => NOW });

    expect(result.fallback).toBe(true);
    expect(result.suggested_department).toBe("Secretaría de Movilidad");
    expect(result.potential_risks.length).toBeGreaterThan(0);
    expect(client.calls).toHaveLength(0);
  });
});
