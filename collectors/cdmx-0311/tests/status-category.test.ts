import { describe, expect, it } from "vitest";
import { normalizeStatus } from "../src/normalization/status.js";
import { normalizeCategory } from "../src/normalization/category.js";

describe("government status normalization", () => {
  it.each([
    ["Recibido", "received"],
    ["Pendiente de atención", "received"],
    ["En proceso", "in_progress"],
    ["Asignada", "in_progress"],
    ["Concluido", "resolved"],
    ["Atendido", "resolved"],
    ["Cancelada", "closed_no_action"],
    ["Improcedente", "closed_no_action"],
  ])("maps %s to %s", (original, expected) => {
    expect(normalizeStatus(original).normalized).toBe(expected);
  });

  it("preserves unknown statuses verbatim", () => {
    const result = normalizeStatus("En verificación vecinal");
    expect(result.original).toBe("En verificación vecinal");
    expect(result.normalized).toBe("unknown");
    expect(result.mapped).toBe(false);
  });

  it("does not treat a missing status as resolved", () => {
    expect(normalizeStatus("").normalized).toBe("unknown");
  });
});

describe("category normalization", () => {
  it("maps official labels and preserves the original", () => {
    const result = normalizeCategory({ category: "Baches y pavimento", subcategory: "Bache" });
    expect(result.original_category).toBe("Baches y pavimento");
    expect(result.collector_category).toBe("road_damage");
    expect(result.normalized_category).toBe("road_damage");
    expect(result.is_infrastructure_related).toBe(true);
  });

  it("accepts VotaVía category slugs as explicit input", () => {
    expect(normalizeCategory({ category: "road_damage" }).normalized_category).toBe("road_damage");
    expect(normalizeCategory({ category: "street_lighting" }).normalized_category).toBe("street_lighting");
  });

  it("keeps traffic accidents distinct from road damage", () => {
    const result = normalizeCategory({ category: "Seguridad vial", subcategory: "Choque", description: "Accidente con dos vehículos" });
    expect(result.collector_category).toBe("traffic_accident");
    expect(result.normalized_category).toBe("other");
    expect(result.is_infrastructure_related).toBe(false);
  });

  it("maps water and drainage complaints to a distinct collector category", () => {
    const result = normalizeCategory({ category: "Fuga de agua", description: "Drenaje colapsado" });
    expect(result.collector_category).toBe("water_drainage");
    expect(result.normalized_category).toBe("other");
    expect(result.is_infrastructure_related).toBe(true);
  });

  it("infers from description only when the labels do not map", () => {
    const result = normalizeCategory({ description: "La luminaria está apagada" });
    expect(result.collector_category).toBe("street_lighting");
    expect(result.normalization.method).toBe("keyword");
    expect(result.normalization.confidence).toBeLessThan(0.8);
  });

  it("does not force an unmapped label into an infrastructure category", () => {
    const result = normalizeCategory({ category: "Trámite de licencia" });
    expect(result.collector_category).toBe("social_services");
    expect(result.normalized_category).toBe("other");
    expect(result.is_infrastructure_related).toBe(false);
  });
});
