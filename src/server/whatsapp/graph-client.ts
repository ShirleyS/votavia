import { randomUUID, createHash } from "node:crypto";
import type { WhatsAppSendResult, WhatsAppSender } from "./types";
import { whatsappConfig, whatsappGraphBase, type WhatsAppConfig } from "./config";

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const SEND_TIMEOUT_MS = 10_000;
const MEDIA_TIMEOUT_MS = 20_000;
const MEDIA_HOSTS = [".facebook.com", ".fbcdn.net", ".fbsbx.com", ".facebookusercontent.com"];

interface GraphErrorBody {
  error?: { message?: string; code?: number };
}

function safeProviderError(body: unknown, status: number): string {
  const parsed = body as GraphErrorBody | null;
  const message = parsed?.error?.message ? String(parsed.error.message) : "";
  return `graph_${status}${message ? `: ${message.slice(0, 160)}` : ""}`;
}

function isAllowedMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      MEDIA_HOSTS.some((suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

export interface WhatsAppGraphClientOptions {
  config?: WhatsAppConfig;
  fetchImpl?: typeof fetch;
}

export class WhatsAppGraphClient implements WhatsAppSender {
  readonly dryRun: boolean;
  private readonly config: WhatsAppConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WhatsAppGraphClientOptions = {}) {
    this.config = options.config ?? whatsappConfig();
    this.dryRun = this.config.dryRun;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private async post(payload: unknown): Promise<WhatsAppSendResult> {
    if (this.dryRun) {
      console.info("[votavia] whatsapp dry-run send", {
        type: (payload as { type?: string })?.type ?? "interactive",
      });
      return { ok: true, providerMessageId: `dry-run-${randomUUID()}`, dryRun: true };
    }

    const url = `${whatsappGraphBase(this.config)}/${encodeURIComponent(this.config.phoneNumberId)}/messages`;
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...(payload as object) }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => null)) as
        | { messages?: Array<{ id?: string }> }
        | null;
      if (!response.ok) {
        return {
          ok: false,
          providerMessageId: null,
          dryRun: false,
          error: safeProviderError(body, response.status),
        };
      }
      return {
        ok: true,
        providerMessageId: body?.messages?.[0]?.id ?? null,
        dryRun: false,
      };
    } catch (error) {
      return {
        ok: false,
        providerMessageId: null,
        dryRun: false,
        error: error instanceof Error ? error.name : "network_error",
      };
    }
  }

  sendText(to: string, body: string): Promise<WhatsAppSendResult> {
    return this.post({ to, type: "text", text: { body, preview_url: false } });
  }

  requestLocation(to: string, body: string): Promise<WhatsAppSendResult> {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: { text: body },
        action: { name: "send_location" },
      },
    });
  }

  sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<WhatsAppSendResult> {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: { id: button.id, title: button.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  sendCategoryList(
    to: string,
    body: string,
    options: Array<{ id: string; title: string; description: string }>,
  ): Promise<WhatsAppSendResult> {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: "Elegir categoría",
          sections: [
            {
              title: "Categorías",
              rows: options.slice(0, 10).map((option) => ({
                id: option.id.slice(0, 200),
                title: option.title.slice(0, 24),
                description: option.description.slice(0, 72),
              })),
            },
          ],
        },
      },
    });
  }

  async markRead(providerMessageId: string): Promise<void> {
    if (this.dryRun || !providerMessageId) return;
    try {
      await this.fetchImpl(
        `${whatsappGraphBase(this.config)}/${encodeURIComponent(this.config.phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            status: "read",
            message_id: providerMessageId,
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        },
      );
    } catch {
      // Read receipts are best-effort and must never block a reply.
    }
  }

  /**
   * Downloads a voice note through the Graph media endpoint. The temporary
   * media URL requires the same bearer token and is never persisted.
   */
  async downloadMedia(
    mediaId: string,
  ): Promise<{ ok: true; bytes: Uint8Array; mimeType: string } | { ok: false; reason: string }> {
    if (this.dryRun) return { ok: false, reason: "dry_run" };
    if (!/^[A-Za-z0-9_-]+$/.test(mediaId)) return { ok: false, reason: "invalid_media_id" };

    try {
      const metaResponse = await this.fetchImpl(
        `${whatsappGraphBase(this.config)}/${encodeURIComponent(mediaId)}`,
        {
          headers: { Authorization: `Bearer ${this.config.accessToken}` },
          signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
        },
      );
      if (!metaResponse.ok) return { ok: false, reason: `graph_${metaResponse.status}` };
      const meta = (await metaResponse.json()) as {
        url?: string;
        mime_type?: string;
        file_size?: number;
      };
      if (!meta.url || !isAllowedMediaUrl(meta.url)) return { ok: false, reason: "invalid_media_url" };
      if (typeof meta.file_size === "number" && meta.file_size > MAX_MEDIA_BYTES) {
        return { ok: false, reason: "too_large" };
      }

      const mediaResponse = await this.fetchImpl(meta.url, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
      });
      if (!mediaResponse.ok) return { ok: false, reason: `media_${mediaResponse.status}` };
      const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
      if (bytes.byteLength > MAX_MEDIA_BYTES) return { ok: false, reason: "too_large" };
      return {
        ok: true,
        bytes,
        mimeType: meta.mime_type ?? "audio/ogg",
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.name : "network_error",
      };
    }
  }
}

/** Stable, non-reversible participant key. The raw phone number never leaks. */
export function participantKeyForWhatsApp(waId: string): string {
  const digest = createHash("sha256").update(`votavia-wa:${waId}`).digest("hex");
  return `wa-${digest.slice(0, 24)}`;
}
