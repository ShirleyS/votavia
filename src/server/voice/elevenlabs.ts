/**
 * ElevenLabs text-to-speech for the voice demo.
 *
 * Voice notes are transcribed by `@/server/whatsapp/transcription`; this module
 * covers the other half of the call: turning the assistant reply back into
 * audio. Both read the same server-only `ELEVENLABS_API_KEY`.
 */

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
/** Rachel: multilingual, works for Spanish read-aloud. Override with ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
/** Flash keeps the demo responsive; swap for eleven_multilingual_v2 for quality. */
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const SPEAK_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 8_000;

export const MAX_SPEECH_CHARS = 800;

export interface SpeechConfig {
  apiKey: string;
  baseUrl: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
}

function read(value: string | undefined, fallback = ""): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

export function speechConfig(): SpeechConfig {
  return {
    apiKey: read(process.env.ELEVENLABS_API_KEY),
    baseUrl: read(process.env.ELEVENLABS_BASE_URL, DEFAULT_BASE_URL).replace(/\/+$/, ""),
    voiceId: read(process.env.ELEVENLABS_VOICE_ID, DEFAULT_VOICE_ID),
    modelId: read(process.env.ELEVENLABS_TTS_MODEL, DEFAULT_MODEL_ID),
    outputFormat: read(process.env.ELEVENLABS_TTS_FORMAT, DEFAULT_OUTPUT_FORMAT),
  };
}

export function isSpeechConfigured(apiKey = speechConfig().apiKey): boolean {
  return apiKey.length > 0;
}

export type SpeechResult =
  | { ok: true; audio: Uint8Array; contentType: string }
  | { ok: false; reason: "not_configured" | "empty" | "provider_error" | "timeout" };

export interface SpeechOptions {
  text: string;
  config?: SpeechConfig;
  fetchImpl?: typeof fetch;
}

/**
 * POST {base}/v1/text-to-speech/{voice_id}
 * header: xi-api-key
 * body: { text, model_id }
 */
export async function synthesizeSpeech(options: SpeechOptions): Promise<SpeechResult> {
  const config = options.config ?? speechConfig();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const text = options.text.trim().slice(0, MAX_SPEECH_CHARS);

  if (!config.apiKey) return { ok: false, reason: "not_configured" };
  if (!text) return { ok: false, reason: "empty" };

  const url = `${config.baseUrl}/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=${encodeURIComponent(config.outputFormat)}`;

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "xi-api-key": config.apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: config.modelId,
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(SPEAK_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, reason: response.status === 401 ? "not_configured" : "provider_error" };
    }

    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0) return { ok: false, reason: "provider_error" };

    return { ok: true, audio, contentType: response.headers.get("content-type") || "audio/mpeg" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "provider_error",
    };
  }
}

export interface AccountCheck {
  configured: boolean;
  ok: boolean;
  plan: string | null;
  characters_used: number | null;
  characters_remaining: number | null;
  error: string | null;
}

interface SubscriptionBody {
  tier?: string;
  character_count?: number;
  character_limit?: number;
}

/**
 * Verifies the key against ElevenLabs without spending characters. Used by
 * `/api/voice/health` so the demo can be checked after a deploy.
 */
export async function checkElevenLabsAccount(
  options: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<AccountCheck> {
  const config = speechConfig();
  const apiKey = options.apiKey ?? config.apiKey;
  const baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!apiKey) {
    return {
      configured: false,
      ok: false,
      plan: null,
      characters_used: null,
      characters_remaining: null,
      error: "ELEVENLABS_API_KEY no está configurada en este entorno.",
    };
  }

  try {
    const response = await fetchImpl(`${baseUrl}/v1/user/subscription`, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        configured: true,
        ok: false,
        plan: null,
        characters_used: null,
        characters_remaining: null,
        error:
          response.status === 401 || response.status === 403
            ? "ElevenLabs rechazó la clave (revisa que esté completa y no haya expirado)."
            : `ElevenLabs respondió ${response.status}.`,
      };
    }

    const body = (await response.json().catch(() => null)) as SubscriptionBody | null;
    const used = typeof body?.character_count === "number" ? body.character_count : null;
    const limit = typeof body?.character_limit === "number" ? body.character_limit : null;

    return {
      configured: true,
      ok: true,
      plan: typeof body?.tier === "string" ? body.tier : null,
      characters_used: used,
      characters_remaining: used !== null && limit !== null ? limit - used : null,
      error: null,
    };
  } catch {
    return {
      configured: true,
      ok: false,
      plan: null,
      characters_used: null,
      characters_remaining: null,
      error: "No se pudo contactar a ElevenLabs (red o tiempo de espera).",
    };
  }
}
