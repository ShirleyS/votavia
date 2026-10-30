import type { NextRequest } from "next/server";
import { appUrl } from "@/server/env";
import { jsonError, jsonOk } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { getCaseService } from "@/server/services/container";
import { handleInboundMessage } from "@/server/whatsapp/conversation";
import { whatsappConfig } from "@/server/whatsapp/config";
import { createReportExtractor } from "@/server/whatsapp/extract-report";
import { WhatsAppGraphClient } from "@/server/whatsapp/graph-client";
import { parseInboundMessages } from "@/server/whatsapp/payload";
import { verifyWebhookToken, verifyWhatsAppSignature } from "@/server/whatsapp/signature";
import { createWhatsAppStore } from "@/server/whatsapp/store";
import { createPreferredTranscriber } from "@/server/whatsapp/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

/** Meta webhook subscription handshake. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge") ?? "";
  const config = whatsappConfig();

  if (!config.verifyToken) {
    return jsonError(503, "whatsapp_not_configured", "Falta WHATSAPP_VERIFY_TOKEN.");
  }
  if (mode !== "subscribe" || !verifyWebhookToken(token, config.verifyToken)) {
    return jsonError(403, "invalid_verify_token", "Verificación de webhook rechazada.");
  }
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Meta message webhook. Every delivery is authenticated against the exact raw
 * body; each provider message id is claimed once so retries are idempotent.
 */
export async function POST(request: NextRequest) {
  const config = whatsappConfig();
  if (!config.appSecret) {
    return jsonError(503, "whatsapp_not_configured", "Falta WHATSAPP_APP_SECRET.");
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BYTES) {
    return jsonError(413, "payload_too_large", "El webhook excede el tamaño permitido.");
  }

  if (
    !verifyWhatsAppSignature({
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
      appSecret: config.appSecret,
    })
  ) {
    return jsonError(401, "invalid_signature", "Firma de webhook inválida.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "invalid_json", "El cuerpo del webhook no es JSON válido.");
  }

  const messages = parseInboundMessages(payload);
  if (!messages.length) return jsonOk({ received: true, processed: 0 });

  const graph = new WhatsAppGraphClient({ config });
  const store = createWhatsAppStore();
  const transcribe = createPreferredTranscriber();
  const extractReport = createReportExtractor();
  const caseService = getCaseService();
  const baseUrl = appUrl();
  let processed = 0;

  for (const message of messages) {
    const limit = rateLimit(`whatsapp:${message.from}`, 40, 60 * 60 * 1000);
    if (!limit.allowed) {
      console.warn("[votavia] whatsapp rate limit reached");
      continue;
    }
    try {
      await handleInboundMessage(message, {
        store,
        sender: graph,
        transcribe,
        downloadMedia: graph.downloadMedia.bind(graph),
        extractReport,
        createCase: (input, participant) => caseService.createCase(input, participant),
        appUrl: baseUrl,
      });
      processed += 1;
    } catch (error) {
      // A single malformed event must not make Meta replay the whole batch.
      console.error("[votavia] whatsapp message failed", {
        messageId: message.id,
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  return jsonOk({ received: true, processed });
}
