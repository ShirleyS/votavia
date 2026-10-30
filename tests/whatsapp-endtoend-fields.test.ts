import { describe, expect, it } from "vitest";
import { runSimulatorTurn } from "@/server/whatsapp/simulator";

const SESSION = "e2e-fields-0001";

describe("voice turn produces the same fields as the report form", () => {
  it("collects name, colonia, between-streets and severity into the case", async () => {
    const transcript =
      "Hola, me llamo Ana López. Hay un bache muy grave entre la calle Colima y la " +
      "avenida Álvaro Obregón, en la colonia Roma Norte. Casi se cae una moto.";

    let turn = await runSimulatorTurn(SESSION, { kind: "voice", transcript });
    const all: string[] = turn.messages.map((m) => m.body);
    // Answer the follow-up prompts until the case is created.
    for (let i = 0; i < 6 && !turn.caseId; i += 1) {
      const joined = turn.messages.map((m) => m.body).join(" ");
      if (/colonia/i.test(joined) && !/gravedad/i.test(joined)) {
        turn = await runSimulatorTurn(SESSION, { kind: "colonia", colonia: "Roma Norte" });
      } else {
        turn = await runSimulatorTurn(SESSION, { kind: "interactive", actionId: "confirm_report" });
      }
      all.push(...turn.messages.map((m) => m.body));
    }

    const transcriptOfConversation = all.join("\n");
    expect(turn.caseId).toBeTruthy();
    expect(transcriptOfConversation).toContain("Ana López");
    expect(transcriptOfConversation).toMatch(/entre la calle Colima/i);
    expect(transcriptOfConversation).toContain("Gravedad: alta");
  });
});
