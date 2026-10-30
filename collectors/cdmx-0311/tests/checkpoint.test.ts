import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import { readJsonFile } from "../src/lib/fs.js";
import { CheckpointStore, RecordIndex } from "../src/state/checkpoint.js";
import { normalizeRecord } from "../src/normalization/record.js";
import { sha256String } from "../src/lib/hash.js";
import { BASE_HEADERS, baseValues, cleanupDir, makeContext, makeMappedRow, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

describe("checkpoint store", () => {
  it("persists and reloads resource state", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const store = new CheckpointStore(dir);
    await store.load();
    await store.setResource("r1", {
      etag: '"abc"',
      last_modified: "Wed, 01 May 2024 00:00:00 GMT",
      sha256: "a".repeat(64),
      bytes: 100,
      file_path: "raw/r1.csv",
      completed: true,
      completed_at: "2026-10-30T00:00:00.000Z",
      last_run_id: "run-1",
      rows_read: 10,
      rows_selected: 5,
      rows_rejected: 1,
    });
    await store.save();
    const reloaded = new CheckpointStore(dir);
    expect(await reloaded.getResource("r1")).toMatchObject({ etag: '"abc"', rows_selected: 5 });
    const raw = await readJsonFile<{ checkpoint_version: number }>(path.join(dir, "state", "0311", "checkpoint.json"));
    expect(raw.checkpoint_version).toBe(1);
  });

  it("resets checkpoint state explicitly", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const store = new CheckpointStore(dir);
    await store.setResource("r1", {
      etag: null, last_modified: null, sha256: null, bytes: null, file_path: null,
      completed: true, completed_at: null, last_run_id: null, rows_read: 1, rows_selected: 1, rows_rejected: 0,
    });
    await store.save();
    await store.reset();
    expect(await store.getResource("r1")).toBeNull();
  });
});

describe("record index", () => {
  function makeRecord(status = "Concluido") {
    const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues({ estatus: status }));
    return normalizeRecord(mapped, schema, makeContext()).record!;
  }

  it("classifies new, unchanged and changed records", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const index = new RecordIndex(dir);
    const record = makeRecord();
    expect((await index.plan(record, "run-1", "2026-10-30T00:00:00.000Z")).compare.status).toBe("new");
    const planned = await index.plan(record, "run-1", "2026-10-30T00:00:00.000Z");
    await index.commitMany([planned.entry]);
    expect((await index.plan(record, "run-2", "2026-10-31T00:00:00.000Z")).compare.status).toBe("unchanged");
    const changed = { ...record, original_status: "En proceso", normalized_status: "in_progress" as const, record_hash: sha256String("changed") };
    const changedPlan = await index.plan(changed, "run-2", "2026-10-31T00:00:00.000Z");
    expect(changedPlan.compare.status).toBe("changed");
    expect(changedPlan.compare.changed_fields).toContain("original_status");
    expect(changedPlan.entry.seen_count).toBe(2);
  });

  it("compacts the append-only index to the latest state", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const index = new RecordIndex(dir);
    const record = makeRecord();
    const first = await index.plan(record, "run-1", "2026-10-30T00:00:00.000Z");
    await index.commitMany([first.entry]);
    const second = await index.plan(record, "run-2", "2026-10-31T00:00:00.000Z");
    await index.commitMany([second.entry]);
    await index.compact();
    const reloaded = new RecordIndex(dir);
    await reloaded.load();
    expect(reloaded.size).toBe(1);
    expect((await reloaded.plan(record, "run-3", "2026-11-01T00:00:00.000Z")).entry.seen_count).toBe(3);
  });
});
