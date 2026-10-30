import type { CaseCategory, Case, CreateCaseInput, ParticipantContext } from "@/shared/votavia-contract";

/** Conversation states for the WhatsApp citizen channel. */
export type WhatsAppState =
  | "awaiting_report"
  | "awaiting_location"
  | "awaiting_category"
  | "awaiting_confirmation"
  | "completed";

/**
 * A report draft collected across one or more WhatsApp messages. It is not a
 * case until the citizen confirms it and the service layer validates it.
 */
export interface WhatsAppDraft {
  category: CaseCategory | null;
  title: string | null;
  description: string;
  colonia: string | null;
  latitude: number | null;
  longitude: number | null;
  location_precision: "exact" | "colonia" | null;
  address_hint: string | null;
  /** "entre X y Y" reference used when there is no exact address. */
  between_streets: string | null;
  /** Name the citizen gave; never inferred from the phone number. */
  reporter_name: string | null;
  /** Citizen-reported severity. */
  severity: ReportedSeverity | null;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  /** True when at least one message in this draft arrived as a voice note. */
  used_voice: boolean;
  /** Provider message ids that contributed text to this draft. */
  source_message_ids: string[];
  /** Latest transcript, when the contribution came from audio. */
  transcript: string | null;
}

export interface WhatsAppThread {
  wa_id: string;
  state: WhatsAppState;
  draft: WhatsAppDraft | null;
  last_case_id: string | null;
  last_display_id: string | null;
  last_inbound_at: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppInboundMessage {
  /** Meta's stable message id (`wamid...`). Used for idempotency. */
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "audio" | "location" | "interactive" | "unsupported";
  text: string | null;
  media_id: string | null;
  media_mime_type: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  location_address: string | null;
  interactive_id: string | null;
  unsupported_type: string | null;
}

export interface WhatsAppStore {
  readonly kind: "demo" | "supabase";
  /**
   * Records an inbound provider message. Returns `{ duplicate: true }` when the
   * same provider id was already claimed, so retries never create two cases.
   */
  claimInbound(message: WhatsAppInboundMessage): Promise<{ duplicate: boolean }>;
  getThread(waId: string): Promise<WhatsAppThread | null>;
  saveThread(thread: WhatsAppThread): Promise<void>;
  recordOutbound(input: {
    providerMessageId: string;
    waId: string;
    messageType: string;
  }): Promise<void>;
}

export interface WhatsAppSendResult {
  ok: boolean;
  providerMessageId: string | null;
  dryRun: boolean;
  error?: string;
}

export interface WhatsAppSender {
  readonly dryRun: boolean;
  sendText(to: string, body: string): Promise<WhatsAppSendResult>;
  requestLocation(to: string, body: string): Promise<WhatsAppSendResult>;
  sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<WhatsAppSendResult>;
  sendCategoryList(
    to: string,
    body: string,
    options: Array<{ id: string; title: string; description: string }>,
  ): Promise<WhatsAppSendResult>;
  markRead(providerMessageId: string): Promise<void>;
}

export interface TranscriptionResult {
  ok: boolean;
  text: string | null;
  reason: "ok" | "not_configured" | "too_large" | "provider_error" | "empty";
}

export interface TranscribeAudio {
  (input: { bytes: Uint8Array; mimeType: string; filename: string }): Promise<TranscriptionResult>;
}

/** Citizen-reported severity, matching the web form vocabulary. */
export const REPORTED_SEVERITIES = ["baja", "media", "alta", "critica"] as const;
export type ReportedSeverity = (typeof REPORTED_SEVERITIES)[number];

export interface ReportExtraction {
  is_civic_report: boolean;
  category: CaseCategory | null;
  title: string | null;
  description: string;
  colonia: string | null;
  /** Street, number, or landmark when one is given. */
  address_hint: string | null;
  /** "Entre X y Y" — used when no exact location is available. */
  between_streets: string | null;
  /** Name the person gives for the report. Optional; never guessed. */
  reporter_name: string | null;
  /** baja | media | alta | critica, or null when the message does not say. */
  severity: ReportedSeverity | null;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  clarifying_question: string | null;
}

export interface ExtractReport {
  (input: { text: string; usedVoice: boolean }): Promise<ReportExtraction>;
}

export interface WhatsAppConversationDeps {
  store: WhatsAppStore;
  sender: WhatsAppSender;
  transcribe: TranscribeAudio;
  downloadMedia: (
    mediaId: string,
  ) => Promise<{ ok: true; bytes: Uint8Array; mimeType: string } | { ok: false; reason: string }>;
  extractReport: ExtractReport;
  createCase: (input: CreateCaseInput, participant: ParticipantContext) => Promise<Case>;
  appUrl: string;
  now?: () => Date;
  /** Injectable hasher so tests keep raw phone numbers out of assertions. */
  hashParticipant?: (waId: string) => string;
}

export interface HandleInboundResult {
  status: "ignored" | "duplicate" | "replied" | "failed";
  caseId?: string;
  reason?: string;
}
