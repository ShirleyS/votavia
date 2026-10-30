import { localDateTimeToIso } from "../lib/time.js";
import { nullableText, stripDiacritics } from "../lib/text.js";

export type DatePrecision = "date" | "datetime";

export interface ParsedDate {
  iso: string;
  precision: DatePrecision;
  warnings: string[];
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

const NULL_DATE = new Set([
  "",
  "-",
  "--",
  "---",
  "null",
  "none",
  "n/a",
  "na",
  "sin fecha",
  "sin dato",
  "no aplica",
  "0000-00-00",
  "00000000",
]);

/** Parses Spanish/Latin-American date formats without inventing precision. */
export function parseDateValue(value: unknown): ParsedDate | null {
  const text = nullableText(value, 100);
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (NULL_DATE.has(stripDiacritics(normalized).toLowerCase())) return null;

  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(normalized);
  if (yearFirst) {
    const parts: DateParts = {
      year: Number(yearFirst[1]),
      month: Number(yearFirst[2]),
      day: Number(yearFirst[3]),
      ...(yearFirst[4] !== undefined ? { hour: Number(yearFirst[4]), minute: Number(yearFirst[5]), second: Number(yearFirst[6] ?? 0) } : {}),
    };
    return finish(parts, []);
  }

  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(normalized);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    const warnings: string[] = [];
    let day: number;
    let month: number;
    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      day = first;
      month = second;
      warnings.push("assumed_mdy_order");
    } else {
      day = first;
      month = second;
      warnings.push("ambiguous_date_assumed_dmy");
    }
    const parts: DateParts = {
      year,
      month,
      day,
      ...(dayFirst[4] !== undefined ? { hour: Number(dayFirst[4]), minute: Number(dayFirst[5]), second: Number(dayFirst[6] ?? 0) } : {}),
    };
    return finish(parts, warnings);
  }

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(normalized);
  if (compact) {
    return finish(
      { year: Number(compact[1]), month: Number(compact[2]), day: Number(compact[3]) },
      [],
    );
  }

  const serial = /^\d{5}(?:\.\d+)?$/.exec(normalized);
  if (serial) {
    const days = Number(serial[0]);
    if (days >= 20_000 && days <= 80_000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(days) * 86_400_000);
      return finish(
        { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
        ["excel_serial_date"],
      );
    }
  }
  return null;
}

export interface ParsedTime {
  hour: number;
  minute: number;
  second: number;
  warnings: string[];
}

export function parseTimeValue(value: unknown): ParsedTime | null {
  const text = nullableText(value, 40);
  if (!text) return null;
  const match = /^(\d{1,2}):?(\d{2})(?::?(\d{2}))?(?:\s*([AaPp][Mm]))?$/.exec(text.replace(/\s+/g, ""));
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridian = match[4]?.toUpperCase();
  const warnings: string[] = [];
  if (meridian) {
    if (hour < 1 || hour > 12) return null;
    if (meridian === "PM" && hour !== 12) hour += 12;
    if (meridian === "AM" && hour === 12) hour = 0;
    warnings.push("12_hour_clock_converted");
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second, warnings };
}

export function normalizeReportedAt(dateValue: unknown, timeValue: unknown): {
  iso: string | null;
  precision: DatePrecision | null;
  warnings: string[];
} {
  const date = parseDateValue(dateValue);
  if (!date) return { iso: null, precision: null, warnings: ["invalid_or_missing_date"] };
  const warnings = [...date.warnings];
  if (date.precision === "datetime") return { iso: date.iso, precision: "datetime", warnings };
  const time = parseTimeValue(timeValue);
  if (!time) return { iso: date.iso, precision: "date", warnings };
  warnings.push(...time.warnings);
  const parts = splitIsoDate(date.iso);
  if (!parts) return { iso: date.iso, precision: "date", warnings: [...warnings, "invalid_date_parts"] };
  return {
    iso: localDateTimeToIso({ ...parts, hour: time.hour, minute: time.minute, second: time.second }),
    precision: "datetime",
    warnings,
  };
}

export function normalizeClosedAt(value: unknown): {
  iso: string | null;
  precision: DatePrecision | null;
  warnings: string[];
} {
  const date = parseDateValue(value);
  return date
    ? { iso: date.iso, precision: date.precision, warnings: date.warnings }
    : { iso: null, precision: null, warnings: [] };
}

function finish(parts: DateParts, warnings: string[]): ParsedDate | null {
  if (!isValidCalendarDate(parts.year, parts.month, parts.day)) return null;
  if (parts.hour !== undefined) {
    if (parts.hour > 23 || (parts.minute ?? 0) > 59 || (parts.second ?? 0) > 59) return null;
    return {
      iso: localDateTimeToIso({
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
      }),
      precision: "datetime",
      warnings,
    };
  }
  return {
    iso: `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`,
    precision: "date",
    warnings,
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function splitIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
