const NULL_SENTINELS = new Set([
  "",
  "-",
  "--",
  "---",
  "null",
  "none",
  "n/a",
  "na",
  "nan",
  "undefined",
  "sin dato",
  "sin datos",
  "no aplica",
  "no disponible",
  "0000-00-00",
  "0000-00-00 00:00:00",
]);

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Uppercase, accent- and punctuation-insensitive comparison key. */
export function normalizeKey(value: string): string {
  return normalizeWhitespace(
    stripDiacritics(value)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " "),
  );
}

export function nullableText(value: unknown, maxLength = 2_000): string | null {
  if (value === null || value === undefined) return null;
  const text = normalizeWhitespace(String(value));
  if (!text) return null;
  if (NULL_SENTINELS.has(stripDiacritics(text).toLowerCase())) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/** Parses "19.4326", "19,4326" and values with surrounding whitespace. */
export function parseDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text || NULL_SENTINELS.has(text.toLowerCase())) return null;
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function titleCaseEs(value: string): string {
  const small = new Set(["de", "del", "la", "las", "los", "y", "e", "el", "san", "santa"]);
  return normalizeWhitespace(value)
    .toLocaleLowerCase("es-MX")
    .split(" ")
    .map((word, index) => {
      if (index > 0 && small.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase("es-MX") + word.slice(1);
    })
    .join(" ");
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function safeErrorMessage(error: unknown, max = 500): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return truncate(message, max);
}
