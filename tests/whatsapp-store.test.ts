import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DemoWhatsAppStore } from "@/server/whatsapp/store";
import type { WhatsAppInboundMessage } from "@/server/whatsapp/types";

function inbound(id: string): WhatsAppInboundMessage {
  return {
    id,
    from: "5215500000001",
    timestamp: "1",
    type: "text",
    text: "hola",
    media_id: null,
    media_mime_type: null,
    latitude: null,
    longitude: null,
    location_name: null,
    location_address: null,
    interactive_id: null,
    unsupported_type: null,
  };
}

describe("Demo WhatsApp store", () => {
  it("claims each provider message once and persists threads", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "votavia-wa-"));
    const file = path.join(dir, "whatsapp.json");
    const store = new DemoWhatsAppStore(file);

    expect(await store.claimInbound(inbound("wamid.a"))).toEqual({ duplicate: false });
    expect(await store.claimInbound(inbound("wamid.a"))).toEqual({ duplicate: true });
    expect(await store.claimInbound(inbound("wamid.b"))).toEqual({ duplicate: false });

    const thread = {
      wa_id: "5215500000001",
      state: "awaiting_confirmation" as const,
      draft: null,
      last_case_id: null,
      last_display_id: null,
      last_inbound_at: "2026-10-30T12:00:00.000Z",
      created_at: "2026-10-30T12:00:00.000Z",
      updated_at: "2026-10-30T12:00:00.000Z",
    };
    await store.saveThread(thread);

    const reloaded = new DemoWhatsAppStore(file);
    expect(await reloaded.getThread("5215500000001")).toEqual(thread);
    expect(await reloaded.claimInbound(inbound("wamid.a"))).toEqual({ duplicate: true });
  });
});
