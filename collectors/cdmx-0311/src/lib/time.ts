export function nowIso(clock: () => Date = () => new Date()): string {
  return clock().toISOString();
}

export function newRunId(clock: () => Date = () => new Date(), random = Math.random): string {
  const stamp = clock().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.floor(random() * 1_000_000)
    .toString(36)
    .padStart(4, "0")
    .slice(0, 4);
  return `${stamp}-${suffix}`;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

export function isIsoDateOrDateTime(value: string): boolean {
  return isIsoDate(value) || isIsoDateTime(value);
}

export function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Offset in minutes east of UTC for a time zone at a given instant. */
export function timeZoneOffsetMinutes(timeZone: string, instant: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

export interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/**
 * Converts a wall-clock CDMX local date/time to ISO 8601 with an explicit
 * offset. Date-only values stay date-only: the collector never invents a
 * midnight timestamp that the government did not publish.
 */
export function localDateTimeToIso(parts: LocalDateTimeParts, timeZone = "America/Mexico_City"): string {
  const { year, month, day, hour, minute = 0, second = 0 } = parts;
  if (hour === undefined) {
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  }
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = timeZoneOffsetMinutes(timeZone, new Date(guess));
  let instant = guess - offset * 60_000;
  const corrected = timeZoneOffsetMinutes(timeZone, new Date(instant));
  if (corrected !== offset) {
    offset = corrected;
    instant = guess - offset * 60_000;
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}${formatOffset(offset)}`;
}

export function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60), 2)}:${pad(absolute % 60, 2)}`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
