import path from "node:path";
import { readFile } from "node:fs/promises";
import { atomicWriteJson, appendJsonl, ensureDir, pathExists } from "../lib/fs.js";
import { newRunId, nowIso } from "../lib/time.js";
import type { Logger } from "../lib/log.js";
import type { CollectorConfig } from "../config.js";
import { collectDashboard, type DashboardCollectionResult } from "../browser/dashboard.js";
import { normalizeJsonRecords } from "../normalization/json.js";
import { CollectorError } from "../errors.js";
import type { NormalizeContext } from "../types.js";

export interface CollectOptions {
  config: CollectorConfig;
  logger: Logger;
  configPath?: string;
  allowBrowser?: boolean;
  allowExport?: boolean;
  clock?: () => Date;
  env?: NodeJS.ProcessEnv;
}

export interface CollectResult {
  run_id: string;
  collection: DashboardCollectionResult;
  manifest_path: string;
  normalized_path: string | null;
  rejected_path: string | null;
  records: number;
  rejected: number;
}

export async function runCollect(options: CollectOptions): Promise<CollectResult> {
  const clock = options.clock ?? (() => new Date());
  const runId = newRunId(clock);
  const outDir = path.join(options.config.dataDir, "collection", "0311", runId);
  await ensureDir(outDir);
  const configPath = options.configPath ?? path.join(options.config.dataDir, "dashboard.config.json");
  if (!(await pathExists(configPath))) {
    throw new CollectorError(
      "DASHBOARD_NOT_CONFIGURED",
      `Dashboard config not found at ${configPath}. Run discover:0311 with --allow-browser, review the captured requests, then create a reviewed config with terms_verified=true.`,
    );
  }
  const collection = await collectDashboard({
    config: options.config,
    configPath,
    runId,
    outDir,
    allowBrowser: Boolean(options.allowBrowser),
    allowExport: Boolean(options.allowExport),
    env: options.env,
    logger: options.logger,
  });

  let normalizedPath: string | null = null;
  let rejectedPath: string | null = null;
  let records = 0;
  let rejected = 0;
  const payloadObjects: Array<{ file: string; objects: Array<Record<string, unknown>> }> = [];
  for (const payload of collection.payloads) {
    const body = JSON.parse(await readFile(payload.file, "utf8")) as unknown;
    const objects = extractRecordObjects(body);
    if (objects.length === 0) continue;
    payloadObjects.push({ file: payload.file, objects });
  }
  if (payloadObjects.length > 0) {
    const contextBase: Omit<NormalizeContext, "rowNumber"> = {
      sourceUrl: collection.discovery.final_url ?? options.config.dashboardUrl,
      sourceLicense: "unverified",
      sourceLicenseVerifiedFrom: "unverified",
      extractionMethod: "dashboard_api",
      collectedAt: nowIso(clock),
      resourceId: null,
      resourceName: "dashboard capture",
      resourceYear: null,
      fileName: null,
      allAlcaldias: options.config.allAlcaldias,
      targetAlcaldia: options.config.alcaldia,
      includeMissingAlcaldia: options.config.includeMissingAlcaldia,
      infrastructureOnly: options.config.infrastructureOnly,
    };
    normalizedPath = path.join(outDir, "records.jsonl");
    rejectedPath = path.join(outDir, "rejected.jsonl");
    for (const payload of payloadObjects) {
      const result = normalizeJsonRecords(payload.objects, contextBase);
      for (const record of result.records) {
        await appendJsonl(normalizedPath, record);
        records += 1;
      }
      for (const item of result.rejected) {
        await appendJsonl(rejectedPath, item);
        rejected += 1;
      }
    }
    if (records === 0) normalizedPath = null;
  }

  const manifestPath = path.join(outDir, "manifest.json");
  await atomicWriteJson(manifestPath, {
    run_id: runId,
    collected_at: nowIso(clock),
    config_path: configPath,
    collection,
    normalized_records: records,
    rejected_records: rejected,
    outputs: { normalized_path: normalizedPath, rejected_path: rejectedPath },
    license_status: "unverified",
    attribution: "Gobierno de la Ciudad de México — Tablero de Solicitudes *0311 Locatel.",
    notes: [
      "Dashboard data terms are unverified. Do not redistribute until written clarification is obtained.",
      "Browser collection requires explicit approval and a reviewed dashboard config.",
    ],
  });
  return { run_id: runId, collection, manifest_path: manifestPath, normalized_path: normalizedPath, rejected_path: rejectedPath, records, rejected };
}

function extractRecordObjects(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["records", "data", "rows", "features"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  const result = payload.result;
  if (isRecord(result)) {
    for (const key of ["records", "data", "rows", "features"]) {
      const value = result[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function formatCollectSummary(result: CollectResult): string {
  const lines = [
    `Collection ${result.run_id}: ${result.records} normalized records, ${result.rejected} rejected`,
    `Payloads captured: ${result.collection.payloads.length}; downloads: ${result.collection.downloads.length}`,
    `Manifest: ${result.manifest_path}`,
  ];
  if (result.normalized_path) lines.push(`Records: ${result.normalized_path}`);
  if (result.collection.warnings.length > 0) lines.push(`Warnings: ${result.collection.warnings.join(" | ")}`);
  return lines.join("\n");
}
