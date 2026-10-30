import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/log.js";
import { readJsonl, pathExists } from "../src/lib/fs.js";
import { runImport } from "../src/commands/import.js";
import type { NormalizedOfficialRecord } from "../src/types.js";
import { cleanupDir, fixturePath, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

const silentLogger = createLogger({ level: "error", sink: () => undefined });

function testConfig(dataDir: string) {
  return loadConfig({ dataDir, minIntervalMs: 0, retries: 0, timeoutMs: 2_000 });
}

describe("fixture import pipeline", () => {
  it("imports Cuauhtémoc records with provenance, dedupe and PII removal", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const result = await runImport({
      config: testConfig(dir),
      logger: silentLogger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir: fixturePath("csv"),
      years: [2022, 2023, 2024],
    });
    expect(result.manifest.status).toBe("completed");
    expect(result.manifest.license_status).toBe("verified");
    expect(result.manifest.totals.rows_read).toBe(14);
    expect(result.manifest.totals.rows_selected).toBe(10);
    expect(result.manifest.totals.rows_rejected).toBe(1);
    expect(result.manifest.totals.rows_filtered_out).toBe(1);
    expect(result.manifest.totals.duplicates_suppressed).toBe(1);
    expect(result.manifest.totals.duplicates_conflicting).toBe(1);
    expect(result.manifest.totals.missing_coordinates).toBe(1);
    expect(result.manifest.totals.invalid_coordinates).toBe(1);
    expect(result.manifest.totals.missing_dates).toBe(1);
    expect(result.manifest.totals.pii_redactions).toBe(2);
    expect(result.manifest.totals.pii_columns_excluded).toBe(2);
    expect(result.manifest.resources).toHaveLength(3);
    expect(result.records_path).not.toBeNull();

    const records: NormalizedOfficialRecord[] = [];
    for await (const record of readJsonl<NormalizedOfficialRecord>(result.records_path!)) records.push(record);
    expect(records).toHaveLength(10);
    expect(records.every((record) => record.alcaldia === "Cuauhtémoc")).toBe(true);
    expect(records.some((record) => record.source_record_id === "IZT-2024-0001")).toBe(false);
    expect(records.some((record) => record.source_record_id === "SIN-2024-0001")).toBe(false);
    expect(records.some((record) => record.collector_category === "traffic_accident")).toBe(true);
    const leaky = records.find((record) => record.source_record_id === "CUH-2024-0003");
    expect(leaky?.description).toContain("[redacted:phone]");
    expect(leaky?.description).toContain("[redacted:email]");
    expect(JSON.stringify(records)).not.toContain("5512345678");
    expect(JSON.stringify(records)).not.toContain("Ana López");
    expect(records.every((record) => record.raw_reference.row_sha256.length === 64)).toBe(true);
  });

  it("skips completed fixture resources on the next run", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const options = {
      config: testConfig(dir),
      logger: silentLogger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir: fixturePath("csv"),
      years: [2022, 2023, 2024],
    };
    await runImport(options);
    const second = await runImport(options);
    expect(second.manifest.totals.rows_selected).toBe(0);
    expect(second.manifest.resources.every((resource) => resource.skip_reason === "http_304_not_modified")).toBe(true);
    // The useful latest pointer still points at the first non-empty run.
    const latest = JSON.parse(await readFile(path.join(dir, "manifests", "0311", "latest.json"), "utf8")) as { totals: { rows_selected: number } };
    expect(latest.totals.rows_selected).toBe(10);
  });

  it("detects a changed government status with --force", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const fixtureDir = path.join(dir, "fixtures");
    await mkdir(fixtureDir, { recursive: true });
    for (const file of ["solicitudes-0311-2022.csv", "solicitudes-0311-2023.csv", "solicitudes-0311-2024.csv"]) {
      await copyFile(fixturePath("csv", file), path.join(fixtureDir, file));
    }
    const first = await runImport({
      config: testConfig(dir),
      logger: silentLogger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir,
      years: [2022, 2023, 2024],
    });
    expect(first.manifest.totals.changed_records).toBe(0);

    const target = path.join(fixtureDir, "solicitudes-0311-2024.csv");
    const text = await readFile(target, "utf8");
    await writeFile(target, text.replace(
      "CUH-2024-0001,15/03/2024,09:30,Reporte,Baches y pavimento,Bache,\"Bache profundo frente a la escuela, cerca del cruce con Avenida Insurgentes.\",20/03/2024,Cuauhtémoc,Roma Norte,Roma Norte,06700,19.4185,-99.1613,Secretaría de Obras,Concluido",
      "CUH-2024-0001,15/03/2024,09:30,Reporte,Baches y pavimento,Bache,\"Bache profundo frente a la escuela, cerca del cruce con Avenida Insurgentes.\",20/03/2024,Cuauhtémoc,Roma Norte,Roma Norte,06700,19.4185,-99.1613,Secretaría de Obras,En proceso",
    ), "utf8");

    const second = await runImport({
      config: testConfig(dir),
      logger: silentLogger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir,
      years: [2022, 2023, 2024],
      force: true,
    });
    expect(second.manifest.totals.changed_records).toBe(1);
    const changes = await readFile(second.changes_path!, "utf8");
    expect(changes).toContain('"change_type":"updated"');
    expect(changes).toContain("original_status");
  });

  it("honors a global record limit", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const result = await runImport({
      config: testConfig(dir),
      logger: silentLogger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir: fixturePath("csv"),
      years: [2024],
      limit: 2,
    });
    expect(result.manifest.totals.rows_selected).toBe(2);
    expect(result.manifest.resources[0]?.warnings).toContain("global_limit_reached");
  });

  it("does not persist normalized files in dry-run mode", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const result = await runImport({
      config: testConfig(dir),
      logger: silentLogger,
      ckanFixture: fixturePath("ckan-package-0311.json"),
      fixtureDir: fixturePath("csv"),
      years: [2024],
      dryRun: true,
    });
    expect(result.records_path).toBeNull();
    expect(result.manifest_path).toBeNull();
    expect(result.manifest.warnings).toContain("dry_run: normalized files and checkpoints were not persisted");
    expect(await pathExists(path.join(dir, "normalized", "0311"))).toBe(false);
  });

  it("fails clearly when the alcaldía column is absent", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const csv = path.join(dir, "no-alcaldia.csv");
    await writeFile(csv, "folio,descripcion\nX-1,Un bache\n", "utf8");
    const result = await runImport({
      config: testConfig(dir),
      logger: silentLogger,
      csvFixtures: [{ path: csv, year: 2024 }],
      years: [2024],
    });
    expect(result.manifest.status).toBe("failed");
    expect(result.manifest.errors.join(" ")).toContain("alcaldía");
  });
});
