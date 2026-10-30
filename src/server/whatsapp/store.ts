import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseDatabase, supabaseServiceKey, supabaseUrl } from "@/server/env";
import type { WhatsAppInboundMessage, WhatsAppState, WhatsAppStore, WhatsAppThread } from "./types";

const THREAD_STATES: WhatsAppState[] = [
  "awaiting_report",
  "awaiting_location",
  "awaiting_category",
  "awaiting_confirmation",
  "completed",
];

function isState(value: unknown): value is WhatsAppState {
  return typeof value === "string" && THREAD_STATES.includes(value as WhatsAppState);
}

function parseThread(raw: unknown): WhatsAppThread | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.wa_id !== "string" || !isState(row.state)) return null;
  return {
    wa_id: row.wa_id,
    state: row.state,
    draft: (row.draft as WhatsAppThread["draft"]) ?? null,
    last_case_id: typeof row.last_case_id === "string" ? row.last_case_id : null,
    last_display_id: typeof row.last_display_id === "string" ? row.last_display_id : null,
    last_inbound_at: typeof row.last_inbound_at === "string" ? row.last_inbound_at : new Date().toISOString(),
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

interface DemoWhatsAppDatabase {
  version: 1;
  threads: WhatsAppThread[];
  messages: Array<{
    provider_message_id: string;
    wa_id: string;
    direction: "inbound" | "outbound";
    message_type: string;
    created_at: string;
  }>;
}

function demoFile(): string {
  const dir = process.env.VOTAVIA_DATA_DIR ?? path.join(process.cwd(), ".data");
  return path.join(dir, "whatsapp.json");
}

/**
 * File-backed WhatsApp state for credential-free demo runs. Writes are
 * serialized so concurrent webhook retries cannot double-claim a message.
 */
export class DemoWhatsAppStore implements WhatsAppStore {
  readonly kind = "demo" as const;
  private cache: DemoWhatsAppDatabase | null = null;
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string = demoFile()) {}

  private async read(): Promise<DemoWhatsAppDatabase> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, "utf8")) as DemoWhatsAppDatabase;
      this.cache = {
        version: 1,
        threads: Array.isArray(parsed.threads) ? parsed.threads : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      };
    } catch {
      this.cache = { version: 1, threads: [], messages: [] };
    }
    return this.cache;
  }

  private async write(db: DemoWhatsAppDatabase): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db), "utf8");
    await fs.rename(tmp, this.file);
  }

  private mutate<T>(fn: (db: DemoWhatsAppDatabase) => T): Promise<T> {
    const next = this.writeChain.then(async () => {
      const db = await this.read();
      const result = fn(db);
      await this.write(db);
      return result;
    });
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  async claimInbound(message: WhatsAppInboundMessage): Promise<{ duplicate: boolean }> {
    return this.mutate((db) => {
      const seen = db.messages.some(
        (row) => row.provider_message_id === message.id && row.direction === "inbound",
      );
      if (seen) return { duplicate: true };
      db.messages.push({
        provider_message_id: message.id,
        wa_id: message.from,
        direction: "inbound",
        message_type: message.type,
        created_at: new Date().toISOString(),
      });
      return { duplicate: false };
    });
  }

  async getThread(waId: string): Promise<WhatsAppThread | null> {
    await this.writeChain.catch(() => undefined);
    const db = await this.read();
    return db.threads.find((thread) => thread.wa_id === waId) ?? null;
  }

  async saveThread(thread: WhatsAppThread): Promise<void> {
    await this.mutate((db) => {
      const index = db.threads.findIndex((row) => row.wa_id === thread.wa_id);
      if (index >= 0) db.threads[index] = thread;
      else db.threads.push(thread);
    });
  }

  async recordOutbound(input: {
    providerMessageId: string;
    waId: string;
    messageType: string;
  }): Promise<void> {
    await this.mutate((db) => {
      if (db.messages.some((row) => row.provider_message_id === input.providerMessageId)) return;
      db.messages.push({
        provider_message_id: input.providerMessageId,
        wa_id: input.waId,
        direction: "outbound",
        message_type: input.messageType,
        created_at: new Date().toISOString(),
      });
    });
  }
}

interface ThreadDbRow {
  wa_id: string;
  state: string;
  draft: unknown;
  last_case_id: string | null;
  last_display_id: string | null;
  last_inbound_at: string;
  created_at: string;
  updated_at: string;
}

/** Supabase-backed state using the service role; RLS denies every client role. */
export class SupabaseWhatsAppStore implements WhatsAppStore {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client =
      client ??
      createClient(supabaseUrl(), supabaseServiceKey(), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
  }

  async claimInbound(message: WhatsAppInboundMessage): Promise<{ duplicate: boolean }> {
    const { error } = await this.client.from("whatsapp_messages").insert({
      provider_message_id: message.id,
      wa_id: message.from,
      direction: "inbound",
      message_type: message.type,
    });
    if (!error) return { duplicate: false };
    if (error.code === "23505") return { duplicate: true };
    throw error;
  }

  async getThread(waId: string): Promise<WhatsAppThread | null> {
    const { data, error } = await this.client
      .from("whatsapp_threads")
      .select("wa_id,state,draft,last_case_id,last_display_id,last_inbound_at,created_at,updated_at")
      .eq("wa_id", waId)
      .maybeSingle();
    if (error) throw error;
    return data ? parseThread(data as ThreadDbRow) : null;
  }

  async saveThread(thread: WhatsAppThread): Promise<void> {
    const { error } = await this.client.from("whatsapp_threads").upsert(
      {
        wa_id: thread.wa_id,
        state: thread.state,
        draft: thread.draft,
        last_case_id: thread.last_case_id,
        last_display_id: thread.last_display_id,
        last_inbound_at: thread.last_inbound_at,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
      },
      { onConflict: "wa_id" },
    );
    if (error) throw error;
  }

  async recordOutbound(input: {
    providerMessageId: string;
    waId: string;
    messageType: string;
  }): Promise<void> {
    const { error } = await this.client.from("whatsapp_messages").insert({
      provider_message_id: input.providerMessageId,
      wa_id: input.waId,
      direction: "outbound",
      message_type: input.messageType,
    });
    if (error && error.code !== "23505") throw error;
  }
}

export function createWhatsAppStore(): WhatsAppStore {
  return hasSupabaseDatabase() ? new SupabaseWhatsAppStore() : new DemoWhatsAppStore();
}
