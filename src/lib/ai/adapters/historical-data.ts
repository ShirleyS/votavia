import { historicalRecordSchema } from "../schemas";
import type { HistoricalRecord, PreventiveRecord } from "../types";

export type NormalizeHistoricalResult =
  | { ok: true; record: HistoricalRecord }
  | { ok: false; errors: string[] };

/**
 * Validates a normalized dataset row (Ismael's export contract).
 * `category` is preserved verbatim; compare it with `normalizeCategory`.
 */
export function normalizeHistoricalRecord(raw: unknown): NormalizeHistoricalResult {
  const parsed = historicalRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "registro"}: ${issue.message}`,
      ),
    };
  }
  const record: HistoricalRecord = {
    id: parsed.data.id,
    source: parsed.data.source,
    category: parsed.data.category,
    ...(parsed.data.source_url ? { source_url: parsed.data.source_url } : {}),
    ...(parsed.data.occurred_at ? { occurred_at: parsed.data.occurred_at } : {}),
    ...(parsed.data.latitude !== undefined ? { latitude: parsed.data.latitude } : {}),
    ...(parsed.data.longitude !== undefined ? { longitude: parsed.data.longitude } : {}),
    ...(parsed.data.colonia ? { colonia: parsed.data.colonia } : {}),
    ...(parsed.data.attributes ? { attributes: parsed.data.attributes } : {}),
  };
  return { ok: true, record };
}

export function normalizeHistoricalRecords(rows: readonly unknown[]): {
  records: HistoricalRecord[];
  rejected: Array<{ index: number; errors: string[] }>;
} {
  const records: HistoricalRecord[] = [];
  const rejected: Array<{ index: number; errors: string[] }> = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const result = normalizeHistoricalRecord(row);
    if (!result.ok) {
      rejected.push({ index, errors: result.errors });
      return;
    }
    if (seen.has(result.record.id)) {
      rejected.push({ index, errors: [`id duplicado: ${result.record.id}`] });
      return;
    }
    seen.add(result.record.id);
    records.push(result.record);
  });

  return { records, rejected };
}

export interface HistoricalCoverage {
  count: number;
  sources: string[];
  categories: string[];
  earliest: string | null;
  latest: string | null;
  with_coordinates: number;
  without_dates: number;
}

/** Describes dataset coverage so preventive analysis never hides gaps. */
export function historicalCoverage(records: readonly HistoricalRecord[]): HistoricalCoverage {
  const times = records
    .map((record) => record.occurred_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return {
    count: records.length,
    sources: [...new Set(records.map((record) => record.source))].slice(0, 20),
    categories: [...new Set(records.map((record) => record.category))].slice(0, 20),
    earliest: times.length ? new Date(Math.min(...times)).toISOString() : null,
    latest: times.length ? new Date(Math.max(...times)).toISOString() : null,
    with_coordinates: records.filter(
      (record) =>
        typeof record.latitude === "number" && typeof record.longitude === "number",
    ).length,
    without_dates: records.filter((record) => !record.occurred_at).length,
  };
}

export function historicalToPreventiveRecord(record: HistoricalRecord): PreventiveRecord {
  return { ...record, kind: "historical" };
}
