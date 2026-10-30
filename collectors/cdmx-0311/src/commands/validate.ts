import path from "node:path";
import { readdir } from "node:fs/promises";
import { atomicWriteJson, ensureDir, pathExists, readJsonFile, readJsonl } from "../lib/fs.js";
import { newRunId, nowIso } from "../lib/time.js";
import type { Logger } from "../lib/log.js";
import type { CollectorConfig } from "../config.js";
import { CollectorError } from "../errors.js";
import { summarizeValidation, validateRecord, type RecordValidationResult } from "../validation/record.js";

export interface ValidateOptions {
  config: CollectorConfig;
  logger: Logger;
  input?: string;
  clock?: () => Date;
}

export interface ValidateResult {
  run_id: string;
  input: string;
  report_path: string;
  summary: ReturnType<typeof summarizeValidation>;
  invalid_records: Array<{ index: number; errors: Array<{ path: string; message: string }> }>;
  passed: boolean;
}

export async function runValidate(options: ValidateOptions): Promise<ValidateResult> {
  const clock = options.clock ?? (() => new Date());
  const runId = newRunId(clock);
  const input = options.input ?? (await resolveLatestRecords(options.config.dataDir));
  if (!(await pathExists(input))) {
    throw new CollectorError("VALIDATION_FAILED", `Normalized records file not found: ${input}`);
  }
  const records: unknown[] = [];
  const invalid: Array<{ index: number; errors: Array<{ path: string; message: string }> }> = [];
  let index = 0;
  for await (const record of readJsonl<unknown>(input)) {
    index += 1;
    records.push(record);
    const result: RecordValidationResult = validateRecord(record);
    if (!result.ok) {
      invalid.push({ index, errors: result.errors.map((issue) => ({ path: issue.path, message: issue.message })) });
    }
  }
  const summary = summarizeValidation(records);
  const report = {
    run_id: runId,
    validated_at: nowIso(clock),
    input,
    summary,
    invalid_records: invalid.slice(0, 500),
    invalid_truncated: invalid.length > 500,
    attribution: "Gobierno de la Ciudad de México — Portal de Datos Abiertos CDMX, conjunto «Solicitudes *0311».",
    license: "See source_license on each record; this validator does not grant redistribution rights.",
  };
  const reportPath = path.join(options.config.dataDir, "manifests", "0311", `validation-${runId}.json`);
  await ensureDir(path.dirname(reportPath));
  await atomicWriteJson(reportPath, report);
  const passed = summary.invalid === 0 && summary.duplicate_keys.length === 0;
  return { run_id: runId, input, report_path: reportPath, summary, invalid_records: invalid, passed };
}

export function formatValidationSummary(result: ValidateResult): string {
  const summary = result.summary;
  const lines = [
    `Validated ${summary.total} records from ${result.input}`,
    `Valid: ${summary.valid}; invalid: ${summary.invalid}; warnings: ${summary.warnings}`,
    `Duplicate dedupe keys: ${summary.duplicate_keys.length}`,
    `Missing coordinates: ${summary.missing_coordinates}; missing dates: ${summary.missing_dates}`,
    `Statuses: ${formatCounts(summary.statuses)}`,
    `Categories: ${formatCounts(summary.categories)}`,
    `Licenses: ${formatCounts(summary.licenses)}`,
    `Report: ${result.report_path}`,
  ];
  if (summary.duplicate_keys.length > 0) lines.push(`Duplicate keys: ${summary.duplicate_keys.slice(0, 10).join(", ")}`);
  if (summary.invalid > 0) lines.push(`First invalid record: index ${result.invalid_records[0]?.index ?? "?"}`);
  return lines.join("\n");
}

async function resolveLatestRecords(dataDir: string): Promise<string> {
  const latestPath = path.join(dataDir, "manifests", "0311", "latest.json");
  if (await pathExists(latestPath)) {
    const latest = await readJsonFile<{ outputs?: { records_jsonl?: string | null } }>(latestPath);
    const records = latest.outputs?.records_jsonl;
    if (records && (await pathExists(records))) return records;
  }
  const normalizedRoot = path.join(dataDir, "normalized", "0311");
  if (await pathExists(normalizedRoot)) {
    const directories = (await readdir(normalizedRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const directory of directories) {
      const candidate = path.join(normalizedRoot, directory, "records.jsonl");
      if (await pathExists(candidate)) return candidate;
    }
  }
  throw new CollectorError("VALIDATION_FAILED", "No normalized records file found. Run import:0311 first or pass --input.");
}

function formatCounts(values: Record<string, number>): string {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return entries.length === 0 ? "none" : entries.map(([key, count]) => `${key}=${count}`).join(", ");
}
