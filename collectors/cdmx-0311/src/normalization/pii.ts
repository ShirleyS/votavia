import { truncate } from "../lib/text.js";

export interface PiiScrubResult {
  text: string | null;
  redactions: number;
  flags: string[];
}

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CURP = /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g;
const RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g;
const PHONE_CANDIDATE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const NAMED_PERSON = /\b(?:mi nombre es|me llamo|a nombre de|nombre)\s*:?\s*([A-ZÁÉÍÓÚÜÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}]+){0,3})/giu;

export function scrubPii(value: string | null | undefined, maxLength = 4_000): PiiScrubResult {
  if (!value) return { text: null, redactions: 0, flags: [] };
  let text = value;
  let redactions = 0;
  const flags: string[] = [];

  text = replaceAndCount(text, EMAIL, "[redacted:email]", () => {
    redactions += 1;
    flags.push("pii_email_redacted");
  });
  text = replaceAndCount(text, CURP, "[redacted:curp]", () => {
    redactions += 1;
    flags.push("pii_curp_redacted");
  });
  text = replaceAndCount(text, RFC, "[redacted:rfc]", () => {
    redactions += 1;
    flags.push("pii_rfc_redacted");
  });
  text = text.replace(NAMED_PERSON, (_match, name: string) => {
    if (name.trim().split(/\s+/).length < 2) return _match;
    redactions += 1;
    flags.push("pii_name_redacted");
    return "nombre [redacted:name]";
  });
  text = text.replace(PHONE_CANDIDATE, (candidate) => {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) return candidate;
    // Do not redact a year range such as 2023-2024.
    if (/^\d{4}[-/]\d{4}$/.test(candidate.trim())) return candidate;
    redactions += 1;
    flags.push("pii_phone_redacted");
    return "[redacted:phone]";
  });

  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length > maxLength) {
    return { text: truncate(cleaned, maxLength), redactions, flags: [...flags, "description_truncated"] };
  }
  return { text: cleaned || null, redactions, flags: dedupe(flags) };
}

/** Used by validation to fail loudly if contact patterns survived scrubbing. */
export function containsContactPii(value: string): boolean {
  EMAIL.lastIndex = 0;
  CURP.lastIndex = 0;
  RFC.lastIndex = 0;
  if (EMAIL.test(value) || CURP.test(value) || RFC.test(value)) return true;
  const candidates = value.match(PHONE_CANDIDATE) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 13;
  });
}

function replaceAndCount(text: string, pattern: RegExp, replacement: string, onMatch: () => void): string {
  return text.replace(pattern, () => {
    onMatch();
    return replacement;
  });
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
