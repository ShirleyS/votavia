import { describe, expect, it } from "vitest";
import { matchesAlcaldia, normalizeAlcaldia, normalizeCoordinates } from "../src/normalization/geo.js";

describe("geographic normalization", () => {
  it("matches accented and unaccented Cuauhtémoc variants", () => {
    expect(matchesAlcaldia("CUAUHTEMOC", "Cuauhtémoc")).toBe(true);
    expect(matchesAlcaldia("Alcaldía Cuauhtémoc", "Cuauhtémoc")).toBe(true);
    expect(matchesAlcaldia("Cuauhtémoc, CDMX", "Cuauhtémoc")).toBe(true);
    expect(matchesAlcaldia("Coyoacán", "Cuauhtémoc")).toBe(false);
  });

  it("canonicalizes known alcaldías and preserves unknown labels", () => {
    expect(normalizeAlcaldia("alcaldia cuauhtemoc").canonical).toBe("Cuauhtémoc");
    expect(normalizeAlcaldia("GAM").canonical).toBe("Gustavo A. Madero");
    expect(normalizeAlcaldia("Municipio Inventado").canonical).toBe("Municipio Inventado");
  });

  it("parses decimal commas and flags missing coordinates", () => {
    expect(normalizeCoordinates("19,4185", "-99,1613")).toMatchObject({ latitude: 19.4185, longitude: -99.1613 });
    expect(normalizeCoordinates("", "")).toEqual({ latitude: null, longitude: null, flags: ["missing_coordinates"] });
    expect(normalizeCoordinates("19.42", "").flags).toContain("incomplete_coordinates");
  });

  it("rejects invalid coordinates and corrects unmistakable X/Y swaps", () => {
    expect(normalizeCoordinates("999", "-99.15").flags).toContain("invalid_coordinates");
    const swapped = normalizeCoordinates("-99.1613", "19.4185");
    expect(swapped.latitude).toBe(19.4185);
    expect(swapped.longitude).toBe(-99.1613);
    expect(swapped.flags).toContain("coordinates_swapped");
  });

  it("flags coordinates outside the Cuauhtémoc envelope without discarding them", () => {
    const result = normalizeCoordinates("19.35", "-99.05");
    expect(result.latitude).toBe(19.35);
    expect(result.flags).toContain("coordinates_outside_cuauhtemoc_bbox");
  });
});
