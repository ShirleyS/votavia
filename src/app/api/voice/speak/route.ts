import type { NextRequest } from "next/server";
import { clientKey, jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { MAX_SPEECH_CHARS, synthesizeSpeech } from "@/server/voice/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reads a short assistant reply out loud with ElevenLabs. The browser never
 * sees the API key: it posts text here and gets audio bytes back.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(`voice-speak:${clientKey(request)}`, 60, 10 * 60 * 1000);
  if (!limit.allowed) {
    return jsonError(429, "rate_limited", "Demasiadas locuciones seguidas. Espera un momento.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "El cuerpo no es JSON válido.");
  }

  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : "";
  if (!text.trim()) {
    return jsonError(422, "validation_error", "Falta el texto a leer.");
  }
  if (text.length > MAX_SPEECH_CHARS) {
    return jsonError(413, "payload_too_large", `El texto supera ${MAX_SPEECH_CHARS} caracteres.`);
  }

  const result = await synthesizeSpeech({ text });
  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : result.reason === "timeout" ? 504 : 502;
    return jsonError(status, `tts_${result.reason}`, "No se pudo generar la voz del asistente.");
  }

  return new Response(result.audio as BodyInit, {
    status: 200,
    headers: {
      "content-type": result.contentType,
      "cache-control": "no-store",
      "content-length": String(result.audio.byteLength),
    },
  });
}
