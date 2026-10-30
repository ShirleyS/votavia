import { describe, expect, it } from "vitest";
import { createReportExtractor, matchColonia } from "@/server/whatsapp/extract-report";
import { createMockClient } from "@/lib/ai/__tests__/test-helpers";

describe("WhatsApp report extraction", () => {
  it("works deterministically without AI credentials", async () => {
    const extract = createReportExtractor(createMockClient({ configured: false }));
    const result = await extract({
      text: "Hay un bache enorme en la esquina de Roma Norte; lleva una semana y los coches lo esquivan.",
      usedVoice: false,
    });
    expect(result.is_civic_report).toBe(true);
    expect(result.category).toBe("road_damage");
    expect(result.colonia).toBe("Roma Norte");
    expect(result.title?.length).toBeGreaterThanOrEqual(6);
    expect(result.description).toContain("bache");
  });

  it("does not treat a greeting as a report", async () => {
    const extract = createReportExtractor(createMockClient({ configured: false }));
    const result = await extract({ text: "Hola, buenas tardes", usedVoice: false });
    expect(result.is_civic_report).toBe(false);
  });

  it("merges a model refinement but rejects a colonia outside Cuauhtémoc", async () => {
    const client = createMockClient({
      response: {
        is_civic_report: true,
        category: "street_lighting",
        title: "Luminaria apagada junto al parque",
        description: "La luminaria del parque lleva tres noches apagada y el paso está muy oscuro.",
        colonia: "Coyoacán",
        address_hint: "Parque México",
        has_safety_concern: true,
        has_accessibility_concern: false,
        clarifying_question: null,
      },
    });
    const extract = createReportExtractor(client);
    const result = await extract({
      text: "La lámpara del parque México está apagada desde el lunes.",
      usedVoice: false,
    });
    expect(result.category).toBe("street_lighting");
    expect(result.colonia).toBeNull();
    expect(result.has_safety_concern).toBe(true);
    expect(client.calls).toHaveLength(1);
  });

  it("normalizes accents and partial colonia names", () => {
    expect(matchColonia("roma norte")).toBe("Roma Norte");
    expect(matchColonia("Colonia Condesa")).toBe("Condesa");
    expect(matchColonia("Polanco")).toBeNull();
  });
});
