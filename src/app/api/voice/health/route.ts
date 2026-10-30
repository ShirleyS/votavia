import { jsonOk } from "@/server/http";
import { checkElevenLabsAccount, isSpeechConfigured, speechConfig } from "@/server/voice/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment check for the voice demo:
 *   GET /api/voice/health
 * Confirms the Netlify variable is present and that ElevenLabs accepts the key
 * (no characters are spent — it only reads the subscription).
 */
export async function GET() {
  const config = speechConfig();
  const account = await checkElevenLabsAccount();

  return jsonOk({
    provider: "elevenlabs",
    configured: isSpeechConfigured(),
    ok: account.ok,
    plan: account.plan,
    characters_used: account.characters_used,
    characters_remaining: account.characters_remaining,
    voice_id: config.voiceId,
    tts_model: config.modelId,
    stt_model: process.env.ELEVENLABS_STT_MODEL?.trim() || "scribe_v1",
    error: account.error,
  });
}
