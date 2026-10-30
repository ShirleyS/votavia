import { describe, expect, it, vi } from "vitest";
import type { Case, CreateCaseInput } from "@/shared/votavia-contract";
import { ALCALDIA } from "@/shared/votavia-contract";
import { createReportExtractor } from "@/server/whatsapp/extract-report";
import { handleInboundMessage } from "@/server/whatsapp/conversation";
import type {
  TranscriptionResult,
  WhatsAppInboundMessage,
  WhatsAppSendResult,
  WhatsAppSender,
  WhatsAppStore,
  WhatsAppThread,
} from "@/server/whatsapp/types";
import { createMockClient } from "@/lib/ai/__tests__/test-helpers";

class MemoryStore implements WhatsAppStore {
  readonly kind = "demo" as const;
  private readonly claimed = new Set<string>();
  private readonly threads = new Map<string, WhatsAppThread>();

  async claimInbound(message: WhatsAppInboundMessage) {
    if (this.claimed.has(message.id)) return { duplicate: true };
    this.claimed.add(message.id);
    return { duplicate: false };
  }

  async getThread(waId: string) {
    const thread = this.threads.get(waId);
    return thread ? structuredClone(thread) : null;
  }

  async saveThread(thread: WhatsAppThread) {
    this.threads.set(thread.wa_id, structuredClone(thread));
  }

  async recordOutbound() {}
}

type Sent = { kind: string; body: string; buttons?: Array<{ id: string; title: string }> };

class FakeSender implements WhatsAppSender {
  readonly dryRun = true;
  readonly sent: Sent[] = [];
  private sequence = 0;

  private result(): WhatsAppSendResult {
    this.sequence += 1;
    return { ok: true, providerMessageId: `out-${this.sequence}`, dryRun: true };
  }

  async sendText(_to: string, body: string) {
    this.sent.push({ kind: "text", body });
    return this.result();
  }

  async requestLocation(_to: string, body: string) {
    this.sent.push({ kind: "location_request", body });
    return this.result();
  }

  async sendButtons(_to: string, body: string, buttons: Array<{ id: string; title: string }>) {
    this.sent.push({ kind: "buttons", body, buttons });
    return this.result();
  }

  async sendCategoryList(_to: string, body: string) {
    this.sent.push({ kind: "category_list", body });
    return this.result();
  }

  async markRead() {}

  last() {
    return this.sent[this.sent.length - 1];
  }
}

function inbound(overrides: Partial<WhatsAppInboundMessage>): WhatsAppInboundMessage {
  return {
    id: "wamid.1",
    from: "5215500000001",
    timestamp: "1",
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
    ...overrides,
  };
}

function fakeCase(input: CreateCaseInput): Case {
  return {
    case_id: "case-1",
    display_id: "VOT-0042",
    category: input.category,
    status: "reported",
    title: input.title,
    description: input.description,
    location: {
      latitude: input.latitude,
      longitude: input.longitude,
      colonia: input.colonia,
      address_hint: input.address_hint ?? null,
      alcaldia: ALCALDIA,
    },
    colonia: input.colonia,
    latitude: input.latitude,
    longitude: input.longitude,
    photos: [],
    support_count: 0,
    supported_by_me: false,
    observation_count: 0,
    has_safety_concern: input.has_safety_concern,
    has_accessibility_concern: input.has_accessibility_concern,
    is_demo: false,
    is_published: true,
    created_at: "2026-10-30T12:00:00.000Z",
    updated_at: "2026-10-30T12:00:00.000Z",
    resolved_at: null,
  };
}

function buildDeps(overrides: { transcription?: TranscriptionResult } = {}) {
  const store = new MemoryStore();
  const sender = new FakeSender();
  const createCase = vi.fn(async (input: CreateCaseInput) => fakeCase(input));
  const transcribe = vi.fn(async (): Promise<TranscriptionResult> =>
    overrides.transcription ?? {
      ok: true,
      text: "Hay basura acumulada en la banqueta de la colonia Condesa desde ayer.",
      reason: "ok",
    },
  );
  return {
    deps: {
      store,
      sender,
      transcribe,
      downloadMedia: vi.fn(async () => ({ ok: true as const, bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/ogg" })),
      extractReport: createReportExtractor(createMockClient({ configured: false })),
      createCase,
      appUrl: "http://localhost:3000",
      hashParticipant: () => "wa-test-participant",
    },
    store,
    sender,
    createCase,
    transcribe,
  };
}

describe("WhatsApp text intake", () => {
  it("collects a report, asks for confirmation, then creates exactly one case", async () => {
    const { deps, sender, createCase, store } = buildDeps();
    const first = await handleInboundMessage(
      inbound({
        id: "wamid.text",
        text: "Hay un bache enorme en la esquina de Roma Norte; lleva una semana y los coches lo esquivan.",
      }),
      deps,
    );
    expect(first.status).toBe("replied");
    expect(sender.last().kind).toBe("buttons");
    expect(sender.last().body).toContain("Roma Norte");
    expect(sender.last().body).toContain("aproximada");

    const thread = await store.getThread("5215500000001");
    expect(thread?.state).toBe("awaiting_confirmation");

    const confirmation = await handleInboundMessage(
      inbound({ id: "wamid.confirm", type: "interactive", interactive_id: "confirm_report" }),
      deps,
    );
    expect(confirmation).toMatchObject({ status: "replied", caseId: "case-1" });
    expect(createCase).toHaveBeenCalledTimes(1);
    const input = createCase.mock.calls[0]?.[0];
    expect(input?.submission_channel).toBe("messaging");
    expect(input?.colonia).toBe("Roma Norte");
    expect(input?.latitude).toBeCloseTo(19.4185, 3);
    expect(input?.submission_metadata).toMatchObject({
      provider: "whatsapp",
      location_precision: "colonia",
      used_voice: false,
    });
    expect(sender.last().body).toContain("VOT-0042");
    expect(sender.last().body).toContain("/reportes/case-1");
    expect((await store.getThread("5215500000001"))?.state).toBe("completed");

    const duplicate = await handleInboundMessage(
      inbound({ id: "wamid.confirm", type: "interactive", interactive_id: "confirm_report" }),
      deps,
    );
    expect(duplicate.status).toBe("duplicate");
    expect(createCase).toHaveBeenCalledTimes(1);
  });

  it("starts a new draft after a completed report", async () => {
    const { deps, sender, createCase } = buildDeps();
    await handleInboundMessage(
      inbound({ id: "a", text: "Hay basura acumulada en la banqueta de la colonia Condesa desde ayer." }),
      deps,
    );
    await handleInboundMessage(
      inbound({ id: "b", type: "interactive", interactive_id: "confirm_report" }),
      deps,
    );
    expect(createCase).toHaveBeenCalledTimes(1);

    await handleInboundMessage(
      inbound({ id: "c", text: "Ahora hay una luminaria apagada en la colonia Juárez desde el martes." }),
      deps,
    );
    expect(sender.last().kind).toBe("buttons");
    expect(sender.last().body).toContain("Juárez");
    expect(createCase).toHaveBeenCalledTimes(1);
  });

  it("cancels a draft without creating a case", async () => {
    const { deps, createCase } = buildDeps();
    await handleInboundMessage(
      inbound({ id: "a", text: "Hay un bache enorme en la esquina de Roma Norte; lleva una semana." }),
      deps,
    );
    await handleInboundMessage(
      inbound({ id: "b", type: "interactive", interactive_id: "cancel_report" }),
      deps,
    );
    expect(createCase).not.toHaveBeenCalled();
  });
});

describe("WhatsApp voice intake", () => {
  it("transcribes a voice note and marks the case as voice", async () => {
    const { deps, sender, createCase, transcribe } = buildDeps();
    await handleInboundMessage(
      inbound({ id: "voice-1", type: "audio", media_id: "media-1", media_mime_type: "audio/ogg" }),
      deps,
    );
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(sender.last().kind).toBe("buttons");
    expect(sender.last().body).toContain("Condesa");

    await handleInboundMessage(
      inbound({ id: "voice-confirm", type: "interactive", interactive_id: "confirm_report" }),
      deps,
    );
    const input = createCase.mock.calls[0]?.[0];
    expect(input?.submission_channel).toBe("voice");
    expect(input?.submission_metadata).toMatchObject({
      used_voice: true,
      transcript: "Hay basura acumulada en la banqueta de la colonia Condesa desde ayer.",
    });
  });

  it("asks for text when transcription is not configured", async () => {
    const { deps, sender, createCase } = buildDeps({
      transcription: { ok: false, text: null, reason: "not_configured" },
    });
    await handleInboundMessage(
      inbound({ id: "voice-2", type: "audio", media_id: "media-2" }),
      deps,
    );
    expect(createCase).not.toHaveBeenCalled();
    expect(sender.last().body).toContain("Escríbeme");
  });

  it("falls back to a text confirmation when buttons cannot be sent", async () => {
    const { deps, createCase } = buildDeps();
    deps.sender.sendButtons = async () => ({
      ok: false,
      providerMessageId: null,
      dryRun: true,
      error: "unsupported",
    });
    await handleInboundMessage(
      inbound({ id: "button-fallback", text: "Hay un bache enorme en la esquina de Roma Norte; lleva una semana." }),
      deps,
    );
    expect(createCase).not.toHaveBeenCalled();
    expect(deps.sender.last().kind).toBe("text");
    expect(deps.sender.last().body).toContain("Responde SÍ");
  });
});

describe("WhatsApp location intake", () => {
  it("requests a location, accepts a pin inside Cuauhtémoc and confirms", async () => {
    const { deps, sender, createCase } = buildDeps();
    await handleInboundMessage(
      inbound({ id: "text-1", text: "Hay un bache profundo en la calle y los coches se caen." }),
      deps,
    );
    expect(sender.last().kind).toBe("location_request");

    await handleInboundMessage(
      inbound({ id: "loc-1", type: "location", latitude: 19.42, longitude: -99.16 }),
      deps,
    );
    expect(sender.last().kind).toBe("buttons");

    await handleInboundMessage(
      inbound({ id: "loc-confirm", type: "interactive", interactive_id: "confirm_report" }),
      deps,
    );
    const input = createCase.mock.calls[0]?.[0];
    expect(input?.latitude).toBe(19.42);
    expect(input?.submission_metadata).toMatchObject({ location_precision: "exact" });
  });

  it("does not let a colonia-only follow-up overwrite the report title or category", async () => {
    const { deps, sender, store } = buildDeps();
    await handleInboundMessage(
      inbound({ id: "short-1", text: "Hay un bache profundo en la calle y los coches se caen." }),
      deps,
    );
    expect(sender.last().kind).toBe("location_request");

    await handleInboundMessage(inbound({ id: "short-2", text: "Roma Norte" }), deps);
    const thread = await store.getThread("5215500000001");
    expect(thread?.state).toBe("awaiting_confirmation");
    expect(thread?.draft?.category).toBe("road_damage");
    expect(thread?.draft?.title).toContain("bache");
    expect(sender.last().body).toContain("Baches y pavimento");
  });

  it("rejects a pin outside Cuauhtémoc", async () => {
    const { deps, sender, createCase } = buildDeps();
    await handleInboundMessage(
      inbound({ id: "loc-out", type: "location", latitude: 25.6, longitude: -99.1 }),
      deps,
    );
    expect(sender.last().body).toContain("fuera de la Alcaldía");
    expect(createCase).not.toHaveBeenCalled();
  });
});
