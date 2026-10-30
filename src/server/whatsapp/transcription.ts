import type { TranscribeAudio, TranscriptionResult } from "./types";
import { whatsappConfig } from "./config";

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

export interface TranscriptionOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export function isTranscriptionConfigured(apiKey = whatsappConfig().transcription.apiKey): boolean {
  return apiKey.trim().length > 0;
}

/**
 * Transcribes a WhatsApp voice note with an OpenAI-compatible audio endpoint.
 * The provider default is `whisper-1`; model and base URL are configurable so
 * self-hosted or regional transcribers can be used without code changes.
 */
export function createTranscriber(options: TranscriptionOptions = {}): TranscribeAudio {
  const config = whatsappConfig().transcription;
  const apiKey = (options.apiKey ?? config.apiKey).trim();
  const baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/+$/, "");
  const model = options.model ?? config.model;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return async ({ bytes, mimeType, filename }): Promise<TranscriptionResult> => {
    if (!apiKey) return { ok: false, text: null, reason: "not_configured" };
    if (bytes.byteLength === 0) return { ok: false, text: null, reason: "empty" };
    if (bytes.byteLength > MAX_AUDIO_BYTES) return { ok: false, text: null, reason: "too_large" };

    const form = new FormData();
    form.append("file", new Blob([Buffer.from(bytes)], { type: mimeType }), filename);
    form.append("model", model);
    form.append("language", "es");
    form.append("response_format", "json");

    try {
      const response = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      });
      if (!response.ok) return { ok: false, text: null, reason: "provider_error" };
      const body = (await response.json().catch(() => null)) as { text?: string } | null;
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!text) return { ok: false, text: null, reason: "empty" };
      return { ok: true, text: text.slice(0, 8000), reason: "ok" };
    } catch {
      return { ok: false, text: null, reason: "provider_error" };
    }
  };
}
