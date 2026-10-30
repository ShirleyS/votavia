import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import {
  isValidSimulatorSession,
  runSimulatorTurn,
  simulatorCapabilities,
  simulatorEnabled,
  type SimulatorInput,
} from "@/server/whatsapp/simulator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function GET() {
  return jsonOk(simulatorCapabilities());
}

function parseJsonInput(body: Record<string, unknown>): SimulatorInput | null {
  const kind = body.kind;
  if (kind === "text" && typeof body.text === "string") {
    return { kind: "text", text: body.text.slice(0, 4000) };
  }
  if (kind === "interactive" && typeof body.actionId === "string") {
    return { kind: "interactive", actionId: body.actionId.slice(0, 120) };
  }
  if (
    kind === "location" &&
    typeof body.latitude === "number" &&
    typeof body.longitude === "number"
  ) {
    return {
      kind: "location",
      latitude: body.latitude,
      longitude: body.longitude,
      address: typeof body.address === "string" ? body.address.slice(0, 160) : null,
      name: typeof body.name === "string" ? body.name.slice(0, 160) : null,
    };
  }
  if (kind === "colonia" && typeof body.colonia === "string") {
    return { kind: "colonia", colonia: body.colonia.slice(0, 80) };
  }
  if (kind === "voice") {
    return {
      kind: "voice",
      transcript: typeof body.transcript === "string" ? body.transcript.slice(0, 4000) : null,
    };
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!simulatorEnabled()) {
    return jsonError(404, "simulator_disabled", "El simulador no está habilitado en este entorno.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  let sessionId: unknown = null;
  let input: SimulatorInput | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string") {
      return jsonError(422, "validation_error", "Falta el payload del simulador.");
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return jsonError(400, "invalid_json", "El payload no es JSON válido.");
    }
    sessionId = parsed.sessionId;
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return jsonError(422, "validation_error", "Falta el archivo de audio.");
    }
    if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
      return jsonError(413, "payload_too_large", "El audio debe pesar menos de 10 MB.");
    }
    input = {
      kind: "voice",
      audio: new Uint8Array(await audio.arrayBuffer()),
      mimeType: audio.type || "audio/webm",
    };
  } else {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError(400, "invalid_json", "El cuerpo no es JSON válido.");
    }
    sessionId = body.sessionId;
    input = parseJsonInput(body);
  }

  if (!isValidSimulatorSession(sessionId)) {
    return jsonError(422, "validation_error", "sessionId inválido.");
  }
  if (!input) {
    return jsonError(422, "validation_error", "Tipo de mensaje no soportado.");
  }

  const limit = rateLimit(`whatsapp-sim:${sessionId}`, 120, 60 * 60 * 1000);
  if (!limit.allowed) {
    return jsonError(429, "rate_limited", "Demasiados mensajes en esta simulación.");
  }

  try {
    const result = await runSimulatorTurn(sessionId, input);
    return jsonOk(result);
  } catch (error) {
    console.error("[votavia] whatsapp simulator failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return jsonError(500, "simulator_error", "No se pudo procesar el mensaje simulado.");
  }
}
