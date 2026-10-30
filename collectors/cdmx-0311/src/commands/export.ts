import path from "node:path";
import { readFile } from "node:fs/promises";
import { atomicWriteJson, ensureDir, pathExists, readJsonFile, readJsonl, writeJsonlAtomic } from "../lib/fs.js";
import { sha256String, stableStringify } from "../lib/hash.js";
import { newRunId, nowIso } from "../lib/time.js";
import type { Logger } from "../lib/log.js";
import type { CollectorConfig } from "../config.js";
import { CollectorError } from "../errors.js";
import type { NormalizedOfficialRecord } from "../types.js";
import {
  DELETION_POLICY,
  SOURCE_DATASET,
  SOURCE_SYSTEM,
  statusObservation,
  toIngestRecord,
} from "../adapters/ingest.js";
import { INGEST_CONTRACT_VERSION, type IngestBatchManifest, type OfficialRecordIngestInput } from "../ingest-contract.js";
import { COLLECTOR_NAME, COLLECTOR_VERSION } from "../version.js";

export interface ExportOptions {
  config: CollectorConfig;
  logger: Logger;
  input?: string;
  outDir?: string;
  clock?: () => Date;
}

export interface ExportResult {
  run_id: string;
  records_path: string;
  status_history_path: string;
  manifest_path: string;
  manifest: IngestBatchManifest;
  idempotency_key: string;
}

/**
 * What the ingest consumer was last told about a record. Kept separately from
 * the import index (which tracks the collector's own view) so that
 * created/updated/unchanged counts describe the consumer's experience.
 */
interface IngestIndexEntry {
  dedupe_key: string;
  source_record_id: string;
  content_hash: string;
  original_status: string | null;
  normalized_status: string;
  last_exported_at: string;
  last_batch_id: string;
}

function ingestIndexPath(dataDir: string): string {
  return path.join(dataDir, "state", "0311", "ingest-index.jsonl");
}

async function loadIngestIndex(dataDir: string): Promise<Map<string, IngestIndexEntry>> {
  const entries = new Map<string, IngestIndexEntry>();
  const file = ingestIndexPath(dataDir);
  if (!(await pathExists(file))) return entries;
  for await (const entry of readJsonl<IngestIndexEntry>(file)) {
    entries.set(entry.dedupe_key, entry);
  }
  return entries;
}

export async function runExport(options: ExportOptions): Promise<ExportResult> {
  const clock = options.clock ?? (() => new Date());
  const generatedAt = nowIso(clock);
  const input = options.input ?? (await resolveLatestRecords(options.config.dataDir));
  if (!(await pathExists(input))) {
    throw new CollectorError("VALIDATION_FAILED", `Normalized records file not found: ${input}`);
  }
  const outDir = options.outDir ?? path.join(options.config.dataDir, "ingest", "0311", newRunId(clock));
  await ensureDir(outDir);

  const runId = path.basename(path.dirname(input));
  const license = await readRunLicense(path.dirname(input), options.config.dataDir);
  const indexEntries = await loadIngestIndex(options.config.dataDir);
  const nextIndexEntries: IngestIndexEntry[] = [];

  const records: OfficialRecordIngestInput[] = [];
  const observations = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const warnings: string[] = [];

  for await (const normalized of readJsonl<NormalizedOfficialRecord>(input)) {
    const adapted = toIngestRecord(normalized, {
      runId,
      collectedAt: normalized.collected_at,
      licenseId: license.id,
      licenseUrl: license.url,
      verifiedFrom: license.verifiedFrom,
      sourceKind: "ckan",
    });
    records.push(adapted.record);

    const previous = indexEntries.get(normalized.dedupe_key) ?? null;
    if (!previous) created += 1;
    else if (previous.content_hash === normalized.record_hash) unchanged += 1;
    else updated += 1;

    const observation = statusObservation({
      previous: previous
        ? ({ original_status: previous.original_status, normalized_status: previous.normalized_status } as never)
        : null,
      current: normalized,
      runId,
      observedAt: normalized.collected_at ?? generatedAt,
    });
    if (observation) observations.push(observation);

    nextIndexEntries.push({
      dedupe_key: normalized.dedupe_key,
      source_record_id: adapted.record.source_record_id,
      content_hash: normalized.record_hash,
      original_status: normalized.original_status,
      normalized_status: normalized.normalized_status,
      last_exported_at: generatedAt,
      last_batch_id: runId,
    });
  }

  if (records.length === 0) {
    warnings.push("normalized input contained no records; an empty ingestion batch was produced");
  }

  // Deterministic ordering makes repeated exports byte-identical.
  records.sort((a, b) => a.source_record_id.localeCompare(b.source_record_id));
  observations.sort((a, b) =>
    a.source_record_id.localeCompare(b.source_record_id) || a.observed_at.localeCompare(b.observed_at),
  );

  const recordsPath = path.join(outDir, "records.jsonl");
  const statusHistoryPath = path.join(outDir, "status-history.jsonl");
  await writeJsonlAtomic(recordsPath, records);
  await writeJsonlAtomic(statusHistoryPath, observations);

  const idempotencyKey = sha256String(
    stableStringify(
      records.map((record) => ({
        source_record_id: record.source_record_id,
        content_hash: record.content_hash,
      })),
    ),
  );

  const manifest: IngestBatchManifest = {
    contract_version: INGEST_CONTRACT_VERSION,
    collector: { name: COLLECTOR_NAME, version: COLLECTOR_VERSION },
    source_system: SOURCE_SYSTEM,
    source_dataset: SOURCE_DATASET,
    run_id: runId,
    generated_at: generatedAt,
    idempotency_key: idempotencyKey,
    counts: {
      records: records.length,
      status_observations: observations.length,
      created,
      updated,
      unchanged,
    },
    license: {
      id: license.id ?? "unverified",
      url: license.url,
      attribution: records[0]?.attribution ?? "",
      redistribution: records[0]?.redistribution ?? "unknown",
      note: records[0]?.redistribution_note ?? "",
      verified_from: license.verifiedFrom,
    },
    upsert_key: ["source_system", "source_record_id"],
    deletion_policy: DELETION_POLICY,
    outputs: {
      records: recordsPath,
      status_history: statusHistoryPath,
    },
    warnings,
  };
  const manifestPath = path.join(outDir, "manifest.json");
  await atomicWriteJson(manifestPath, manifest);

  // Persist what the consumer has now seen so the next export reports accurate
  // created/updated/unchanged counts and does not re-emit unchanged statuses.
  await compactIngestIndex(options.config.dataDir, indexEntries, nextIndexEntries);

  return { run_id: runId, records_path: recordsPath, status_history_path: statusHistoryPath, manifest_path: manifestPath, manifest, idempotency_key: idempotencyKey };
}

interface RunLicense {
  id: string | null;
  url: string | null;
  verifiedFrom: "ckan_metadata" | "dataset_page" | "unverified";
}

/**
 * Reads the license from the run's CKAN snapshot. Falls back to `unverified`
 * rather than guessing from a hardcoded constant.
 */
async function readRunLicense(normalizedDir: string, dataDir: string): Promise<RunLicense> {
  const runId = path.basename(normalizedDir);
  const candidates = [
    path.join(dataDir, "manifests", "0311", `${runId}.json`),
    path.join(dataDir, "manifests", "0311", `${runId}-ckan.json`),
  ];
  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    const parsed = await readJsonFile<Record<string, unknown>>(candidate);
    const dataset = (parsed.dataset ?? (parsed as { dataset?: unknown }).dataset) as
      | { license_id?: string | null; license_url?: string | null }
      | null
      | undefined;
    const licenseId = dataset?.license_id ?? null;
    const licenseUrl = dataset?.license_url ?? null;
    if (licenseId) {
      const lowered = licenseId.trim().toLowerCase();
      return {
        id: lowered === "notspecified" ? null : licenseId,
        url: licenseUrl,
        verifiedFrom: lowered === "notspecified" ? "unverified" : "ckan_metadata",
      };
    }
  }
  return { id: null, url: null, verifiedFrom: "unverified" };
}

async function compactIngestIndex(
  dataDir: string,
  previous: Map<string, IngestIndexEntry>,
  updates: readonly IngestIndexEntry[],
): Promise<void> {
  if (updates.length === 0) return;
  const merged = new Map(previous);
  for (const entry of updates) merged.set(entry.dedupe_key, entry);
  const ordered = [...merged.values()].sort((a, b) => a.dedupe_key.localeCompare(b.dedupe_key));
  await writeJsonlAtomic(ingestIndexPath(dataDir), ordered);
}

async function resolveLatestRecords(dataDir: string): Promise<string> {
  const latestPath = path.join(dataDir, "manifests", "0311", "latest.json");
  if (await pathExists(latestPath)) {
    const latest = await readJsonFile<{ outputs?: { records_jsonl?: string | null } }>(latestPath);
    const records = latest.outputs?.records_jsonl;
    if (records && (await pathExists(records))) return records;
  }
  throw new CollectorError("VALIDATION_FAILED", "No normalized records found. Run import:0311 first or pass --input.");
}

export function formatExportSummary(result: ExportResult): string {
  const counts = result.manifest.counts;
  return [
    `Ingestion batch for run ${result.run_id}`,
    `Records: ${counts.records} (new ${counts.created}, updated ${counts.updated}, unchanged ${counts.unchanged})`,
    `Status observations: ${counts.status_observations}`,
    `Redistribution: ${result.manifest.license.redistribution} (${result.manifest.license.id})`,
    `Idempotency key: ${result.idempotency_key}`,
    `Records: ${result.records_path}`,
    `Manifest: ${result.manifest_path}`,
  ].join("\n");
}

// Re-exported for callers that need to verify a batch without re-reading the CLI.
export async function readIngestManifest(filePath: string): Promise<IngestBatchManifest> {
  return JSON.parse(await readFile(filePath, "utf8")) as IngestBatchManifest;
}
