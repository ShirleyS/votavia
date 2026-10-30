import { describe, expect, it } from "vitest";
import { demoCases, demoObservations, demoTimeline } from "../mock-data";
import {
  COORDINATE_PRECISION_METERS,
  redactPersonalData,
  toPublicCase,
  toPublicDetail,
} from "../privacy";

const first = demoCases[0];
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
    const projected = toPublicCase(first)!;
    expect(projected.location.latitude).toBe(19.415);
    expect(projected.location.longitude).toBe(-99.164);
    expect(projected.location.precision_meters).toBe(COORDINATE_PRECISION_METERS);
  });

  it("redacts emails and phone numbers from free text", () => {
    expect(redactPersonalData("Escribe a a@b.com o al 55 1234 5678")).toBe(
      "Escribe a [correo protegido] o al [teléfono protegido]",
    );
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
