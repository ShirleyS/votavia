import { describe, expect, it } from "vitest";
import { demoCases, demoObservations, demoTimeline } from "../mock-data";
import {
  COORDINATE_PRECISION_METERS,
  SENSITIVE_COORDINATE_PRECISION_METERS,
  redactPersonalData,
  toPublicCase,
  toPublicDetail,
} from "../privacy";

const first = demoCases[0];
const standard = demoCases[2];
const unpublished = demoCases.find((item) => !item.is_published)!;

describe("public projection", () => {
  it("never publishes an unpublished case", () => {
    expect(toPublicCase(unpublished)).toBeNull();
  });

  it("drops private fields even when the source object carries them", () => {
    const projected = toPublicCase(first)!;
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("residenta@example.com");
    expect(serialized).not.toContain("reporter_email");
    expect(serialized).not.toContain("internal_notes");
    expect(serialized).not.toContain("specialist_notes");
    expect(serialized).not.toContain("created_by_user_id");
    expect(serialized).not.toContain("Río Pánuco 42");
    expect(projected.location).not.toHaveProperty("address_hint");
  });

  it("coarsens coordinates and declares the precision", () => {
    const projected = toPublicCase(standard)!;
    expect(projected.location.latitude).toBe(19.423);
    expect(projected.location.longitude).toBe(-99.161);
    expect(projected.location.precision_meters).toBe(COORDINATE_PRECISION_METERS);
  });

  it("coarsens safety-sensitive reports to roughly 1.1 km", () => {
    const projected = toPublicCase(first)!;
    expect(projected.has_safety_concern).toBe(true);
    expect(projected.location.latitude).toBe(19.42);
    expect(projected.location.longitude).toBe(-99.16);
    expect(projected.location.precision_meters).toBe(SENSITIVE_COORDINATE_PRECISION_METERS);
  });

  it("redacts emails and phone numbers from free text", () => {
    expect(redactPersonalData("Escribe a a@b.com o al 55 1234 5678")).toBe(
      "Escribe a [correo protegido] o al [teléfono protegido]",
    );
  });

  it("redacts magic links and signed URLs from free text", () => {
    expect(
      redactPersonalData("Abre https://votavia.mx/caso?token=abc123 para confirmar"),
    ).toBe("Abre [enlace protegido] para confirmar");
  });

  it("excludes private timeline events and their metadata", () => {
    const detail = toPublicDetail(
      first,
      demoTimeline[first.case_id],
      demoObservations[first.case_id],
    )!;
    expect(detail.timeline.every((event) => !event.title.includes("Nota interna"))).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("privado@example.com");
    expect(JSON.stringify(detail)).not.toContain("internal_actor_id");
    expect(detail.timeline.length).toBeGreaterThan(0);
  });

  it("redacts observation bodies and omits author labels", () => {
    const detail = toPublicDetail(
      first,
      demoTimeline[first.case_id],
      demoObservations[first.case_id],
    )!;
    expect(detail.observations[0].body).not.toContain("vecina@example.com");
    expect(detail.observations[0]).not.toHaveProperty("author_label");
    expect(detail.observations[0]).not.toHaveProperty("case_id");
  });
});
