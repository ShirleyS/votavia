import { describe, expect, it, vi } from "vitest";
import {
  MAX_SPEECH_CHARS,
  checkElevenLabsAccount,
  speechConfig,
  synthesizeSpeech,
} from "@/server/voice/elevenlabs";

const CONFIG = {
  apiKey: "test-key",
  baseUrl: "https://api.elevenlabs.io",
  voiceId: "voice-123",
  modelId: "eleven_flash_v2_5",
  outputFormat: "mp3_44100_128",
};

function audioResponse() {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  });
}

describe("ElevenLabs speech synthesis", () => {
  it("posts to /v1/text-to-speech/{voice} with the xi-api-key header", async () => {
    const fetchImpl = vi.fn(async () => audioResponse());
    const result = await synthesizeSpeech({
      text: "Hola, soy VotaVía.",
      config: CONFIG,
      fetchImpl: fetchImpl as never,
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-123?output_format=mp3_44100_128",
    );
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init.body)) as { text: string; model_id: string };
    expect(body.text).toBe("Hola, soy VotaVía.");
    expect(body.model_id).toBe("eleven_flash_v2_5");
  });

  it("trims the text before sending it", async () => {
    const fetchImpl = vi.fn(async () => audioResponse());
    await synthesizeSpeech({ text: "   bache en la esquina   ", config: CONFIG, fetchImpl: fetchImpl as never });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { text: string }).text).toBe("bache en la esquina");
  });

  it(`caps the text at ${MAX_SPEECH_CHARS} characters`, async () => {
    const fetchImpl = vi.fn(async () => audioResponse());
    await synthesizeSpeech({ text: "a".repeat(2000), config: CONFIG, fetchImpl: fetchImpl as never });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { text: string }).text).toHaveLength(MAX_SPEECH_CHARS);
  });

  it("reports not_configured without a key and empty input", async () => {
    expect(await synthesizeSpeech({ text: "hola", config: { ...CONFIG, apiKey: "" } })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(await synthesizeSpeech({ text: "   ", config: CONFIG })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("maps provider failures to a reason instead of throwing", async () => {
    const unauthorized = vi.fn(async () => new Response("nope", { status: 401 }));
    expect(
      await synthesizeSpeech({ text: "hola", config: CONFIG, fetchImpl: unauthorized as never }),
    ).toEqual({ ok: false, reason: "not_configured" });

    const boom = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await synthesizeSpeech({ text: "hola", config: CONFIG, fetchImpl: boom as never })).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });
});

describe("ElevenLabs account check", () => {
  it("does not call the API when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await checkElevenLabsAccount({ apiKey: "", fetchImpl: fetchImpl as never });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.configured).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("reads the subscription without spending characters", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ tier: "free", character_count: 1200, character_limit: 10000 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const result = await checkElevenLabsAccount({ apiKey: "k", fetchImpl: fetchImpl as never });

    expect(result).toMatchObject({ configured: true, ok: true, plan: "free", characters_remaining: 8800 });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/user/subscription");
  });

  it("surfaces a rejected key", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    const result = await checkElevenLabsAccount({ apiKey: "bad", fetchImpl: fetchImpl as never });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("rechazó");
  });
});

describe("speechConfig", () => {
  it("falls back to the default voice and model", () => {
    const config = speechConfig();
    expect(config.voiceId).toMatch(/[a-zA-Z0-9]{8,}/);
    expect(config.modelId).toBe("eleven_flash_v2_5");
  });
});
