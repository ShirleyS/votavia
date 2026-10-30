import type { WhatsAppInboundMessage } from "./types";

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(message: Json): WhatsAppInboundMessage | null {
  const id = asString(message.id);
  const from = asString(message.from);
  if (!id || !from) return null;

  const timestamp = asString(message.timestamp) ?? "";
  const type = asString(message.type) ?? "unsupported";

  if (type === "text") {
    const text = asObject(message.text);
    return {
      id,
      from,
      timestamp,
      type: "text",
      text: asString(text?.body),
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

  if (type === "audio" || (type === "voice" && message.voice)) {
    const audio = asObject(message.audio) ?? asObject(message.voice);
    return {
      id,
      from,
      timestamp,
      type: "audio",
      text: null,
      media_id: asString(audio?.id),
      media_mime_type: asString(audio?.mime_type),
      latitude: null,
      longitude: null,
      location_name: null,
      location_address: null,
      interactive_id: null,
      unsupported_type: null,
    };
  }

  if (type === "location") {
    const location = asObject(message.location);
    return {
      id,
      from,
      timestamp,
      type: "location",
      text: null,
      media_id: null,
      media_mime_type: null,
      latitude: asNumber(location?.latitude),
      longitude: asNumber(location?.longitude),
      location_name: asString(location?.name),
      location_address: asString(location?.address),
      interactive_id: null,
      unsupported_type: null,
    };
  }

  if (type === "interactive") {
    const interactive = asObject(message.interactive);
    const button = asObject(interactive?.button_reply);
    const list = asObject(interactive?.list_reply);
    const reply = button ?? list;
    return {
      id,
      from,
      timestamp,
      type: "interactive",
      text: asString(reply?.title),
      media_id: null,
      media_mime_type: null,
      latitude: null,
      longitude: null,
      location_name: null,
      location_address: null,
      interactive_id: asString(reply?.id),
      unsupported_type: null,
    };
  }

  return {
    id,
    from,
    timestamp,
    type: "unsupported",
    text: null,
    media_id: null,
    media_mime_type: null,
    latitude: null,
    longitude: null,
    location_name: null,
    location_address: null,
    interactive_id: null,
    unsupported_type: type,
  };
}

/**
 * Extracts inbound citizen messages from a WhatsApp Cloud API webhook body.
 * Status callbacks and malformed entries are ignored; the webhook still returns
 * 200 so Meta does not retry an otherwise valid delivery.
 */
export function parseInboundMessages(payload: unknown): WhatsAppInboundMessage[] {
  const root = asObject(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const result: WhatsAppInboundMessage[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(asObject(entry)?.changes) ? (asObject(entry)?.changes as unknown[]) : [];
    for (const change of changes) {
      const value = asObject(asObject(change)?.value);
      const messages = Array.isArray(value?.messages) ? (value?.messages as unknown[]) : [];
      for (const raw of messages) {
        const message = asObject(raw);
        if (!message) continue;
        const normalized = normalize(message);
        if (normalized) result.push(normalized);
      }
    }
  }

  return result;
}
