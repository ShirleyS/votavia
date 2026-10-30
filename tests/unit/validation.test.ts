import { describe, expect, it } from "vitest";
import {
  MAX_PHOTOS,
  claimRequestSchema,
  createCaseSchema,
  filtersSchema,
  loginSchema,
  observationSchema,
} from "@/server/validation";
import { CASE_CATEGORIES } from "@/shared/votavia-contract";

const validCase = {
  category: "road_damage" as const,
  title: "Bache profundo frente al mercado",
  description: "Hay un bache grande que obliga a los coches a invadir el carril contrario.",
  latitude: 19.4175,
  longitude: -99.1628,
  colonia: "Roma Norte",
  address_hint: "Calle de prueba 123",
  has_safety_concern: true,
  has_accessibility_concern: false,
  email: "",
};

describe("createCaseSchema", () => {
  it("accepts a complete, valid report", () => {
    expect(createCaseSchema.safeParse(validCase).success).toBe(true);
  });

  it("rejects every category outside the shared contract", () => {
    for (const category of ["baches", "alumbrado", "ROAD_DAMAGE", ""]) {
      const result = createCaseSchema.safeParse({ ...validCase, category });
      expect(result.success, `category=${category}`).toBe(false);
    }
  });

  it("accepts all canonical categories", () => {
    for (const category of CASE_CATEGORIES) {
      expect(createCaseSchema.safeParse({ ...validCase, category }).success).toBe(true);
    }
  });

  it("enforces title, description and colonia limits", () => {
    expect(createCaseSchema.safeParse({ ...validCase, title: "corto" }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...validCase, description: "muy corto" }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...validCase, colonia: "ab" }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...validCase, title: "x".repeat(141) }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...validCase, description: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects coordinates outside the CDMX bounds used by the form", () => {
    expect(createCaseSchema.safeParse({ ...validCase, latitude: 19.1 }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...validCase, latitude: 19.7 }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...validCase, longitude: -99.5 }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...validCase, longitude: -98.8 }).success).toBe(false);
  });

  it("coerces numeric strings coming from FormData", () => {
    const parsed = createCaseSchema.parse({
      ...validCase,
      latitude: "19.42",
      longitude: "-99.16",
      has_safety_concern: "true",
      has_accessibility_concern: "false",
    });
    expect(parsed.latitude).toBe(19.42);
    expect(parsed.longitude).toBe(-99.16);
  });

  it("rejects a malformed reporter email but allows an empty one", () => {
    expect(createCaseSchema.safeParse({ ...validCase, email: "" }).success).toBe(true);
    expect(createCaseSchema.safeParse({ ...validCase, email: "no-es-correo" }).success).toBe(false);
  });

  it("documents the unsafe boolean coercion of `false`", () => {
    // Zod 4 `z.coerce.boolean()` follows JS truthiness: the string "false" is truthy.
    const parsed = createCaseSchema.parse({ ...validCase, has_safety_concern: "false" });
    expect(parsed.has_safety_concern).toBe(true);
  });
});

describe("observationSchema", () => {
  it("accepts contract kinds and trims the body", () => {
    const parsed = observationSchema.parse({ kind: "still_happening", body: "  Sigue igual  " });
    expect(parsed.body).toBe("Sigue igual");
  });

  it("rejects unknown kinds and too-short bodies", () => {
    expect(observationSchema.safeParse({ kind: "complaint", body: "texto" }).success).toBe(false);
    expect(observationSchema.safeParse({ kind: "comment", body: "ab" }).success).toBe(false);
  });
});

describe("login and claim schemas", () => {
  it("normalizes email casing", () => {
    const parsed = loginSchema.parse({ email: "  VECINA@Ejemplo.MX " });
    expect(parsed.email).toBe("vecina@ejemplo.mx");
  });

  it("rejects invalid login and claim emails", () => {
    expect(loginSchema.safeParse({ email: "sin-arroba" }).success).toBe(false);
    expect(claimRequestSchema.safeParse({ case_id: "VOT-0001", email: "no" }).success).toBe(false);
  });
});

describe("filtersSchema", () => {
  it("accepts supported pagination and sort values", () => {
    const parsed = filtersSchema.parse({ page: "2", pageSize: "60", sort: "supported" });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(60);
  });

  it("rejects pageSize above the maximum and page below one", () => {
    expect(filtersSchema.safeParse({ pageSize: "61" }).success).toBe(false);
    expect(filtersSchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects an unsupported sort value", () => {
    expect(filtersSchema.safeParse({ sort: "newest" }).success).toBe(false);
  });

  it("documents that `mine=false` is coerced to true (API bug)", () => {
    const parsed = filtersSchema.parse({ mine: "false", supported: "false" });
    expect(parsed.mine).toBe(true);
    expect(parsed.supported).toBe(true);
  });

  it("documents that category/status are not enum-validated", () => {
    const parsed = filtersSchema.parse({ category: "baches", status: "inventado" });
    expect(parsed.category).toBe("baches");
    expect(parsed.status).toBe("inventado");
  });
});

describe("upload limits", () => {
  it("publishes the configured photo cap", () => {
    expect(MAX_PHOTOS).toBe(3);
  });
});
