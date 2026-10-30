import path from "node:path";
import { atomicWriteJson, ensureDir, pathExists, readJsonFile, readJsonl, appendJsonlMany } from "../lib/fs.js";
import { nowIso } from "../lib/time.js";
import type {
  CheckpointFile,
  CheckpointResourceState,
  NormalizedOfficialRecord,
  RecordIndexEntry,
} from "../types.js";
import { CollectorError } from "../errors.js";
import { sha256String } from "../lib/hash.js";

export class CheckpointStore {
  readonly filePath: string;
  private data: CheckpointFile;
  private loaded = false;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "state", "0311", "checkpoint.json");
    this.data = emptyCheckpoint();
  }

  async load(): Promise<CheckpointFile> {
    if (this.loaded) return this.data;
    if (await pathExists(this.filePath)) {
      const parsed = await readJsonFile<CheckpointFile>(this.filePath);
      if (parsed.checkpoint_version !== 1 || parsed.dataset !== "0311" || !parsed.resources) {
        throw new CollectorError("CHECKPOINT_INVALID", `Unsupported checkpoint file: ${this.filePath}`);
      }
      this.data = parsed;
    }
    this.loaded = true;
    return this.data;
  }

  async getResource(resourceId: string): Promise<CheckpointResourceState | null> {
    await this.load();
    return this.data.resources[resourceId] ?? null;
  }

  async setResource(resourceId: string, state: CheckpointResourceState): Promise<void> {
    await this.load();
    this.data.resources[resourceId] = state;
    this.data.updated_at = nowIso();
  }

  async save(): Promise<void> {
    await this.load();
    this.data.updated_at = nowIso();
    await ensureDir(path.dirname(this.filePath));
    await atomicWriteJson(this.filePath, this.data);
  }

  async reset(): Promise<void> {
    this.data = emptyCheckpoint();
    this.loaded = true;
    await this.save();
  }
}

export interface CompareResult {
  status: "new" | "unchanged" | "changed";
  previous: RecordIndexEntry | null;
  changed_fields: string[];
}

export class RecordIndex {
  readonly filePath: string;
  private entries = new Map<string, RecordIndexEntry>();
  private loaded = false;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "state", "0311", "records-index.jsonl");
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (await pathExists(this.filePath)) {
      for await (const entry of readJsonl<RecordIndexEntry>(this.filePath)) {
        if (entry && typeof entry.dedupe_key === "string") this.entries.set(entry.dedupe_key, entry);
      }
    }
    this.loaded = true;
  }

  get size(): number {
    return this.entries.size;
  }

  async compare(record: NormalizedOfficialRecord): Promise<CompareResult> {
    await this.load();
    const previous = this.entries.get(record.dedupe_key) ?? null;
    if (!previous) return { status: "new", previous: null, changed_fields: [] };
    if (previous.record_hash === record.record_hash) {
      return { status: "unchanged", previous, changed_fields: [] };
    }
    return { status: "changed", previous, changed_fields: changedFields(previous, record) };
  }

  async plan(record: NormalizedOfficialRecord, runId: string, at: string): Promise<{ entry: RecordIndexEntry; compare: CompareResult }> {
    const compare = await this.compare(record);
    const previous = compare.previous;
    const entry: RecordIndexEntry = {
      dedupe_key: record.dedupe_key,
      record_hash: record.record_hash,
      source_record_id: record.source_record_id,
      original_status: record.original_status,
      normalized_status: record.normalized_status,
      original_category: record.original_category,
      normalized_category: record.normalized_category,
      reported_at: record.reported_at,
      latitude: record.latitude,
      longitude: record.longitude,
      description_hash: record.description ? sha256String(record.description) : null,
      first_seen_at: previous?.first_seen_at ?? at,
      last_seen_at: at,
      seen_count: (previous?.seen_count ?? 0) + 1,
      last_run_id: runId,
      last_resource_id: record.raw_reference.resource_id,
    };
    return { entry, compare };
  }

  async commitMany(entries: readonly RecordIndexEntry[]): Promise<void> {
    await this.load();
    if (entries.length === 0) return;
    for (const entry of entries) this.entries.set(entry.dedupe_key, entry);
    await ensureDir(path.dirname(this.filePath));
    await appendJsonlMany(this.filePath, entries);
  }

  async compact(): Promise<void> {
    await this.load();
    await ensureDir(path.dirname(this.filePath));
    const temp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const lines = [...this.entries.values()].map((entry) => JSON.stringify(entry)).join("\n");
    await import("node:fs/promises").then(({ writeFile, rename }) => writeFile(temp, lines ? `${lines}\n` : "", "utf8").then(() => rename(temp, this.filePath)));
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }
}

function emptyCheckpoint(): CheckpointFile {
  return {
    checkpoint_version: 1,
    dataset: "0311",
    updated_at: nowIso(),
    resources: {},
  };
}

function changedFields(previous: RecordIndexEntry, record: NormalizedOfficialRecord): string[] {
  const fields: string[] = [];
  if (previous.original_status !== record.original_status) fields.push("original_status");
  if (previous.normalized_status !== record.normalized_status) fields.push("normalized_status");
  if (previous.original_category !== record.original_category) fields.push("original_category");
  if (previous.normalized_category !== record.normalized_category) fields.push("normalized_category");
  if (previous.reported_at !== record.reported_at) fields.push("reported_at");
  if (previous.latitude !== record.latitude) fields.push("latitude");
  if (previous.longitude !== record.longitude) fields.push("longitude");
  const descriptionHash = record.description ? sha256String(record.description) : null;
  if (previous.description_hash !== descriptionHash) fields.push("description");
  return fields;
}
