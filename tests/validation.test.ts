import { describe, expect, it } from "vitest";
import {
  claimRequestSchema,
  officialRecordIngestSchema,
  createCaseSchema,
  filtersSchema,
  loginSchema,
  observationSchema,
} from "@/server/validation";

const validCase = {
  category: "road_damage",
  title: "Bache profundo frente a la escuela",
  description: "Hay un bache de más de un metro que pone en riesgo a quienes cruzan.",
  latitude: 19.42,
  longitude: -99.15,
  colonia: "Roma Norte",
  has_safety_concern: true,
  has_accessibility_concern: false,
};

describe("createCaseSchema", () => {
  it("accepts a complete report", () => {
    expect(createCaseSchema.parse(validCase).colonia).toBe("Roma Norte");
  });

  it("rejects coordinates outside Cuauhtémoc", () => {
    const result = createCaseSchema.safeParse({ ...validCase, latitude: 25.6 });
    expect(result.success).toBe(false);
  });

  it("rejects a short description", () => {
    expect(createCaseSchema.safeParse({ ...validCase, description: "corto" }).success).toBe(false);
  });

  it("allows an empty optional email but rejects an invalid one", () => {
    expect(createCaseSchema.safeParse({ ...validCase, email: "" }).success).toBe(true);
    expect(createCaseSchema.safeParse({ ...validCase, email: "no-es-correo" }).success).toBe(false);
  });
});

describe("supporting schemas", () => {
  it("normalizes login and claim emails", () => {
    expect(loginSchema.parse({ email: "  VECINA@Example.MX " }).email).toBe("vecina@example.mx");
    expect(
      claimRequestSchema.parse({ case_id: "abc", email: "VECINA@Example.MX" }).email,
    ).toBe("vecina@example.mx");
  });

  it("bounds observation bodies", () => {
    expect(observationSchema.safeParse({ kind: "comment", body: "ok" }).success).toBe(false);
    expect(observationSchema.safeParse({ kind: "safety_concern", body: "Hay riesgo" }).success).toBe(true);
    expect(observationSchema.safeParse({ kind: "unknown", body: "Hay riesgo" }).success).toBe(false);
  });

  it("parses filter pagination", () => {
    const parsed = filtersSchema.parse({ page: "2", pageSize: "9", sort: "supported" });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(9);
  });
});


describe("officialRecordIngestSchema", () => {
  const base = {
    source_system: "CDMX-0311",
    source_record_id: "0311-2026-004512",
    external_folio: "CDMX-0311-2026-004512",
    original_status: "En proceso",
    latitude: 19.4288,
    longitude: -99.1551,
  };

  it("accepts a normalized source record", () => {
    const parsed = officialRecordIngestSchema.parse(base);
    expect(parsed.source_record_id).toBe("0311-2026-004512");
    expect(parsed.redistribution).toBe("unknown");
  });

  it("requires both identity fields", () => {
    expect(
      officialRecordIngestSchema.safeParse({ ...base, source_record_id: "" }).success,
    ).toBe(false);
    expect(
      officialRecordIngestSchema.safeParse({ ...base, source_system: "" }).success,
    ).toBe(false);
  });

  it("rejects lowercase or spaced source systems", () => {
    expect(
      officialRecordIngestSchema.safeParse({ ...base, source_system: "cdmx 0311" }).success,
    ).toBe(false);
  });

  it("allows records without folio or coordinates", () => {
    const parsed = officialRecordIngestSchema.safeParse({
      source_system: "SUAC",
      source_record_id: "X-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects half-specified coordinates", () => {
    expect(
      officialRecordIngestSchema.safeParse({ ...base, longitude: null }).success,
    ).toBe(false);
  });

  it("rejects coordinates outside Cuauhtémoc", () => {
    expect(
      officialRecordIngestSchema.safeParse({ ...base, latitude: 25.6 }).success,
    ).toBe(false);
  });

  it("only accepts known redistribution values", () => {
    expect(
      officialRecordIngestSchema.safeParse({ ...base, redistribution: "open" }).success,
    ).toBe(false);
    expect(
      officialRecordIngestSchema.safeParse({ ...base, redistribution: "restricted" }).success,
    ).toBe(true);
  });
});
