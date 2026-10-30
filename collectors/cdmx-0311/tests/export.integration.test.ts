import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/log.js";
import { readJsonl } from "../src/lib/fs.js";
import { runImport } from "../src/commands/import.js";
import { runExport } from "../src/commands/export.js";
import type { OfficialRecordIngestInput } from "../src/ingest-contract.js";
import { cleanupDir, fixturePath, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

const logger = createLogger({ level: "error", sink: () => undefined });

function testConfig(dataDir: string) {
  return loadConfig({ dataDir, minIntervalMs: 0, retries: 0, timeoutMs: 2_000 });
}

async function importFixtures(dataDir: string) {
  return runImport({
    config: testConfig(dataDir),
    logger,
    ckanFixture: fixturePath("ckan-package-0311.json"),
    fixtureDir: fixturePath("csv"),
    years: [2022, 2023, 2024],
  });
}

describe("ingestion export", () => {
  it("emits a valid ingestion batch for the shared contract", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    await importFixtures(dir);
    const result = await runExport({ config: testConfig(dir), logger });

    expect(result.manifest.contract_version).toBe("1.0.0");
    expect(result.manifest.source_system).toBe("cdmx_0311");
    expect(result.manifest.upsert_key).toEqual(["source_system", "source_record_id"]);
    expect(result.manifest.license.redistribution).toBe("allowed");
    expect(result.manifest.counts.created).toBe(10);

    const records: OfficialRecordIngestInput[] = [];
    for await (const record of readJsonl<OfficialRecordIngestInput>(result.records_path)) records.push(record);
    expect(records).toHaveLength(10);
    expect(new Set(records.map((record) => record.source_record_id)).size).toBe(10);
    for (const record of records) {
      expect(record.source_system).toBe("cdmx_0311");
      expect(record.source_record_id.length).toBeGreaterThan(0);
      expect(record.content_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.is_active).toBe(true);
      expect(record.source_url).toContain("/dataset/0311/resource/");
      expect(record.attribution).toContain("Gobierno de la Ciudad de México");
    }
  });

  it("is byte-identical across repeated exports of the same run", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    await importFixtures(dir);
    const first = await runExport({ config: testConfig(dir), logger, outDir: path.join(dir, "ingest-a") });
    const second = await runExport({ config: testConfig(dir), logger, outDir: path.join(dir, "ingest-b") });

    const firstBytes = await readFile(first.records_path, "utf8");
    const secondBytes = await readFile(second.records_path, "utf8");
    expect(secondBytes).toBe(firstBytes);
    expect(second.idempotency_key).toBe(first.idempotency_key);
  });

  it("is semantically idempotent after a no-op reimport", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    await importFixtures(dir);
    const first = await runExport({ config: testConfig(dir), logger, outDir: path.join(dir, "ingest-a") });

    // Re-import forces a re-read; the record index should mark everything unchanged.
    await runImport({
      config: testConfig(dir),
      logger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir: fixturePath("csv"),
      years: [2022, 2023, 2024],
      force: true,
    });
    const second = await runExport({ config: testConfig(dir), logger, outDir: path.join(dir, "ingest-b") });

    expect(second.manifest.counts.records).toBe(first.manifest.counts.records);
    expect(second.manifest.counts.unchanged).toBe(10);
    expect(second.manifest.counts.created).toBe(0);
    expect(second.manifest.counts.updated).toBe(0);

    // A new import refreshes collected_at, so bytes legitimately differ; the
    // upsert-relevant identity and content hash must not.
    expect(second.idempotency_key).toBe(first.idempotency_key);
    const hashes = async (file: string) => {
      const out = new Map<string, string | null | undefined>();
      for await (const record of readJsonl<OfficialRecordIngestInput>(file)) {
        out.set(record.source_record_id, record.content_hash);
      }
      return out;
    };
    expect(await hashes(second.records_path)).toEqual(await hashes(first.records_path));
  });

  it("emits status observations only for first-seen and changed records", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    await importFixtures(dir);
    const result = await runExport({ config: testConfig(dir), logger, outDir: path.join(dir, "ingest") });
    // First export: every record has a government status, so one initial observation each.
    expect(result.manifest.counts.status_observations).toBe(10);
  });

  it("keeps records active when a later batch omits them", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    await importFixtures(dir);

    // A later batch covering only 2023 is a subset: absence from it is not deletion.
    await runImport({
      config: testConfig(dir),
      logger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir: fixturePath("csv"),
      years: [2023],
      force: true,
    });
    const subset = await runExport({ config: testConfig(dir), logger, outDir: path.join(dir, "ingest-subset") });
    expect(subset.manifest.counts.records).toBe(1);
    expect(subset.manifest.deletion_policy).toContain("NOT deleted");

    const records: OfficialRecordIngestInput[] = [];
    for await (const record of readJsonl<OfficialRecordIngestInput>(subset.records_path)) records.push(record);
    expect(records.every((record) => record.is_active === true)).toBe(true);
  });
});
