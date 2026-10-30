import { describe, expect, it } from "vitest";
import { createReportExtractor } from "@/server/whatsapp/extract-report";

// No DEEPSEEK_API_KEY in the test environment, so this exercises the
// deterministic path - which is exactly what the demo runs on.
const extract = createReportExtractor();

async function read(text: string) {
  return extract({ text, usedVoice: true });
}

describe("voice extraction matches the report form", () => {
  it("captures the reporter's name when they give it", async () => {
    const result = await read("Me llamo Ana López y hay un bache enorme en la esquina.");
    expect(result.reporter_name).toBe("Ana López");
  });

  it("does not mistake a role word for a name", async () => {
    const result = await read("Soy vecina y hay un bache en la banqueta.");
    expect(result.reporter_name).toBeNull();
  });

  it("captures the between-streets reference verbatim", async () => {
    const result = await read(
      "Hay un bache grande enfrente, entre la calle Colima y la avenida Álvaro Obregón.",
    );
    expect(result.between_streets).toMatch(/^entre /i);
    expect(result.between_streets).toContain("Colima");
    expect(result.between_streets).toContain("Obregón");
  });

  it("returns null between_streets when no crossing is mentioned", async () => {
    const result = await read("Hay un bache en la esquina de mi casa.");
    expect(result.between_streets).toBeNull();
  });

  it.each([
    ["Hay una explosión y hay heridos en la banqueta.", "critica"],
    ["Es muy grave, casi se cae un poste y hay niños.", "alta"],
    ["Está regular, molesta para pasar con la carriola.", "media"],
    ["Es un detalle leve, no es grave.", "baja"],
  ])("assigns severity %s -> %s", async (text, expected) => {
    const result = await read(text);
    expect(result.severity).toBe(expected);
  });

  it("leaves severity null rather than guessing", async () => {
    const result = await read("Hay un bache en la calle Colima.");
    expect(result.severity).toBeNull();
  });

  it("keeps all four fields from one realistic voice note", async () => {
    const result = await read(
      "Hola, soy Ana López. Hay un bache muy grave entre la calle Colima y la avenida " +
        "Álvaro Obregón, en la colonia Roma Norte. Casi se cae una moto.",
    );
    expect(result.reporter_name).toBe("Ana López");
    expect(result.between_streets).toContain("Colima");
    expect(result.severity).toBe("alta");
    expect(result.colonia).toBe("Roma Norte");
    expect(result.is_civic_report).toBe(true);
  });
});
