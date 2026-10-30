import type { Case, CaseCategory, CreateCaseInput, ParticipantContext } from "@/shared/votavia-contract";
import { CATEGORY_META, COLONIA_CENTROIDS, COLONIAS } from "@/lib/taxonomy";
import type {
  HandleInboundResult,
  WhatsAppConversationDeps,
  WhatsAppDraft,
  WhatsAppInboundMessage,
  WhatsAppSendResult,
  WhatsAppThread,
} from "./types";
import { participantKeyForWhatsApp } from "./graph-client";
import { matchColonia } from "./extract-report";

const CUAUHTEMOC_BOUNDS = { minLat: 19.2, maxLat: 19.6, minLng: -99.35, maxLng: -98.95 };
const AFFIRMATIVE = /^(s[ií]|s[ií],? (env[ií]a|correcto|por favor)|confirmo|enviar|dale|correcto)[.! ]*$/i;
const NEGATIVE = /^(no|corregir|cambiar|espera|cancelar|mejor no)[.! ]*$/i;
const RESET = /^(cancelar|empezar de nuevo|reiniciar|nuevo reporte)[.! ]*$/i;

function emptyDraft(): WhatsAppDraft {
  return {
    category: null,
    title: null,
    description: "",
    colonia: null,
    latitude: null,
    longitude: null,
    location_precision: null,
    address_hint: null,
    has_safety_concern: false,
    has_accessibility_concern: false,
    used_voice: false,
    source_message_ids: [],
    transcript: null,
  };
}

function newThread(waId: string, now: Date): WhatsAppThread {
  const iso = now.toISOString();
  return {
    wa_id: waId,
    state: "awaiting_report",
    draft: null,
    last_case_id: null,
    last_display_id: null,
    last_inbound_at: iso,
    created_at: iso,
    updated_at: iso,
  };
}

function touch(thread: WhatsAppThread, now: Date): WhatsAppThread {
  return { ...thread, last_inbound_at: now.toISOString(), updated_at: now.toISOString() };
}

function inCuauhtemoc(latitude: number, longitude: number): boolean {
  return (
    latitude >= CUAUHTEMOC_BOUNDS.minLat &&
    latitude <= CUAUHTEMOC_BOUNDS.maxLat &&
    longitude >= CUAUHTEMOC_BOUNDS.minLng &&
    longitude <= CUAUHTEMOC_BOUNDS.maxLng
  );
}

function nearestColonia(latitude: number, longitude: number): string {
  let best = COLONIAS[0] as string;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, centroid] of Object.entries(COLONIA_CENTROIDS)) {
    const meters = Math.hypot(centroid.lat - latitude, centroid.lng - longitude);
    if (meters < bestDistance) {
      bestDistance = meters;
      best = name;
    }
  }
  return best;
}

function categoryLabel(category: CaseCategory | null): string {
  return category ? CATEGORY_META[category].label : "Por definir";
}

function categoryOptions() {
  return (Object.keys(CATEGORY_META) as CaseCategory[]).map((value) => ({
    id: `cat:${value}`,
    title: CATEGORY_META[value].shortLabel,
    description: CATEGORY_META[value].description,
  }));
}

function summary(draft: WhatsAppDraft): string {
  const lines = [
    "Revisa tu reporte:",
    `• Problema: ${draft.title ?? draft.description.slice(0, 120)}`,
    `• Categoría: ${categoryLabel(draft.category)}`,
    `• Colonia: ${draft.colonia ?? "sin colonia"}`,
  ];
  if (draft.location_precision === "colonia") {
    lines.push("• Ubicación: aproximada al centro de la colonia");
  } else {
    lines.push("• Ubicación: pin compartido");
  }
  lines.push("");
  lines.push("¿Envío el reporte a VotaVía? Aún no se envía a ninguna autoridad.");
  return lines.join("\n");
}

function canConfirm(draft: WhatsAppDraft | null): draft is WhatsAppDraft & {
  category: CaseCategory;
  title: string;
  latitude: number;
  longitude: number;
  colonia: string;
} {
  return Boolean(
    draft &&
      draft.category &&
      draft.title &&
      draft.title.length >= 6 &&
      draft.description.length >= 15 &&
      draft.latitude !== null &&
      draft.longitude !== null &&
      draft.colonia &&
      draft.colonia.length >= 3,
  );
}

function mergeExtraction(
  draft: WhatsAppDraft,
  extraction: {
    category: CaseCategory | null;
    title: string | null;
    description: string;
    colonia: string | null;
    address_hint: string | null;
    has_safety_concern: boolean;
    has_accessibility_concern: boolean;
    clarifying_question: string | null;
  },
  messageId: string,
  usedVoice: boolean,
  transcript: string | null,
  append: boolean,
): WhatsAppDraft {
  const description = append && draft.description
    ? `${draft.description} ${extraction.description}`.trim().slice(0, 2000)
    : extraction.description.slice(0, 2000);
  const substantive = extraction.description.trim().length >= 25 || !draft.description;
  return {
    ...draft,
    category:
      draft.category && extraction.category === "other"
        ? draft.category
        : extraction.category ?? draft.category,
    title: substantive ? extraction.title ?? draft.title : draft.title,
    description,
    colonia: extraction.colonia ?? draft.colonia,
    address_hint: extraction.address_hint ?? draft.address_hint,
    has_safety_concern: draft.has_safety_concern || extraction.has_safety_concern,
    has_accessibility_concern:
      draft.has_accessibility_concern || extraction.has_accessibility_concern,
    used_voice: draft.used_voice || usedVoice,
    source_message_ids: Array.from(new Set([...draft.source_message_ids, messageId])),
    transcript: usedVoice ? transcript : draft.transcript,
  };
}

function withColoniaCentroid(draft: WhatsAppDraft, coloniaName: string): WhatsAppDraft {
  const centroid = COLONIA_CENTROIDS[coloniaName];
  if (!centroid) return { ...draft, colonia: coloniaName };
  return {
    ...draft,
    colonia: coloniaName,
    latitude: centroid.lat,
    longitude: centroid.lng,
    location_precision: "colonia",
  };
}

async function reply(
  deps: WhatsAppConversationDeps,
  to: string,
  type: string,
  send: () => Promise<WhatsAppSendResult>,
): Promise<boolean> {
  const result = await send();
  if (!result.ok) {
    console.error("[votavia] whatsapp send failed", { type, error: result.error });
    return false;
  }
  if (result.providerMessageId) {
    await deps.store.recordOutbound({
      providerMessageId: result.providerMessageId,
      waId: to,
      messageType: type,
    });
  }
  return true;
}

function askForLocation(deps: WhatsAppConversationDeps, to: string) {
  const fallback =
    "Para ubicar el problema, comparte tu ubicación desde el clip de WhatsApp. Si no puedes, escríbeme la colonia (por ejemplo: Roma Norte).";
  return reply(deps, to, "location_request", async () => {
    const result = await deps.sender.requestLocation(to, fallback);
    return result.ok ? result : deps.sender.sendText(to, fallback);
  });
}

async function askForCategory(deps: WhatsAppConversationDeps, to: string) {
  const body = "¿Qué tipo de problema es? Elige una categoría.";
  return reply(deps, to, "category_list", async () => {
    const result = await deps.sender.sendCategoryList(to, body, categoryOptions());
    if (result.ok) return result;
    const list = categoryOptions()
      .map((option) => `• ${option.title}`)
      .join("\n");
    return deps.sender.sendText(to, `${body}\n\n${list}`);
  });
}

async function askForConfirmation(deps: WhatsAppConversationDeps, to: string, draft: WhatsAppDraft) {
  const body = summary(draft);
  return reply(deps, to, "confirmation_buttons", async () => {
    const result = await deps.sender.sendButtons(to, body, [
      { id: "confirm_report", title: "Sí, enviar" },
      { id: "cancel_report", title: "Corregir" },
    ]);
    return result.ok ? result : deps.sender.sendText(to, `${body}\n\nResponde SÍ para enviar o CORREGIR.`);
  });
}

async function ensureNextStep(
  deps: WhatsAppConversationDeps,
  to: string,
  thread: WhatsAppThread,
): Promise<WhatsAppThread> {
  const draft = thread.draft;
  if (!draft) {
    await reply(deps, to, "text", () =>
      deps.sender.sendText(
        to,
        "Cuéntame qué problema hay en la calle y en qué colonia. Puedes escribirme o enviar una nota de voz.",
      ),
    );
    return { ...thread, state: "awaiting_report" };
  }

  if (!draft.description || draft.description.length < 15) {
    await reply(deps, to, "text", () =>
      deps.sender.sendText(
        to,
        "Necesito un poco más de detalle: ¿qué pasa y desde cuándo? Mínimo una frase completa.",
      ),
    );
    return { ...thread, state: "awaiting_report" };
  }

  if (!draft.category) {
    await askForCategory(deps, to);
    return { ...thread, state: "awaiting_category" };
  }

  if (draft.latitude === null || draft.longitude === null || !draft.colonia) {
    await askForLocation(deps, to);
    return { ...thread, state: "awaiting_location" };
  }

  await askForConfirmation(deps, to, draft);
  return { ...thread, state: "awaiting_confirmation" };
}

async function createConfirmedCase(
  deps: WhatsAppConversationDeps,
  to: string,
  thread: WhatsAppThread,
): Promise<HandleInboundResult> {
  const draft = thread.draft;
  if (!canConfirm(draft)) {
    const next = await ensureNextStep(deps, to, thread);
    await deps.store.saveThread(next);
    return { status: "replied" };
  }

  const now = deps.now?.() ?? new Date();
  const participant: ParticipantContext = {
    participant_key: (deps.hashParticipant ?? participantKeyForWhatsApp)(to),
    user_id: null,
    role: "anonymous",
  };

  const addressParts = [draft.address_hint, draft.colonia].filter(Boolean) as string[];
  if (draft.location_precision === "colonia") {
    addressParts.push("Ubicación aproximada al centro de la colonia");
  }

  const input: CreateCaseInput = {
    category: draft.category,
    title: draft.title.slice(0, 140),
    description: draft.description.slice(0, 2000),
    latitude: draft.latitude,
    longitude: draft.longitude,
    colonia: draft.colonia,
    address_hint: addressParts.join(" · ").slice(0, 160) || null,
    has_safety_concern: draft.has_safety_concern,
    has_accessibility_concern: draft.has_accessibility_concern,
    reporter_email: null,
    created_by_user_id: null,
    photo_urls: [],
    submission_channel: draft.used_voice ? "voice" : "messaging",
    submission_metadata: {
      provider: "whatsapp",
      participant_key: (deps.hashParticipant ?? participantKeyForWhatsApp)(to),
      message_ids: draft.source_message_ids,
      location_precision: draft.location_precision,
      used_voice: draft.used_voice,
      transcript: draft.transcript,
      ...(deps.extraSubmissionMetadata ?? {}),
    },
  };

  let created: Case;
  try {
    created = await deps.createCase(input, participant);
  } catch (error) {
    console.error("[votavia] whatsapp case creation failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    await reply(deps, to, "text", () =>
      deps.sender.sendText(
        to,
        "No pude registrar el reporte en este momento. Intenta de nuevo en unos minutos o usa el sitio web.",
      ),
    );
    return { status: "failed", reason: "case_creation" };
  }

  // Save before replying: a provider retry must never create a second case.
  await deps.store.saveThread({
    ...thread,
    state: "completed",
    last_case_id: created.case_id,
    last_display_id: created.display_id,
    draft: null,
    updated_at: now.toISOString(),
  });

  const link = `${deps.appUrl.replace(/\/+$/, "")}/reportes/${created.case_id}`;
  await reply(deps, to, "text", () =>
    deps.sender.sendText(
      to,
      `Listo. Tu reporte quedó registrado con folio ${created.display_id}.\nPuedes seguirlo aquí: ${link}\n\nVotaVía lo revisará. Esto no envía el reporte a una autoridad por sí solo.`,
    ),
  );
  return { status: "replied", caseId: created.case_id };
}

function resetReply(deps: WhatsAppConversationDeps, to: string) {
  return reply(deps, to, "text", () =>
    deps.sender.sendText(
      to,
      "Listo, no envié nada. Cuéntame el problema cuando quieras; puedes escribir o mandar una nota de voz.",
    ),
  );
}

/**
 * Processes exactly one inbound WhatsApp message. The caller must claim the
 * provider message id first; this function does not de-duplicate on its own.
 */
export async function handleInboundMessage(
  message: WhatsAppInboundMessage,
  deps: WhatsAppConversationDeps,
): Promise<HandleInboundResult> {
  const claim = await deps.store.claimInbound(message);
  if (claim.duplicate) return { status: "duplicate" };

  const now = deps.now?.() ?? new Date();
  const existing = await deps.store.getThread(message.from);
  let thread = existing ? touch(existing, now) : newThread(message.from, now);
  const to = message.from;

  await deps.sender.markRead(message.id).catch(() => undefined);

  if (message.type === "unsupported") {
    await reply(deps, to, "text", () =>
      deps.sender.sendText(
        to,
        "Por ahora solo puedo recibir texto, notas de voz o tu ubicación. Escríbeme el problema.",
      ),
    );
    await deps.store.saveThread(thread);
    return { status: "replied" };
  }

  if (message.type === "interactive") {
    const action = message.interactive_id ?? "";
    if (action === "confirm_report") {
      return createConfirmedCase(deps, to, thread);
    }
    if (action === "cancel_report") {
      await resetReply(deps, to);
      thread = { ...thread, state: "awaiting_report", draft: null };
      await deps.store.saveThread(thread);
      return { status: "replied" };
    }
    if (action.startsWith("cat:")) {
      const category = action.slice(4) as CaseCategory;
      if (category in CATEGORY_META && thread.draft) {
        thread = { ...thread, draft: { ...thread.draft, category } };
        const next = await ensureNextStep(deps, to, thread);
        await deps.store.saveThread(next);
        return { status: "replied" };
      }
    }
    await reply(deps, to, "text", () =>
      deps.sender.sendText(to, "No entendí esa opción. Escríbeme el problema o elige una categoría."),
    );
    await deps.store.saveThread(thread);
    return { status: "replied" };
  }

  if (message.type === "location") {
    if (message.latitude === null || message.longitude === null) {
      await askForLocation(deps, to);
      await deps.store.saveThread(thread);
      return { status: "replied" };
    }
    if (!inCuauhtemoc(message.latitude, message.longitude)) {
      await reply(deps, to, "text", () =>
        deps.sender.sendText(
          to,
          "Esa ubicación está fuera de la Alcaldía Cuauhtémoc. Por ahora VotaVía solo recibe reportes de esta alcaldía.",
        ),
      );
      await deps.store.saveThread(thread);
      return { status: "replied" };
    }

    const base = thread.draft ?? emptyDraft();
    const colonia = base.colonia ?? matchColonia(message.location_address) ?? nearestColonia(message.latitude, message.longitude);
    thread = {
      ...thread,
      draft: {
        ...base,
        latitude: message.latitude,
        longitude: message.longitude,
        location_precision: "exact",
        colonia,
        address_hint: base.address_hint ?? message.location_address ?? message.location_name ?? null,
        source_message_ids: Array.from(new Set([...base.source_message_ids, message.id])),
      },
    };
    if (!thread.draft?.description) {
      await reply(deps, to, "text", () =>
        deps.sender.sendText(to, "Gracias. Ahora cuéntame qué problema hay en esa ubicación."),
      );
      thread = { ...thread, state: "awaiting_report" };
      await deps.store.saveThread(thread);
      return { status: "replied" };
    }
    const next = await ensureNextStep(deps, to, thread);
    await deps.store.saveThread(next);
    return { status: "replied" };
  }

  // Text or voice note.
  let text = message.text;
  let usedVoice = false;
  let transcript: string | null = null;

  if (message.type === "audio") {
    if (!message.media_id) {
      await reply(deps, to, "text", () =>
        deps.sender.sendText(to, "No pude leer esa nota de voz. ¿Me escribes el problema, por favor?"),
      );
      await deps.store.saveThread(thread);
      return { status: "replied" };
    }
    const media = await deps.downloadMedia(message.media_id);
    if (!media.ok) {
      await reply(deps, to, "text", () =>
        deps.sender.sendText(
          to,
          "No pude descargar la nota de voz. Intenta de nuevo o escríbeme el problema.",
        ),
      );
      await deps.store.saveThread(thread);
      return { status: "replied" };
    }
    const transcription = await deps.transcribe({
      bytes: media.bytes,
      mimeType: media.mimeType,
      filename: `whatsapp-${message.id}.ogg`,
    });
    if (!transcription.ok || !transcription.text) {
      const configMessage =
        transcription.reason === "not_configured"
          ? "Las notas de voz todavía no están habilitadas en este número. Escríbeme el problema, por favor."
          : "No pude transcribir la nota de voz. ¿Me escribes el problema, por favor?";
      await reply(deps, to, "text", () => deps.sender.sendText(to, configMessage));
      await deps.store.saveThread(thread);
      return { status: "replied" };
    }
    text = transcription.text;
    usedVoice = true;
    transcript = transcription.text;
  }

  const clean = (text ?? "").trim();
  if (!clean) {
    await reply(deps, to, "text", () =>
      deps.sender.sendText(to, "No recibí texto. Cuéntame qué problema hay en la calle."),
    );
    await deps.store.saveThread(thread);
    return { status: "replied" };
  }

  if (RESET.test(clean)) {
    await resetReply(deps, to);
    thread = { ...thread, state: "awaiting_report", draft: null };
    await deps.store.saveThread(thread);
    return { status: "replied" };
  }

  if (thread.state === "awaiting_confirmation" && AFFIRMATIVE.test(clean)) {
    return createConfirmedCase(deps, to, thread);
  }
  if (thread.state === "awaiting_confirmation" && NEGATIVE.test(clean)) {
    await resetReply(deps, to);
    thread = { ...thread, state: "awaiting_report", draft: null };
    await deps.store.saveThread(thread);
    return { status: "replied" };
  }

  const extraction = await deps.extractReport({ text: clean, usedVoice });
  if (!extraction.is_civic_report) {
    await reply(deps, to, "text", () =>
      deps.sender.sendText(
        to,
        "Soy el canal de reportes de VotaVía. Cuéntame un problema del espacio público en Cuauhtémoc: qué pasa y en qué colonia.",
      ),
    );
    await deps.store.saveThread(thread);
    return { status: "replied" };
  }

  // A new report after a completed one starts from a clean draft.
  const startingDraft = thread.state === "completed" || !thread.draft ? emptyDraft() : thread.draft;
  // Follow-ups within the same draft add context instead of replacing it. A
  // completed report starts from an empty draft, so this never mixes cases.
  const append = Boolean(startingDraft.description);
  let draft = mergeExtraction(
    startingDraft,
    extraction,
    message.id,
    usedVoice,
    transcript,
    append,
  );

  const coloniaFromText = extraction.colonia ?? matchColonia(clean);
  if (coloniaFromText && draft.location_precision !== "exact") {
    const needsCoordinates = draft.latitude === null || draft.longitude === null;
    draft =
      draft.colonia === coloniaFromText && !needsCoordinates
        ? draft
        : withColoniaCentroid(draft, coloniaFromText);
  }

  if (extraction.clarifying_question) {
    await reply(deps, to, "text", () => deps.sender.sendText(to, extraction.clarifying_question!));
    thread = { ...thread, draft, state: "awaiting_report" };
    await deps.store.saveThread(thread);
    return { status: "replied" };
  }

  thread = { ...thread, draft, state: "awaiting_report" };
  const next = await ensureNextStep(deps, to, thread);
  await deps.store.saveThread(next);
  return { status: "replied" };
}
