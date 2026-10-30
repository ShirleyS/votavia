import {
  AI_LIMITS,
  isReportSource,
  type NormalizedReportIntake,
  type ReportInput,
  type ReportSource,
} from "../types";
import { normalizeReportCategory } from "../utils/category-normalization";
import { cleanTranscription } from "../utils/similarity";
import {
  detectPromptInjection,
  isIsoDate,
  limitText,
  normalizeText,
  redactPii,
} from "../utils/validation";
import { isValidCoordinate } from "../utils/distance";

const MIN_USEFUL_DESCRIPTION = 10;

/** Infers the intake channel when the caller did not label it explicitly. */
export function inferReportSource(input: Pick<ReportInput, "source" | "source_label">): ReportSource {
  if (isReportSource(input.source)) return input.source;
  const label = normalizeText(input.source_label ?? "");
  if (!label) return "citizen_web";
  if (/(suac|caep|oficial|gobierno|alcaldia|dependencia|registro)/.test(label)) {
    return "government_record";
  }
  if (/(voz|llamada|transcrip|audio|telefono)/.test(label)) return "voice_transcription";
  if (/(whatsapp|mensaje|sms|telegram|chat|bot)/.test(label)) return "messaging";
  return "citizen_web";
}

/**
 * Shared intake step for every report source (citizen form, government record,
 * messaging, voice transcription). Classification always consumes this shape.
 *
 * The verbatim text is preserved in `original_text`; only the redacted copy is
 * sent to the model. Imported categories stay available as
 * `category.original_category` and are never overwritten.
 */
export function normalizeReportIntake(input: ReportInput): NormalizedReportIntake {
  const source = inferReportSource(input);
  const rawText = typeof input.description === "string" ? input.description : "";
  const clean = source === "voice_transcription" ? cleanTranscription(rawText) : null;
  const redacted = redactPii(clean?.text ?? rawText);
  const limited = limitText(redacted, AI_LIMITS.maxDescriptionChars);

  const colonia = input.location?.colonia?.trim() || null;
  const location =
    input.location && isValidCoordinate(input.location)
      ? {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          colonia,
        }
      : null;
  const locationPrecision = location ? "exact" : colonia ? "colonia" : "none";

  const category = normalizeReportCategory({
    category: input.category ?? null,
    original_category: input.original_category ?? null,
    description: limited.text,
    source,
  });

  const missing: string[] = [];
  if (limited.text.length < MIN_USEFUL_DESCRIPTION) missing.push("descripción");
  if (!category.normalized_category) missing.push("categoría");
  if (locationPrecision === "none") missing.push("ubicación");

  return {
    source,
    source_label: input.source_label?.trim() || null,
    source_record_id: input.source_record_id?.trim() || null,
    original_text: limitText(rawText, 20_000).text,
    normalized_text: limited.text,
    title: input.title?.trim() ? limitText(input.title.trim(), 160).text : null,
    category,
    location,
    location_colonia: colonia,
    location_precision: locationPrecision,
    created_at: isIsoDate(input.created_at) ? (input.created_at as string) : null,
    transcription: {
      detected: source === "voice_transcription",
      artifacts_removed: clean?.artifacts ?? [],
    },
    pii_redacted: redacted !== rawText,
    truncated: limited.truncated,
    injection_detected: detectPromptInjection(rawText),
    missing_fields: missing,
  };
}
