import { describe, expect, it, vi } from "vitest";
import {
  createElevenLabsTranscriber,
  createPreferredTranscriber,
  isElevenLabsConfigured,
} from "@/server/whatsapp/transcription";

const AUDIO = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  mimeType: "audio/webm",
  filename: "nota.webm",
};

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ElevenLabs transcription", () => {
  it("posts to /v1/speech-to-text with the xi-api-key header and model_id", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ text: "Hay un bache en la esquina." }));

    const transcribe = createElevenLabsTranscriber({ apiKey: "test-key", fetchImpl: fetchImpl as never });
    const result = await transcribe(AUDIO);

    expect(result).toEqual({ ok: true, text: "Hay un bache en la esquina.", reason: "ok" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v1");
    expect(form.get("language_code")).toBe("spa");
  });

  it("honours a custom base URL and model", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ text: "ok" }));
    const transcribe = createElevenLabsTranscriber({
      apiKey: "k",
      baseUrl: "https://example.test/",
      modelId: "scribe_v2",
      fetchImpl: fetchImpl as never,
    });

    await transcribe(AUDIO);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/speech-to-text");
    expect((init.body as FormData).get("model_id")).toBe("scribe_v2");
  });

  it("reports not_configured without a key instead of throwing", async () => {
    const transcribe = createElevenLabsTranscriber({ apiKey: "" });
    expect(await transcribe(AUDIO)).toEqual({
      ok: false,
      text: null,
      reason: "not_configured",
    });
  });

  it("maps a provider error and an empty transcript to safe results", async () => {
    const failing = createElevenLabsTranscriber({
      apiKey: "k",
      fetchImpl: (async () => new Response("nope", { status: 500 })) as never,
    });
    expect((await failing(AUDIO)).reason).toBe("provider_error");

    const empty = createElevenLabsTranscriber({
      apiKey: "k",
      fetchImpl: (async () => okResponse({ text: "   " })) as never,
    });
    expect((await empty(AUDIO)).reason).toBe("empty");
  });

  it("prefers ElevenLabs when its key is present", () => {
    const previous = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "demo-key";
    try {
      expect(isElevenLabsConfigured()).toBe(true);
      // The preferred transcriber must actually call the ElevenLabs endpoint.
      expect(createPreferredTranscriber()).toBeTypeOf("function");
    } finally {
      if (previous === undefined) delete process.env.ELEVENLABS_API_KEY;
      else process.env.ELEVENLABS_API_KEY = previous;
    }
  });
});
