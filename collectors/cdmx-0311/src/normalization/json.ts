import type { NormalizedOfficialRecord, NormalizationResult, NormalizeContext } from "../types.js";
import { inspectSchema, mapRow, type CsvSchema } from "../parsers/schema.js";
import { normalizeRecord } from "./record.js";

export interface JsonTable {
  headers: string[];
  rows: Array<{ row_number: number; values: string[] }>;
}

/** Converts an array of dashboard JSON objects into the same table shape as CSV. */
export function tableFromObjects(objects: readonly Record<string, unknown>[]): JsonTable {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const object of objects) {
    for (const key of Object.keys(object)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return {
    headers,
    rows: objects.map((object, index) => ({
      row_number: index + 1,
      values: headers.map((header) => stringifyCell(object[header])),
    })),
  };
}

export function normalizeJsonRecords(
  objects: readonly Record<string, unknown>[],
  context: Omit<NormalizeContext, "rowNumber">,
  schemaOverride?: CsvSchema,
): { schema: CsvSchema; records: NormalizedOfficialRecord[]; rejected: Array<{ row: number; errors: string[] }>; filtered: number; warnings: string[] } {
  const table = tableFromObjects(objects);
  const schema = schemaOverride ?? inspectSchema(table.headers);
  const records: NormalizedOfficialRecord[] = [];
  const rejected: Array<{ row: number; errors: string[] }> = [];
  const warnings: string[] = [];
  let filtered = 0;
  for (const tableRow of table.rows) {
    const result = normalizeRecord(mapRow(tableRow, schema), schema, { ...context, rowNumber: tableRow.row_number });
    accumulateResult(result, records, rejected, warnings, tableRow.row_number);
    if (result.filteredOut) filtered += 1;
  }
  return { schema, records, rejected, filtered, warnings };
}

function accumulateResult(
  result: NormalizationResult,
  records: NormalizedOfficialRecord[],
  rejected: Array<{ row: number; errors: string[] }>,
  warnings: string[],
  rowNumber: number,
): void {
  if (result.record) records.push(result.record);
  if (result.rejected) rejected.push({ row: rowNumber, errors: result.errors });
  warnings.push(...result.warnings);
}

export function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyCell).join(" | ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
