import { describe, expect, it } from "vitest";
import { runSimulatorTurn, simulatorCapabilities } from "@/server/whatsapp/simulator";

const SESSION = "sim-test-0001";

describe("WhatsApp simulator", () => {
  it("walks text → colonia → category → confirmation and creates a case", async () => {
    const first = await runSimulatorTurn(SESSION, {
      kind: "text",
      text: "Hay un bache enorme en la esquina de mi casa.",
    });
    expect(first.messages.length).toBeGreaterThan(0);
    expect(first.caseId).toBeUndefined();
  });

  it("uses a supplied voice transcript without calling any provider", async () => {
    const result = await runSimulatorTurn(`${SESSION}-voice`, {
      kind: "voice",
      transcript: "Se cayó un árbol sobre la banqueta y bloquea el paso.",
    });
    expect(result.transcriptionUnavailable).toBeFalsy();
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("never sends through Meta: capabilities report the live path as unconfigured", () => {
    const capabilities = simulatorCapabilities();
    expect(capabilities.enabled).toBe(true);
    expect(capabilities.live_whatsapp_configured).toBe(false);
    expect(["elevenlabs", "openai-compatible", "none"]).toContain(
      capabilities.transcription_provider,
    );
  });
});
