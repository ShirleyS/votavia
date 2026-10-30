import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat, rename } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import type { Logger } from "../lib/log.js";
import type { CollectorConfig } from "../config.js";
import { HttpClient } from "../lib/http.js";
import { atomicWriteJson, countFileLines, createJsonlWriter, ensureDir, pathExists, readJsonFile, removeIfExists } from "../lib/fs.js";
import { sha256File } from "../lib/hash.js";
import { newRunId, nowIso } from "../lib/time.js";
import { CsvParseError, CollectorError, errorMessage } from "../errors.js";
import { openCsvFromFile } from "../parsers/csv.js";
import { inspectSchema, mapRow, type CsvSchema } from "../parsers/schema.js";
import { normalizeRecord } from "../normalization/record.js";
import { stringifyCell } from "../normalization/json.js";
import type {
  CsvSchemaSummary,
  DatasetDescriptor,
  ImportCounters,
  NormalizedOfficialRecord,
  NormalizeContext,
  RecordIndexEntry,
  ResourceDescriptor,
  ResourceRunSummary,
  RunManifest,
} from "../types.js";
import { emptyCounters } from "../types.js";
import { fetchCkanDataset, fetchDatastoreBatches, parseCkanPackage, selectResources, type CkanSnapshot } from "../adapters/ckan.js";
import { downloadToFile } from "../adapters/download.js";
import { CheckpointStore, RecordIndex } from "../state/checkpoint.js";
import { createManifest, finalizeManifest, licenseStatusFor, writeManifest } from "../provenance/manifest.js";

export interface CsvFixture {
  path: string;
  year?: number | null;
  resource_id?: string;
  name?: string;
}

export interface ImportOptions {
  config: CollectorConfig;
  logger: Logger;
  years?: readonly number[];
  limit?: number | null;
  maxRecords?: number | null;
  force?: boolean;
  dryRun?: boolean;
  continueOnError?: boolean;
  ckanFixture?: string;
  fixtureDir?: string;
  csvFixtures?: readonly CsvFixture[];
  clock?: () => Date;
  client?: HttpClient;
}

export interface ImportResult {
  run_id: string;
  manifest: RunManifest;
  records_path: string | null;
  changes_path: string | null;
  rejected_path: string | null;
  manifest_path: string | null;
}

interface ResourceFile {
  kind: "file" | "datastore" | "not_modified" | "fixture_missing";
  path?: string;
  sha256?: string | null;
  bytes?: number | null;
  etag?: string | null;
  lastModified?: string | null;
}

interface LimitState {
  remaining: number;
}

interface ProcessResult {
  counts: ImportCounters;
  schema: CsvSchema;
  records_temp: string;
  rejected_temp: string;
  changes_temp: string;
  pending_entries: RecordIndexEntry[];
  warnings: string[];
  limit_reached: boolean;
}

export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const clock = options.clock ?? (() => new Date());
  const runId = newRunId(clock);
  const startedAt = nowIso(clock);
  const collectedAt = startedAt;
  const baseDir = options.config.dataDir;
  const normalizedDir = path.join(baseDir, "normalized", "0311", runId);
  const tempDir = path.join(baseDir, "state", "0311", "tmp", runId);
  if (!options.dryRun) await ensureDir(normalizedDir);
  await ensureDir(tempDir);

  const dataset = await resolveDataset(options);
  const selected = selectResources(dataset, { years: options.years });
  if (selected.length === 0) {
    throw new CollectorError("CKAN_NO_RESOURCES", "No historical 0311 resources matched the requested years", {
      details: { years: options.years ?? null },
    });
  }
  const licenseStatus = licenseStatusFor(dataset);
  const declaredLicense = dataset.license_id?.trim() ?? "";
  const sourceLicense = !declaredLicense || declaredLicense.toLowerCase() === "notspecified" ? "unverified" : declaredLicense;
  const licenseVerifiedFrom = licenseStatus === "verified" ? "ckan_metadata" : "unverified";
  const manifest = createManifest({
    command: "import",
    runId,
    startedAt,
    dataset,
    filters: {
      alcaldia: options.config.allAlcaldias ? null : options.config.alcaldia,
      include_missing_alcaldia: options.config.includeMissingAlcaldia,
      infrastructure_only: options.config.infrastructureOnly,
      years: options.years ?? null,
      limit: options.limit ?? null,
      max_records_per_resource: options.maxRecords ?? options.config.maxRecordsPerResource,
    },
    options: {
      force: Boolean(options.force),
      dry_run: Boolean(options.dryRun),
      continue_on_error: Boolean(options.continueOnError),
      fixture_dir: options.fixtureDir ?? null,
      ckan_fixture: options.ckanFixture ?? null,
    },
    attribution: dataset.attribution,
    licenseStatus,
  });
  if (options.dryRun) manifest.warnings.push("dry_run: normalized files and checkpoints were not persisted");

  const ckanSnapshotPath = path.join(baseDir, "manifests", "0311", `${runId}-ckan.json`);
  await atomicWriteJson(ckanSnapshotPath, { dataset, selected_resources: selected, license_status: licenseStatus });
  const resourcesSnapshotPath = path.join(baseDir, "manifests", "0311", "resources.json");
  await atomicWriteJson(resourcesSnapshotPath, {
    dataset: dataset.name,
    dataset_id: dataset.id,
    license_id: dataset.license_id,
    updated_at: startedAt,
    resources: selected,
  });

  const checkpoint = new CheckpointStore(baseDir);
  const index = new RecordIndex(baseDir);
  await checkpoint.load();
  await index.load();
  const seenThisRun = new Map<string, string>();
  const limitState: LimitState = { remaining: options.limit && options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY };
  const completedRecordFiles: string[] = [];
  const completedRejectedFiles: string[] = [];
  const completedChangeFiles: string[] = [];

  for (const resource of selected) {
    const summary = emptyResourceSummary(resource);
    try {
      const file = await resolveResourceFile(resource, options);
      if (file.kind === "fixture_missing") {
        summary.skipped = true;
        summary.skip_reason = "fixture_not_found";
        summary.warnings.push(`No local fixture found for ${resource.year ?? resource.name}`);
        manifest.resources.push(summary);
        manifest.warnings.push(...summary.warnings);
        continue;
      }
      if (file.kind === "not_modified") {
        summary.skipped = true;
        summary.skip_reason = "http_304_not_modified";
        summary.warnings.push("Resource was not modified since the last checkpoint.");
        manifest.resources.push(summary);
        continue;
      }

      if (file.kind === "datastore") {
        const result = await processDatastoreResource(resource, {
          options,
          runId,
          collectedAt,
          sourceLicense,
          licenseVerifiedFrom,
          index,
          seenThisRun,
          limitState,
          tempDir,
        });
        applyProcessResult(summary, result);
        if (!options.dryRun) {
          const finalRecords = path.join(normalizedDir, "resources", `${safeResourceId(resource)}.jsonl`);
          await ensureDir(path.dirname(finalRecords));
          if (await pathExists(result.records_temp)) await rename(result.records_temp, finalRecords);
          if (await pathExists(result.rejected_temp)) await rename(result.rejected_temp, finalRejectedPath(normalizedDir, resource));
          if (await pathExists(result.changes_temp)) await rename(result.changes_temp, finalChangesPath(normalizedDir, resource));
          if (await pathExists(finalRecords)) completedRecordFiles.push(finalRecords);
          if (await pathExists(finalRejectedPath(normalizedDir, resource))) completedRejectedFiles.push(finalRejectedPath(normalizedDir, resource));
          if (await pathExists(finalChangesPath(normalizedDir, resource))) completedChangeFiles.push(finalChangesPath(normalizedDir, resource));
          await index.commitMany(result.pending_entries);
          await checkpoint.setResource(resource.id, {
            etag: null,
            last_modified: null,
            sha256: null,
            bytes: null,
            file_path: null,
            completed: true,
            completed_at: nowIso(clock),
            last_run_id: runId,
            rows_read: result.counts.rows_read,
            rows_selected: result.counts.rows_selected,
            rows_rejected: result.counts.rows_rejected,
          });
          await checkpoint.save();
        }
        manifest.resources.push(summary);
        continue;
      }

      if (!file.path) throw new CollectorError("DOWNLOAD_FAILED", `No file path for resource ${resource.id}`);
      const schemaResult = await processCsvResource(file.path, resource, {
        options,
        runId,
        collectedAt,
        sourceLicense,
        licenseVerifiedFrom,
        index,
        seenThisRun,
        limitState,
        tempDir,
      });
      applyProcessResult(summary, schemaResult);
      summary.file_path = file.path;
      summary.sha256 = file.sha256 ?? null;
      summary.bytes = file.bytes ?? null;

      if (!options.dryRun) {
        const finalRecords = path.join(normalizedDir, "resources", `${safeResourceId(resource)}.jsonl`);
        const finalRejected = finalRejectedPath(normalizedDir, resource);
        const finalChanges = finalChangesPath(normalizedDir, resource);
        await ensureDir(path.dirname(finalRecords));
        if (await pathExists(schemaResult.records_temp)) await rename(schemaResult.records_temp, finalRecords);
        if (await pathExists(schemaResult.rejected_temp)) await rename(schemaResult.rejected_temp, finalRejected);
        if (await pathExists(schemaResult.changes_temp)) await rename(schemaResult.changes_temp, finalChanges);
        if (await pathExists(finalRecords)) completedRecordFiles.push(finalRecords);
        if (await pathExists(finalRejected)) completedRejectedFiles.push(finalRejected);
        if (await pathExists(finalChanges)) completedChangeFiles.push(finalChanges);
        await index.commitMany(schemaResult.pending_entries);
        await checkpoint.setResource(resource.id, {
          etag: file.etag ?? null,
          last_modified: file.lastModified ?? null,
          sha256: file.sha256 ?? null,
          bytes: file.bytes ?? null,
          file_path: file.path,
          completed: true,
          completed_at: nowIso(clock),
          last_run_id: runId,
          rows_read: schemaResult.counts.rows_read,
          rows_selected: schemaResult.counts.rows_selected,
          rows_rejected: schemaResult.counts.rows_rejected,
        });
        await checkpoint.save();
      }
      manifest.resources.push(summary);
    } catch (error) {
      const message = errorMessage(error);
      summary.errors.push(message);
      summary.warnings.push(...(error instanceof CollectorError && error.details ? [`details: ${JSON.stringify(error.details)}`] : []));
      manifest.errors.push(`${resource.id}: ${message}`);
      manifest.resources.push(summary);
      if (!options.continueOnError) {
        manifest.status = "failed";
        break;
      }
    }
  }

  let recordsPath: string | null = null;
  let changesPath: string | null = null;
  let rejectedPath: string | null = null;
  if (!options.dryRun) {
    recordsPath = path.join(normalizedDir, "records.jsonl");
    changesPath = path.join(normalizedDir, "changes.jsonl");
    rejectedPath = path.join(normalizedDir, "rejected.jsonl");
    await concatFiles(completedRecordFiles, recordsPath);
    await concatFiles(completedChangeFiles, changesPath);
    await concatFiles(completedRejectedFiles, rejectedPath);
    await index.compact();
  }

  const status: RunManifest["status"] = manifest.status === "failed"
    ? completedRecordFiles.length > 0 ? "partial" : "failed"
    : manifest.errors.length > 0 ? "partial" : "completed";
  const outputs = {
    records_jsonl: recordsPath,
    changes_jsonl: changesPath,
    rejected_jsonl: rejectedPath,
    ckan_snapshot: ckanSnapshotPath,
    resources_snapshot: resourcesSnapshotPath,
    normalized_dir: options.dryRun ? null : normalizedDir,
  };
  const finalized = finalizeManifest(manifest, {
    finishedAt: nowIso(clock),
    status,
    outputs,
  });
  const manifestPath = options.dryRun ? null : await writeManifest(baseDir, finalized);
  await removeDirIfEmpty(tempDir);

  return {
    run_id: runId,
    manifest: finalized,
    records_path: recordsPath,
    changes_path: changesPath,
    rejected_path: rejectedPath,
    manifest_path: manifestPath,
  };
}

async function resolveDataset(options: ImportOptions): Promise<DatasetDescriptor> {
  if (options.ckanFixture) {
    const payload = await readJsonFile<unknown>(options.ckanFixture);
    return parseCkanPackage(payload, { baseUrl: options.config.ckanBaseUrl, datasetName: options.config.ckanDatasetId });
  }
  if (options.fixtureDir) {
    const packagePath = path.join(options.fixtureDir, "package.json");
    if (await pathExists(packagePath)) {
      const payload = await readJsonFile<unknown>(packagePath);
      return parseCkanPackage(payload, { baseUrl: options.config.ckanBaseUrl, datasetName: options.config.ckanDatasetId });
    }
    if (options.csvFixtures?.length) return syntheticDataset(options.csvFixtures);
    const files = (await readdir(options.fixtureDir)).filter((file) => /\.(csv|tsv|json)$/i.test(file));
    if (files.length > 0) {
      return syntheticDataset(files.map((file) => ({
        path: path.join(options.fixtureDir as string, file),
        year: yearFromFilename(file),
        name: file,
      })));
    }
  }
  if (options.csvFixtures?.length) return syntheticDataset(options.csvFixtures);
  const client = options.client ?? new HttpClient(options.config.request);
  const snapshot: CkanSnapshot = await fetchCkanDataset({
    client,
    baseUrl: options.config.ckanBaseUrl,
    apiPath: options.config.ckanApiPath,
    datasetId: options.config.ckanDatasetId,
    datasetUuid: options.config.ckanDatasetUuid,
  });
  return snapshot.dataset;
}

function yearFromFilename(file: string): number | null {
  const match = /(?:19|20)\d{2}/.exec(file);
  return match ? Number(match[0]) : null;
}

function syntheticDataset(fixtures: readonly CsvFixture[]): DatasetDescriptor {
  return {
    id: "0311",
    name: "0311",
    title: "Solicitudes *0311 (local fixtures)",
    organization: "Local fixture",
    license_id: "unverified",
    license_title: null,
    license_url: null,
    metadata_modified: null,
    resources: fixtures.map((fixture, index) => ({
      id: fixture.resource_id ?? `fixture-${index + 1}`,
      name: fixture.name ?? path.basename(fixture.path),
      format: path.extname(fixture.path).replace(".", "").toUpperCase() || "CSV",
      page_url: `fixture:${fixture.path}`,
      download_url: null,
      year: fixture.year ?? null,
      year_source: "name",
      datastore_active: false,
      created: null,
      last_modified: null,
      size_bytes: null,
      description: null,
      alternatives: [],
    })),
    attribution: "Local fixture — not an official government download.",
  };
}

async function resolveResourceFile(resource: ResourceDescriptor, options: ImportOptions): Promise<ResourceFile> {
  if (options.fixtureDir || options.csvFixtures) {
    const fixturePath = await findFixture(resource, options);
    if (!fixturePath) return { kind: "fixture_missing" };
    const fileStat = await stat(fixturePath);
    const sha = await sha256File(fixturePath);
    const checkpoint = new CheckpointStore(options.config.dataDir);
    const state = await checkpoint.getResource(resource.id);
    if (!options.force && state?.completed && state.sha256 === sha) {
      return { kind: "not_modified", path: fixturePath, sha256: sha, bytes: fileStat.size };
    }
    return { kind: "file", path: fixturePath, sha256: sha, bytes: fileStat.size, etag: null, lastModified: null };
  }

  if (!resource.download_url && resource.datastore_active) return { kind: "datastore" };
  if (!resource.download_url) {
    throw new CollectorError("DOWNLOAD_FAILED", `Resource ${resource.id} has neither a download URL nor an active datastore`);
  }
  const client = options.client ?? new HttpClient(options.config.request);
  const checkpoint = new CheckpointStore(options.config.dataDir);
  const state = await checkpoint.getResource(resource.id);
  const destination = path.join(
    options.config.dataDir,
    "raw",
    "0311",
    resource.year === null ? "unknown" : String(resource.year),
    safeFilenameWithExtension(resource),
  );
  const result = await downloadToFile({
    client,
    url: resource.download_url,
    destination,
    etag: options.force ? null : state?.etag,
    lastModified: options.force ? null : state?.last_modified,
    maxBytes: options.config.request.maxBytes,
  });
  if (result.status === "not_modified") {
    return { kind: "not_modified", path: state?.file_path ?? destination, sha256: state?.sha256 ?? null, bytes: state?.bytes ?? null };
  }
  return {
    kind: "file",
    path: result.path,
    sha256: result.sha256 ?? undefined,
    bytes: result.bytes ?? undefined,
    etag: result.etag,
    lastModified: result.lastModified,
  };
}

async function findFixture(resource: ResourceDescriptor, options: ImportOptions): Promise<string | null> {
  const candidates = options.csvFixtures?.slice() ?? [];
  for (const fixture of candidates) {
    if (resource.year !== null && fixture.year !== undefined && fixture.year !== null && fixture.year !== resource.year) continue;
    if (resource.year !== null && fixture.year === undefined && !path.basename(fixture.path).includes(String(resource.year))) continue;
    if (await pathExists(fixture.path)) return fixture.path;
  }
  if (options.fixtureDir) {
    const files = (await readdir(options.fixtureDir)).filter((file) => /\.(csv|tsv|json)$/i.test(file));
    const year = resource.year === null ? null : String(resource.year);
    const matching = files.filter((file) => (year ? file.includes(year) : true));
    if (matching.length === 1) return path.join(options.fixtureDir, matching[0] as string);
    if (matching.length > 1) {
      const exact = matching.find((file) => file.toLowerCase().includes("cuauhtemoc"));
      return path.join(options.fixtureDir, exact ?? (matching[0] as string));
    }
    if (files.length === 1) return path.join(options.fixtureDir, files[0] as string);
  }
  return null;
}

interface ProcessOptions {
  options: ImportOptions;
  runId: string;
  collectedAt: string;
  sourceLicense: string;
  licenseVerifiedFrom: "ckan_metadata" | "dataset_page" | "unverified";
  index: RecordIndex;
  seenThisRun: Map<string, string>;
  limitState: LimitState;
  tempDir: string;
}

async function processCsvResource(
  filePath: string,
  resource: ResourceDescriptor,
  processOptions: ProcessOptions,
): Promise<ProcessResult> {
  const reader = await openCsvFromFile(filePath);
  const schema = inspectSchema(reader.headers, { delimiter: reader.delimiter, encoding: reader.encoding });
  const contextBase: Omit<NormalizeContext, "rowNumber"> = {
    sourceUrl: resource.page_url,
    sourceLicense: processOptions.sourceLicense,
    sourceLicenseVerifiedFrom: processOptions.licenseVerifiedFrom,
    extractionMethod: "ckan_csv",
    collectedAt: processOptions.collectedAt,
    resourceId: resource.id,
    resourceName: resource.name,
    resourceYear: resource.year,
    fileName: path.basename(filePath),
    allAlcaldias: processOptions.options.config.allAlcaldias,
    targetAlcaldia: processOptions.options.config.alcaldia,
    includeMissingAlcaldia: processOptions.options.config.includeMissingAlcaldia,
    infrastructureOnly: processOptions.options.config.infrastructureOnly,
  };
  return processRows(reader.rows, schema, resource, processOptions, contextBase);
}

async function processDatastoreResource(
  resource: ResourceDescriptor,
  processOptions: ProcessOptions,
): Promise<ProcessResult> {
  const client = processOptions.options.client ?? new HttpClient(processOptions.options.config.request);
  const iterator = fetchDatastoreBatches({
    client,
    baseUrl: processOptions.options.config.ckanBaseUrl,
    apiPath: processOptions.options.config.ckanApiPath,
    resourceId: resource.id,
    maxRecords: processOptions.options.maxRecords ?? processOptions.options.config.maxRecordsPerResource,
    allowPartial: false,
  });
  const first = await iterator.next();
  if (first.done || first.value.records.length === 0) {
    throw new CollectorError("CKAN_NO_RESOURCES", `Datastore resource ${resource.id} returned no records`);
  }
  const headers = first.value.fields.map((field) => field.id);
  if (headers.length === 0) {
    throw new CollectorError("SCHEMA_INVALID", `Datastore resource ${resource.id} returned no field metadata`);
  }
  const schema = inspectSchema(headers);
  const rows = (async function* () {
    yield* rowsFromBatch(first.value.records, headers, 1);
    let rowNumber = first.value.records.length + 1;
    for await (const batch of iterator) {
      yield* rowsFromBatch(batch.records, headers, rowNumber);
      rowNumber += batch.records.length;
    }
  })();
  const contextBase: Omit<NormalizeContext, "rowNumber"> = {
    sourceUrl: resource.page_url,
    sourceLicense: processOptions.sourceLicense,
    sourceLicenseVerifiedFrom: processOptions.licenseVerifiedFrom,
    extractionMethod: "ckan_datastore",
    collectedAt: processOptions.collectedAt,
    resourceId: resource.id,
    resourceName: resource.name,
    resourceYear: resource.year,
    fileName: null,
    allAlcaldias: processOptions.options.config.allAlcaldias,
    targetAlcaldia: processOptions.options.config.alcaldia,
    includeMissingAlcaldia: processOptions.options.config.includeMissingAlcaldia,
    infrastructureOnly: processOptions.options.config.infrastructureOnly,
  };
  return processRows(rows, schema, resource, processOptions, contextBase);
}

async function* rowsFromBatch(
  records: readonly Record<string, unknown>[],
  headers: readonly string[],
  startingRow: number,
): AsyncGenerator<{ row_number: number; values: string[] }> {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as Record<string, unknown>;
    yield {
      row_number: startingRow + index,
      values: headers.map((header) => stringifyCell(record[header])),
    };
  }
}

async function processRows(
  rows: AsyncIterable<{ row_number: number; values: string[] }>,
  schema: CsvSchema,
  resource: ResourceDescriptor,
  processOptions: ProcessOptions,
  contextBase: Omit<NormalizeContext, "rowNumber">,
): Promise<ProcessResult> {
  if (schema.missing_required.includes("alcaldia") && !processOptions.options.config.allAlcaldias && !processOptions.options.config.includeMissingAlcaldia) {
    throw new CollectorError("SCHEMA_INVALID", `Missing alcaldía column in ${resource.name}; cannot apply the Cuauhtémoc filter`, {
      details: { headers: schema.headers, missing: schema.missing_required },
    });
  }
  const counts = emptyCounters();
  const warnings: string[] = [];
  const pendingEntries: RecordIndexEntry[] = [];
  const recordsTemp = path.join(processOptions.tempDir, `${safeResourceId(resource)}.records.jsonl`);
  const rejectedTemp = path.join(processOptions.tempDir, `${safeResourceId(resource)}.rejected.jsonl`);
  const changesTemp = path.join(processOptions.tempDir, `${safeResourceId(resource)}.changes.jsonl`);
  await removeIfExists(recordsTemp);
  await removeIfExists(rejectedTemp);
  await removeIfExists(changesTemp);
  let rowsSinceResourceMax = 0;
  let limitReached = false;
  const maxRecords = processOptions.options.maxRecords ?? processOptions.options.config.maxRecordsPerResource;
  const recordsWriter = createJsonlWriter(recordsTemp);
  const rejectedWriter = createJsonlWriter(rejectedTemp);
  const changesWriter = createJsonlWriter(changesTemp);

  try {
    for await (const row of rows) {
      if (processOptions.limitState.remaining <= 0) {
        limitReached = true;
        warnings.push("global_limit_reached");
        break;
      }
      if (maxRecords !== null && rowsSinceResourceMax >= maxRecords) {
        limitReached = true;
        warnings.push("resource_max_records_reached");
        break;
      }
      counts.rows_read += 1;
      const mapped = mapRow(row, schema);
      const result = normalizeRecord(mapped, schema, { ...contextBase, rowNumber: row.row_number });
      counts.pii_redactions += result.piiRedactions;
      counts.pii_columns_excluded = Math.max(counts.pii_columns_excluded, result.piiColumnsExcluded);
      if (result.filteredOut) {
        counts.rows_filtered_out += 1;
        continue;
      }
      if (result.rejected || !result.record) {
        counts.rows_rejected += 1;
        await rejectedWriter.write({
          row_number: row.row_number,
          errors: result.errors,
          warnings: result.warnings,
          flags: result.flags,
        });
        continue;
      }
      const record = result.record;
      const priorHash = processOptions.seenThisRun.get(record.dedupe_key);
      if (priorHash !== undefined) {
        if (priorHash === record.record_hash) {
          counts.duplicates_suppressed += 1;
        } else {
          counts.duplicates_conflicting += 1;
          await rejectedWriter.write({
            row_number: row.row_number,
            errors: ["duplicate_key_different_content"],
            warnings: ["The later duplicate was not written; review the source resource for conflicting versions."],
            flags: ["duplicate_conflict"],
            existing_hash: priorHash,
            incoming_hash: record.record_hash,
            dedupe_key: record.dedupe_key,
          });
        }
        continue;
      }
      processOptions.seenThisRun.set(record.dedupe_key, record.record_hash);
      const planned = await processOptions.index.plan(record, processOptions.runId, processOptions.collectedAt);
      if (planned.compare.status === "new") counts.new_records += 1;
      else if (planned.compare.status === "unchanged") counts.unchanged_records += 1;
      else counts.changed_records += 1;
      if (record.data_quality_flags.includes("missing_coordinates")) counts.missing_coordinates += 1;
      if (record.data_quality_flags.includes("invalid_coordinates")) counts.invalid_coordinates += 1;
      if (record.data_quality_flags.includes("missing_date")) counts.missing_dates += 1;
      await recordsWriter.write(record);
      if (planned.compare.status !== "unchanged") {
        await changesWriter.write({
          change_type: planned.compare.status === "new" ? "new" : "updated",
          dedupe_key: record.dedupe_key,
          source_record_id: record.source_record_id,
          run_id: processOptions.runId,
          detected_at: processOptions.collectedAt,
          changed_fields: planned.compare.changed_fields,
          before: planned.compare.previous,
          after: planned.entry,
        });
      }
      pendingEntries.push(planned.entry);
      counts.rows_selected += 1;
      rowsSinceResourceMax += 1;
      if (Number.isFinite(processOptions.limitState.remaining)) processOptions.limitState.remaining -= 1;
    }
  } finally {
    await Promise.all([recordsWriter.close(), rejectedWriter.close(), changesWriter.close()]);
  }

  return { counts, schema, records_temp: recordsTemp, rejected_temp: rejectedTemp, changes_temp: changesTemp, pending_entries: pendingEntries, warnings, limit_reached: limitReached };
}

function applyProcessResult(summary: ResourceRunSummary, result: ProcessResult): void {
  Object.assign(summary, result.counts);
  summary.schema = schemaSummary(result.schema);
  summary.warnings.push(...result.warnings);
}

function schemaSummary(schema: CsvSchema): CsvSchemaSummary {
  const mapping: Record<string, string | null> = {};
  for (const [field, value] of Object.entries(schema.mappings)) mapping[field] = value.header;
  return {
    headers: schema.headers,
    canonical_headers: schema.canonical_headers,
    mapping,
    missing_required: schema.missing_required,
    duplicate_headers: schema.duplicate_headers,
    pii_columns_excluded: schema.pii_columns_excluded,
    delimiter: schema.delimiter,
    encoding: schema.encoding,
  };
}

function emptyResourceSummary(resource: ResourceDescriptor): ResourceRunSummary {
  return {
    resource_id: resource.id,
    resource_name: resource.name,
    resource_year: resource.year,
    source_url: resource.page_url,
    file_path: null,
    sha256: null,
    bytes: null,
    schema: null,
    skipped: false,
    skip_reason: null,
    errors: [],
    warnings: [],
    ...emptyCounters(),
  };
}

async function concatFiles(files: readonly string[], destination: string): Promise<void> {
  await ensureDir(path.dirname(destination));
  const temp = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const output = createWriteStream(temp, { flags: "w" });
  try {
    for (const file of files) {
      if (!(await pathExists(file))) continue;
      for await (const chunk of createReadStream(file)) {
        if (!output.write(chunk)) await once(output, "drain");
      }
    }
    output.end();
    await once(output, "finish");
    await rename(temp, destination);
  } catch (error) {
    output.destroy();
    await removeIfExists(temp);
    throw error;
  }
}

function finalRejectedPath(normalizedDir: string, resource: ResourceDescriptor): string {
  return path.join(normalizedDir, "resources", `${safeResourceId(resource)}.rejected.jsonl`);
}

function finalChangesPath(normalizedDir: string, resource: ResourceDescriptor): string {
  return path.join(normalizedDir, "resources", `${safeResourceId(resource)}.changes.jsonl`);
}

function safeResourceId(resource: ResourceDescriptor): string {
  return `${resource.year ?? "unknown"}-${resource.id}`.replace(/[^\w.-]+/g, "_");
}

function safeFilenameWithExtension(resource: ResourceDescriptor): string {
  const base = resource.name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 120) || resource.id;
  if (/\.(csv|tsv|json|zip|gz)$/i.test(base)) return base;
  const extension = resource.format === "TSV" ? "tsv" : resource.format === "JSON" ? "json" : "csv";
  return `${base}.${extension}`;
}

async function removeDirIfEmpty(dir: string): Promise<void> {
  try {
    const entries = await readdir(dir);
    if (entries.length === 0) await import("node:fs/promises").then(({ rmdir }) => rmdir(dir));
  } catch {
    // A leftover temp directory is harmless and preserves evidence for review.
  }
}

export function summarizeImport(result: ImportResult): string {
  const totals = result.manifest.totals;
  const lines = [
    `Run ${result.run_id}: ${result.manifest.status}`,
    `Rows read: ${totals.rows_read}; selected: ${totals.rows_selected}; rejected: ${totals.rows_rejected}; filtered out: ${totals.rows_filtered_out}`,
    `New: ${totals.new_records}; unchanged: ${totals.unchanged_records}; changed: ${totals.changed_records}`,
    `Duplicates suppressed: ${totals.duplicates_suppressed}; conflicts: ${totals.duplicates_conflicting}`,
    `Missing coordinates: ${totals.missing_coordinates}; invalid coordinates: ${totals.invalid_coordinates}; missing dates: ${totals.missing_dates}`,
    `PII redactions: ${totals.pii_redactions}; PII columns excluded: ${totals.pii_columns_excluded}`,
    `License: ${result.manifest.dataset?.license_id ?? "unverified"} (${result.manifest.license_status})`,
  ];
  if (result.records_path) lines.push(`Records: ${result.records_path}`);
  if (result.manifest_path) lines.push(`Manifest: ${result.manifest_path}`);
  if (result.manifest.errors.length > 0) lines.push(`Errors: ${result.manifest.errors.join(" | ")}`);
  return lines.join("\n");
}

// Keep CsvParseError imported for callers that map parser failures to user help.
export const CSV_ERROR_CODE = CsvParseError.name;
