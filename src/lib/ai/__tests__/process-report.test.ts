import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import type { AIClient, AIClientRequest, AIClientResult } from "../client";
import { processReport, fallbackClassification } from "../index";
import { reportProcessingResultSchema } from "../schemas";
import { governmentRecordToReportInput } from "../adapters/case-repository";
import { assessResolution } from "../utils/resolution";
import type { IssueLinkCandidate, ReportInput } from "../types";
import { missingKeyError } from "./test-helpers";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const now = () => NOW;

const POTHOLE_TEXT =
  "Hay un bache enorme en la esquina de Colima y Orizaba; ya se tragó una llanta de un vecino y los coches lo esquivan.";

const potholeReport: ReportInput = {
  case_id: "case-citizen-1",
  description: POTHOLE_TEXT,
  category: "road_damage",
  location: { latitude: 19.4195, longitude: -99.1605, colonia: "Roma Norte" },
  created_at: "2026-10-30T09:00:00.000Z",
  supporters: 4,
  evidence_count: 1,
};

/** Routes each request to the right fixture by inspecting the schema shape. */
function routedClient(options: {
  classification?: unknown;
  links?: unknown;
  fail?: typeof missingKeyError;
  configured?: boolean;
  model?: string;
  hang?: boolean;
}): AIClient & { calls: AIClientRequest[] } {
  const calls: AIClientRequest[] = [];
  const model = options.model ?? "mock-deepseek";
  return {
    model,
    configured: options.configured ?? true,
    calls,
    async completeJson<T>(
      request: AIClientRequest,
      schema: ZodType<T>,
    ): Promise<AIClientResult<T>> {
      calls.push(request);
      if (options.hang) return new Promise<AIClientResult<T>>(() => {});
      if (options.fail) {
        return { ok: false, error: options.fail, model, latency_ms: 1 };
      }
      const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      const raw = "links" in shape ? options.links : options.classification;
      if (raw === undefined) {
        return {
          ok: false,
          error: { code: "unexpected", message: "sin fixture para este esquema", retryable: false },
          model,
          latency_ms: 1,
        };
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: "schema_validation", message: "fixture inválida", retryable: false },
          model,
          latency_ms: 1,
        };
      }
      return { ok: true, data: parsed.data, model, latency_ms: 1, cached: false };
    },
  };
}

function classificationFixture(overrides: Record<string, unknown> = {}) {
  return {
    suggested_category: "road_damage",
    suggested_title: "Bache profundo en Colima y Orizaba",
    normalized_summary:
      "Bache profundo en la esquina de Colima y Orizaba que daña llantas y obliga a los coches a esquivarlo.",
    safety_concerns: ["Riesgo para motociclistas y ciclistas."],
    accessibility_considerations: [],
    suggested_department: "Secretaría de Obras y Servicios",
    required_specialist_skill: "bacheo",
    needs_more_information: false,
    missing_information: [],
    uncertainty_notes: "La profundidad exacta no se puede medir en el texto.",
    severity: "high",
    severity_rationale: "Un bache que ya dañó un vehículo sugiere riesgo alto.",
    confidence: 0.86,
    ...overrides,
  };
}

function linkFixture(
  candidateIssueId: string,
  relationship = "same_problem",
  confidence = 0.91,
  explanation = "Ambos reportes describen el mismo bache en la misma esquina.",
) {
  return {
    links: [
      {
        candidate_issue_id: candidateIssueId,
        relationship,
        explanation,
        evidence: ["mismo bache", "misma esquina"],
        confidence,
      },
    ],
  };
}

function candidate(
  overrides: Partial<IssueLinkCandidate> & { case_id: string },
): IssueLinkCandidate {
  return {
    description: "Bache profundo en Colima y Orizaba, frente al número 120.",
    category: "road_damage",
    status: "reported",
    location: { latitude: 19.4196, longitude: -99.1604, colonia: "Roma Norte" },
    created_at: "2026-10-29T18:00:00.000Z",
    ...overrides,
  };
}

function expectValid(result: unknown) {
  const parsed = reportProcessingResultSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error(`salida inválida: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  }
}

describe("processReport — citizen report to shared issue", () => {
  it("classifies a representative Spanish pothole report and keeps submission open", async () => {
    const client = routedClient({ classification: classificationFixture() });

    const result = await processReport(potholeReport, { client, now });

    expectValid(result);
    expect(result.api_version).toBe("v1");
    expect(result.case_id).toBe("case-citizen-1");
    expect(result.source).toBe("citizen_web");
    expect(result.original_text).toBe(POTHOLE_TEXT);
    expect(result.classification.suggested_category).toBe("road_damage");
    expect(result.classification.severity).toBe("high");
    expect(result.classification.confidence).toBeGreaterThan(0.7);
    expect(result.classification.explanation).toContain("road_damage");
    expect(result.responsible_area.suggested_department).toContain("Obras");
    expect(result.responsible_area.advisory).toBe(true);
    expect(result.responsible_area.assigned).toBe(false);
    expect(result.priority.is_verified).toBe(false);
    expect(result.duplicate_suggestions).toEqual([]);
    expect(result.auto_merge).toBe(false);
    expect(result.requires_human_review).toBe(true);
    expect(result.submission_allowed).toBe(true);
    expect(result.ai_available).toBe(true);
    expect(result.fallback).toBe(false);
    expect(result.degraded_reasons).toEqual([]);
  });

  it("suggests linking two independent reports of the same pothole to one issue", async () => {
    const client = routedClient({
      classification: classificationFixture(),
      links: linkFixture("issue-pothole-1"),
    });

    const result = await processReport(potholeReport, {
      client,
      now,
      candidates: [
        candidate({ case_id: "case-citizen-2", issue_id: "issue-pothole-1" }),
        candidate({
          case_id: "case-citizen-3",
          issue_id: "issue-pothole-1",
          description: "El mismo hoyo de Colima y Orizaba sigue abierto; ya van dos semanas.",
          created_at: "2026-10-28T08:00:00.000Z",
        }),
      ],
    });

    expectValid(result);
    expect(result.duplicate_suggestions).toHaveLength(1);
    const [suggestion] = result.duplicate_suggestions;
    expect(suggestion.candidate_issue_id).toBe("issue-pothole-1");
    expect(suggestion.candidate_case_ids).toEqual(["case-citizen-2", "case-citizen-3"]);
    expect(suggestion.relationship).toBe("same_problem");
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.7);
    expect(suggestion.explanation.length).toBeGreaterThan(5);
    expect(suggestion.distance_meters).toBeLessThan(30);
    expect(suggestion.auto_merge).toBe(false);
    expect(result.candidate_issue_ids).toEqual(["issue-pothole-1"]);
    expect(result.candidate_case_ids).toEqual(["case-citizen-2", "case-citizen-3"]);
    expect(result.issue_link_summary.comparison_method).toBe("model");

    const priorityFactor = result.priority.factors.find(
      (factor) => factor.code === "independent_reports",
    );
    expect(priorityFactor?.value).toBeGreaterThan(0);
  });

  it("never links the same description at a clearly different location", async () => {
    const client = routedClient({
      classification: classificationFixture(),
      links: linkFixture("issue-far"),
    });

    const result = await processReport(potholeReport, {
      client,
      now,
      candidates: [
        candidate({
          case_id: "case-far",
          issue_id: "issue-far",
          location: { latitude: 19.46, longitude: -99.1605, colonia: "Roma Norte" },
        }),
      ],
    });

    expectValid(result);
    expect(result.duplicate_suggestions).toEqual([]);
    expect(result.candidate_issue_ids).toEqual([]);
    expect(result.candidate_case_ids).toEqual([]);
    expect(result.issue_link_summary.evaluated_candidates).toBe(1);
    expect(result.issue_link_summary.shortlisted_count).toBe(0);
    expect(result.issue_link_summary.comparison_method).toBe("deterministic");
  });

  it("keeps two different hazards at one intersection separate", async () => {
    const subject: ReportInput = {
      case_id: "case-signal",
      description:
        "El semáforo de la esquina de Colima y Orizaba no cambia a verde y los coches se pasan.",
      category: "traffic_signals",
      location: { latitude: 19.42, longitude: -99.16, colonia: "Centro" },
      created_at: NOW.toISOString(),
    };
    const client = routedClient({
      classification: classificationFixture({
        suggested_category: "traffic_signals",
        suggested_title: "Semáforo descompuesto",
        severity: "high",
      }),
      links: linkFixture(
        "issue-sidewalk",
        "different_problem",
        0.88,
        "Uno es un semáforo y el otro una banqueta levantada: son problemas distintos.",
      ),
    });

    const result = await processReport(subject, {
      client,
      now,
      candidates: [
        candidate({
          case_id: "case-broken-sidewalk",
          issue_id: "issue-sidewalk",
          category: "sidewalk_accessibility",
          description: "La banqueta está levantada y una señora se cayó con su carriola.",
        }),
      ],
    });

    expectValid(result);
    expect(result.duplicate_suggestions).toHaveLength(1);
    expect(result.duplicate_suggestions[0].relationship).toBe("different_problem");
    expect(result.duplicate_suggestions[0].auto_merge).toBe(false);
    expect(result.candidate_issue_ids).toEqual([]);
    expect(result.candidate_case_ids).toEqual([]);
  });

  it("links an imported SUAC record to a citizen report and preserves its original category", async () => {
    const imported = governmentRecordToReportInput({
      record_id: "SUAC-2026-0847",
      title: "BACHE",
      description: "Reporte ciudadano de bache en Colima y Orizaba, colonia Roma Norte.",
      original_category: "BACHE",
      colonia: "Roma Norte",
      latitude: 19.4196,
      longitude: -99.1605,
      reported_at: "2026-10-20T16:00:00.000Z",
      source_label: "SUAC",
    });

    const client = routedClient({
      classification: classificationFixture({
        suggested_category: "road_damage",
        suggested_title: "Bache en Roma Norte",
      }),
      links: linkFixture("issue-pothole-1"),
    });

    const result = await processReport(imported, {
      client,
      now,
      candidates: [candidate({ case_id: "case-citizen-9", issue_id: "issue-pothole-1" })],
    });

    expectValid(result);
    expect(result.case_id).toBeNull();
    expect(result.source).toBe("government_record");
    expect(result.original_category).toBe("BACHE");
    expect(result.classification.suggested_category).toBe("road_damage");
    expect(result.candidate_issue_ids).toEqual(["issue-pothole-1"]);
    expect(result.candidate_case_ids).toEqual(["case-citizen-9"]);
  });

  it("compares by colonia when coordinates are missing or approximate", async () => {
    const coloniaOnly: ReportInput = {
      ...potholeReport,
      case_id: "case-approx",
      location: { latitude: Number.NaN, longitude: Number.NaN, colonia: "Roma Norte" },
    };
    const client = routedClient({
      classification: classificationFixture(),
      links: linkFixture("issue-pothole-1"),
    });

    const result = await processReport(coloniaOnly, {
      client,
      now,
      candidates: [candidate({ case_id: "case-citizen-2", issue_id: "issue-pothole-1" })],
    });

    expectValid(result);
    expect(result.duplicate_suggestions).toHaveLength(1);
    expect(result.duplicate_suggestions[0].distance_meters).toBeNull();
    expect(result.candidate_issue_ids).toEqual(["issue-pothole-1"]);
  });
});

describe("processReport — reliability and fallbacks", () => {
  it("still accepts the report when the provider key is missing", async () => {
    const client = routedClient({ configured: false });

    const result = await processReport(potholeReport, {
      client,
      now,
      candidates: [candidate({ case_id: "case-citizen-2", issue_id: "issue-pothole-1" })],
    });

    expectValid(result);
    expect(result.submission_allowed).toBe(true);
    expect(result.ai_available).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.classification.suggested_category).toBe("road_damage");
    expect(result.responsible_area.assigned).toBe(false);
    expect(result.degraded_reasons).toContain("ai_not_configured");
    expect(result.duplicate_suggestions.every((item) => item.auto_merge === false)).toBe(true);
    expect(client.calls).toHaveLength(0);
  });

  it("returns deterministic results when the provider call fails", async () => {
    const client = routedClient({ fail: missingKeyError });

    const result = await processReport(potholeReport, {
      client,
      now,
      candidates: [candidate({ case_id: "case-citizen-2", issue_id: "issue-pothole-1" })],
    });

    expectValid(result);
    expect(result.fallback).toBe(true);
    expect(result.ai_available).toBe(false);
    expect(result.submission_allowed).toBe(true);
    expect(result.degraded_reasons).toContain("classification_fallback");
    expect(result.duplicate_suggestions).toHaveLength(1);
  });

  it("enforces a hard deadline and never throws on a hung provider", async () => {
    const client = routedClient({ hang: true });

    const started = Date.now();
    const result = await processReport(potholeReport, {
      client,
      now,
      timeout_ms: 250,
      candidates: [candidate({ case_id: "case-citizen-2", issue_id: "issue-pothole-1" })],
    });

    expect(Date.now() - started).toBeLessThan(2_000);
    expectValid(result);
    expect(result.fallback).toBe(true);
    expect(result.submission_allowed).toBe(true);
    expect(result.degraded_reasons).toContain("classification_timeout");
    expect(result.degraded_reasons).toContain("issue_link_timeout");
    expect(result.duplicate_suggestions).toEqual([]);
    expect(result.classification.suggested_category).toBe("road_damage");
  });

  it("handles ambiguous Spanish voice transcriptions without losing the original text", async () => {
    const transcript =
      "ehh... este... 00:14 no sé, como que algo pasó ahí en la esquina [inaudible], ¿me entiende?";
    const report: ReportInput = {
      case_id: "case-voice-1",
      description: transcript,
      source: "voice_transcription",
      source_label: "Llamada 072",
      created_at: NOW.toISOString(),
    };

    const result = await processReport(report, { client: routedClient({ configured: false }), now });

    expectValid(result);
    expect(result.source).toBe("voice_transcription");
    expect(result.original_text).toBe(transcript);
    expect(result.classification.suggested_category).toBe("other");
    expect(result.classification.needs_more_information).toBe(true);
    expect(result.submission_allowed).toBe(true);
  });

  it("flags a government closure that newer citizen evidence disputes", () => {
    const signal = assessResolution({
      official_status: "closed",
      closed_at: "2026-10-10T12:00:00.000Z",
      evidence: [
        {
          id: "evidence-1",
          kind: "photo",
          body: "El bache sigue abierto y volvió a dañar una llanta.",
          created_at: "2026-10-27T09:00:00.000Z",
          actor_type: "citizen",
        },
      ],
      now: NOW.toISOString(),
    });

    expect(signal.signal_type).toBe("persists_after_closure");
    expect(signal.possible_persistence).toBe(true);
    expect(signal.declares_resolved).toBe(false);
    expect(signal.declares_fraud).toBe(false);
    expect(signal.requires_human_review).toBe(true);
    expect(signal.explanation).toContain("no se declara resuelto ni se califica de fraude");

    const disputed = assessResolution({
      official_status: "closed",
      closed_at: "2026-10-10T12:00:00.000Z",
      evidence: [
        {
          id: "evidence-2",
          kind: "photo",
          body: "Adjunto una foto del lugar para que la revisen.",
          created_at: "2026-10-27T09:00:00.000Z",
          actor_type: "citizen",
        },
      ],
      now: NOW.toISOString(),
    });

    expect(disputed.signal_type).toBe("disputed_closure");
    expect(disputed.declares_resolved).toBe(false);
    expect(disputed.declares_fraud).toBe(false);
  });
});

describe("deterministic classification regressions (QA F-04 / F-05)", () => {
  const cases: Array<[string, string]> = [
    ["El semáforo está intermitente y nadie lo arregla.", "traffic_signals"],
    ["Árbol caído en la banqueta después de la lluvia.", "trees_vegetation"],
    ["Banqueta rota frente a la escuela.", "road_damage"],
    ["La luminaria apagada tiene dos semanas.", "street_lighting"],
    ["Hay basura acumulada junto al parque.", "waste_sanitation"],
  ];

  for (const [description, expected] of cases) {
    it(`classifies "${description}" as ${expected}`, () => {
      const result = fallbackClassification(
        {
          description,
          location: { latitude: 19.42, longitude: -99.16, colonia: "Centro" },
        },
        { client: { model: "none", configured: false, completeJson: async () => {
          throw new Error("no debe llamarse");
        } }, now },
      );
      expect(result.suggested_category).toBe(expected);
      expect(result.fallback).toBe(true);
    });
  }
});
