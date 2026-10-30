import { describe, expect, it } from "vitest";
import { inferReportSource, normalizeReportIntake } from "../services/intake";
import { suggestPriority } from "../utils/priority";
import { assessResolution } from "../utils/resolution";
import { governmentRecordToReportInput } from "../adapters/case-repository";
import { daysAgo } from "./test-helpers";

const NOW = "2026-10-30T12:00:00.000Z";

describe("normalizeReportIntake", () => {
  it("cleans voice transcription artifacts but keeps the verbatim text", () => {
    const raw =
      "[00:03] Hola, este... hay un ba-bache muy grande en la esquina [inaudible] y ya se rompió una llanta.";

    const intake = normalizeReportIntake({
      description: raw,
      source: "voice_transcription",
      location: { latitude: 19.4195, longitude: -99.1605, colonia: "Roma Norte" },
    });

    expect(intake.source).toBe("voice_transcription");
    expect(intake.transcription.detected).toBe(true);
    expect(intake.transcription.artifacts_removed).toEqual(
      expect.arrayContaining(["marcas de tiempo", "marcadores de audio"]),
    );
    expect(intake.original_text).toBe(raw);
    expect(intake.normalized_text).not.toContain("inaudible");
    expect(intake.normalized_text).not.toContain("00:03");
    expect(intake.category.normalized_category).toBe("road_damage");
  });

  it("preserves the original category of an imported government record", () => {
    const imported = governmentRecordToReportInput({
      record_id: "SUAC-1",
      description: "Bache reportado en la vía pública.",
      original_category: "Baches y pavimento dañado",
      colonia: "Centro",
      reported_at: "2026-10-20T10:00:00.000Z",
    });

    const intake = normalizeReportIntake(imported);

    expect(intake.source).toBe("government_record");
    expect(intake.category.original_category).toBe("Baches y pavimento dañado");
    expect(intake.category.original_preserved).toBe(true);
    expect(intake.category.normalized_category).toBe("road_damage");
    expect(intake.location_precision).toBe("colonia");
    expect(intake.missing_fields).not.toContain("categoría");
  });

  it("records missing and approximate location without inventing coordinates", () => {
    const intake = normalizeReportIntake({
      description: "La banqueta de la calle está levantada y no pasa una silla de ruedas.",
    });

    expect(intake.location).toBeNull();
    expect(intake.location_precision).toBe("none");
    expect(intake.missing_fields).toContain("ubicación");
  });

  it("keeps ambiguous language as-is and flags missing information", () => {
    const intake = normalizeReportIntake({
      description: "Hay algo raro aquí, no sé bien qué sea.",
    });

    expect(intake.category.normalized_category).toBeNull();
    expect(intake.missing_fields).toEqual(
      expect.arrayContaining(["categoría", "ubicación"]),
    );
  });

  it("infers the intake channel from the source label", () => {
    expect(inferReportSource({ source_label: "SUAC" })).toBe("government_record");
    expect(inferReportSource({ source_label: "Llamada al 072" })).toBe("voice_transcription");
    expect(inferReportSource({ source_label: "WhatsApp" })).toBe("messaging");
    expect(inferReportSource({ source_label: null })).toBe("citizen_web");
  });

  it("redacts personal data before building the prompt copy", () => {
    const intake = normalizeReportIntake({
      description: "Soy Ana, mi teléfono es 5512345678 y mi correo ana@ejemplo.com. Hay un bache.",
      source: "citizen_web",
    });

    expect(intake.original_text).toContain("5512345678");
    expect(intake.normalized_text).not.toContain("5512345678");
    expect(intake.normalized_text).not.toContain("ana@ejemplo.com");
    expect(intake.pii_redacted).toBe(true);
  });
});

describe("suggestPriority", () => {
  it("does not reach urgent when only votes/supporters are high", () => {
    const priority = suggestPriority({
      severity: "low",
      independent_reports: 1,
      unique_supporters: 300,
      nearby_reports: 0,
      evidence_count: 0,
      reported_at: daysAgo(3, NOW),
      now: NOW,
    });

    expect(priority.level).not.toBe("urgent");
    expect(priority.supporters_only).toBe(true);
    expect(priority.is_verified).toBe(false);
    expect(priority.confidence_label).toBe("heuristic");
  });

  it("raises priority for a dangerous, old problem reported by many people", () => {
    const priority = suggestPriority({
      severity: "critical",
      independent_reports: 7,
      unique_supporters: 40,
      nearby_reports: 6,
      evidence_count: 4,
      historical_matches: 2,
      reported_at: daysAgo(120, NOW),
      now: NOW,
    });

    expect(priority.level).toBe("urgent");
    expect(priority.score).toBeGreaterThanOrEqual(80);
    expect(priority.factors.map((factor) => factor.code)).toContain("safety_severity");
    expect(priority.explanation.length).toBeGreaterThan(10);
    expect(priority.model_generated).toBe(false);
  });

  it("always requires human review and never claims verification", () => {
    const priority = suggestPriority({ severity: "high" });

    expect(priority.requires_human_review).toBe(true);
    expect(priority.is_verified).toBe(false);
    expect(priority.factors.every((factor) => factor.contribution >= 0)).toBe(true);
  });
});

describe("assessResolution", () => {
  it("flags persistence when newer citizen evidence contradicts an official closure", () => {
    const signal = assessResolution({
      official_status: "closed",
      closed_at: "2026-09-01T10:00:00.000Z",
      evidence: [
        {
          id: "ev-1",
          kind: "still_happening",
          body: "El bache sigue ahí y ya se volvió a llenar de agua.",
          created_at: "2026-10-25T09:00:00.000Z",
        },
      ],
      now: NOW,
    });

    expect(signal.signal_type).toBe("persists_after_closure");
    expect(signal.possible_persistence).toBe(true);
    expect(signal.newer_evidence_count).toBe(1);
    expect(signal.evidence_ids).toEqual(["ev-1"]);
    expect(signal.declares_resolved).toBe(false);
    expect(signal.declares_fraud).toBe(false);
    expect(signal.requires_human_review).toBe(true);
  });

  it("returns disputed_closure when newer evidence exists but does not describe persistence", () => {
    const signal = assessResolution({
      official_status: "resolved",
      resolved_at: "2026-09-01T10:00:00.000Z",
      evidence: [
        {
          id: "ev-2",
          kind: "comment",
          body: "Gracias por el reporte.",
          created_at: "2026-09-10T09:00:00.000Z",
        },
      ],
      now: NOW,
    });

    expect(signal.signal_type).toBe("disputed_closure");
    expect(signal.possible_persistence).toBe(false);
  });

  it("returns no_signal for an official closure with no newer evidence", () => {
    const signal = assessResolution({
      official_status: "closed",
      closed_at: "2026-09-01T10:00:00.000Z",
      evidence: [
        { id: "ev-old", kind: "comment", body: "Sigue el problema.", created_at: "2026-08-01T10:00:00.000Z" },
      ],
      now: NOW,
    });

    expect(signal.signal_type).toBe("no_signal");
    expect(signal.declares_resolved).toBe(false);
  });

  it("returns insufficient_data when nothing was officially closed", () => {
    const signal = assessResolution({
      official_status: "in_progress",
      evidence: [{ id: "ev-1", kind: "still_happening", created_at: "2026-10-01T10:00:00.000Z" }],
      now: NOW,
    });

    expect(signal.signal_type).toBe("insufficient_data");
    expect(signal.requires_human_review).toBe(true);
  });
});
