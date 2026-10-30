import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Case, CreateCaseInput, ParticipantContext } from "@/shared/votavia-contract";
import { getCaseService } from "@/server/services/container";
import { dataDir } from "@/server/env";
import { whatsappConfig } from "./config";
import { createReportExtractor } from "./extract-report";
import { handleInboundMessage } from "./conversation";
import { DemoWhatsAppStore } from "./store";
import {
  createPreferredTranscriber,
  isElevenLabsConfigured,
  isTranscriptionConfigured,
} from "./transcription";
import type {
  TranscriptionResult,
  WhatsAppInboundMessage,
  WhatsAppSendResult,
  WhatsAppSender,
  WhatsAppStore,
} from "./types";

export type SimulatorInput =
  | { kind: "text"; text: string }
  | { kind: "interactive"; actionId: string; label?: string | null }
  | {
      kind: "location";
      latitude: number;
      longitude: number;
      address?: string | null;
      name?: string | null;
    }
  | { kind: "colonia"; colonia: string }
  | {
      kind: "voice";
      transcript?: string | null;
      audio?: Uint8Array | null;
      mimeType?: string | null;
    };

export interface SimulatorMessage {
  id: string;
  type: "text" | "buttons" | "category_list" | "location_request";
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  options?: Array<{ id: string; title: string; description: string }>;
}

export interface SimulatorTurnResult {
  messages: SimulatorMessage[];
  caseId?: string;
  state: string;
  transcriptionUnavailable?: boolean;
}

export interface SimulatorCapabilities {
  enabled: boolean;
  live_whatsapp_configured: boolean;
  transcription_configured: boolean;
  /** Which provider answers voice notes in the demo. */
  transcription_provider: "elevenlabs" | "openai-compatible" | "none";
}

/**
 * The simulator is available by default only when a real WhatsApp token is not
 * configured, and can be forced either way with WHATSAPP_SIMULATOR.
 */
export function simulatorEnabled(): boolean {
  const flag = (process.env.WHATSAPP_SIMULATOR ?? "").trim().toLowerCase();
  if (["0", "off", "false", "disabled", "no"].includes(flag)) return false;
  if (["1", "on", "true", "enabled", "yes"].includes(flag)) return true;
  return !whatsappConfig().accessToken;
}

export function simulatorCapabilities(): SimulatorCapabilities {
  return {
    enabled: simulatorEnabled(),
    live_whatsapp_configured: Boolean(whatsappConfig().accessToken),
    transcription_configured: isTranscriptionConfigured() || isElevenLabsConfigured(),
    transcription_provider: isElevenLabsConfigured()
      ? "elevenlabs"
      : isTranscriptionConfigured()
        ? "openai-compatible"
        : "none",
  };
}

export function isValidSimulatorSession(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value);
}

class CollectingSender implements WhatsAppSender {
  readonly dryRun = true;
  readonly messages: SimulatorMessage[] = [];

  private push(message: Omit<SimulatorMessage, "id">) {
    this.messages.push({ id: `sim-out-${randomUUID()}`, ...message });
    return { ok: true, providerMessageId: `sim-${randomUUID()}`, dryRun: true } satisfies WhatsAppSendResult;
  }

  async sendText(_to: string, body: string) {
    return this.push({ type: "text", body });
  }

  async requestLocation(_to: string, body: string) {
    return this.push({ type: "location_request", body });
  }

  async sendButtons(_to: string, body: string, buttons: Array<{ id: string; title: string }>) {
    return this.push({ type: "buttons", body, buttons });
  }

  async sendCategoryList(
    _to: string,
    body: string,
    options: Array<{ id: string; title: string; description: string }>,
  ) {
    return this.push({ type: "category_list", body, options });
  }

  async markRead() {}
}

let sharedStore: DemoWhatsAppStore | null = null;

export function simulatorStore(): WhatsAppStore {
  if (!sharedStore) {
    sharedStore = new DemoWhatsAppStore(path.join(dataDir(), "whatsapp-simulator.json"));
  }
  return sharedStore;
}

export interface SimulatorDeps {
  store: WhatsAppStore;
  createCase: (input: CreateCaseInput, participant: ParticipantContext) => Promise<Case>;
  transcribe: (input: { bytes: Uint8Array; mimeType: string; filename: string }) => Promise<TranscriptionResult>;
  extractReport: ReturnType<typeof createReportExtractor>;
  appUrl: string;
}

function buildMessage(sessionId: string, input: SimulatorInput): WhatsAppInboundMessage {
  const base: WhatsAppInboundMessage = {
    id: `sim-in-${randomUUID()}`,
    from: `simulator-${sessionId}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: null,
    media_id: null,
    media_mime_type: null,
    latitude: null,
    longitude: null,
    location_name: null,
    location_address: null,
    interactive_id: null,
    unsupported_type: null,
  };

  switch (input.kind) {
    case "text":
      return { ...base, type: "text", text: input.text };
    case "interactive":
      return { ...base, type: "interactive", text: input.label ?? null, interactive_id: input.actionId };
    case "location":
      return {
        ...base,
        type: "location",
        latitude: input.latitude,
        longitude: input.longitude,
        location_address: input.address ?? null,
        location_name: input.name ?? null,
      };
    case "colonia":
      return { ...base, type: "text", text: `Estoy en la colonia ${input.colonia}` };
    case "voice":
      return {
        ...base,
        type: "audio",
        media_id: input.audio?.byteLength ? "simulator-audio" : "simulator-transcript",
        media_mime_type: input.mimeType ?? "audio/webm",
      };
  }
}

/**
 * Runs one simulator turn through the exact same conversation engine used by
 * the WhatsApp webhook. Outbound messages are collected and returned to the
 * browser instead of being sent through Meta.
 */
export async function runSimulatorTurn(
  sessionId: string,
  input: SimulatorInput,
  overrides: Partial<SimulatorDeps> = {},
): Promise<SimulatorTurnResult> {
  const sender = new CollectingSender();
  const message = buildMessage(sessionId, input);
  // Narrow once: `audio`/`mimeType` only exist on the voice member of the union.
  const voice = input.kind === "voice" ? input : null;
  const simulatedTranscript =
    voice && !voice.audio?.byteLength ? voice.transcript?.trim() ?? null : null;
  const audioBytes = voice?.audio ?? new Uint8Array([0]);
  const mimeType = voice?.mimeType ?? "audio/webm";

  const deps = {
    store: overrides.store ?? simulatorStore(),
    sender,
    transcribe: async (args: { bytes: Uint8Array; mimeType: string; filename: string }) => {
      if (simulatedTranscript) {
        return { ok: true as const, text: simulatedTranscript, reason: "ok" as const };
      }
      if (overrides.transcribe) return overrides.transcribe(args);
      return createPreferredTranscriber()(args);
    },
    downloadMedia: async () => ({ ok: true as const, bytes: audioBytes, mimeType }),
    extractReport: overrides.extractReport ?? createReportExtractor(),
    createCase: overrides.createCase ?? ((input, participant) => getCaseService().createCase(input, participant)),
    appUrl: overrides.appUrl ?? "http://localhost:3000",
    hashParticipant: (waId: string) => `sim-${waId.split("simulator-")[1] ?? waId}`,
    extraSubmissionMetadata: {
      simulated: true,
      simulated_transcript: Boolean(simulatedTranscript),
    },
  };

  const result = await handleInboundMessage(message, deps);
  const thread = await deps.store.getThread(message.from);
  const transcriptionUnavailable =
    input.kind === "voice" &&
    !simulatedTranscript &&
    sender.messages.some((item) => item.body.includes("notas de voz"));

  return {
    messages: sender.messages,
    caseId: result.caseId,
    state: thread?.state ?? "awaiting_report",
    transcriptionUnavailable,
  };
}
