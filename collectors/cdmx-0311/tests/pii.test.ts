import { describe, expect, it } from "vitest";
import { containsContactPii, scrubPii } from "../src/normalization/pii.js";

describe("PII scrubbing", () => {
  it("redacts emails, phones, CURP and RFC", () => {
    const result = scrubPii("Escribe a vecino@example.com o llama al +52 55 1234 5678. CURP ABCD800101HDFXYZ01, RFC ABC800101XYZ.");
    expect(result.text).not.toContain("vecino@example.com");
    expect(result.text).not.toContain("5512345678");
    expect(result.text).toContain("[redacted:email]");
    expect(result.text).toContain("[redacted:phone]");
    expect(result.redactions).toBeGreaterThanOrEqual(3);
  });

  it("redacts a named person after common phrasing", () => {
    const result = scrubPii("Mi nombre es Ana López y reporto un bache.");
    expect(result.text).toContain("[redacted:name]");
    expect(result.text).not.toContain("Ana López");
  });

  it("does not redact year ranges", () => {
    const result = scrubPii("El problema existe desde 2023-2024.");
    expect(result.text).toBe("El problema existe desde 2023-2024.");
    expect(result.redactions).toBe(0);
  });

  it("detects surviving contact patterns for validation", () => {
    expect(containsContactPii("correo: a@b.com")).toBe(true);
    expect(containsContactPii("tel 55 1234 5678")).toBe(true);
    expect(containsContactPii("sin datos personales")).toBe(false);
  });

  it("truncates oversized descriptions and flags it", () => {
    const result = scrubPii("x".repeat(50), 20);
    expect(result.text).toHaveLength(20);
    expect(result.flags).toContain("description_truncated");
  });
});
