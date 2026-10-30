import path from "node:path";
import { atomicWriteJson, ensureDir, readJsonFile } from "../lib/fs.js";
import { HttpClient } from "../lib/http.js";
import { newRunId, nowIso } from "../lib/time.js";
import type { Logger } from "../lib/log.js";
import type { CollectorConfig } from "../config.js";
import { fetchCkanDataset, parseCkanPackage, selectResources, type CkanSnapshot } from "../adapters/ckan.js";
import { discoverDashboard, type DashboardDiscoveryResult } from "../browser/dashboard.js";
import type { DatasetDescriptor, ResourceDescriptor } from "../types.js";

export interface DiscoverOptions {
  config: CollectorConfig;
  logger: Logger;
  fixturePackage?: string;
  allowBrowser?: boolean;
  allowExport?: boolean;
  clock?: () => Date;
  client?: HttpClient;
}

export interface DiscoverResult {
  run_id: string;
  dataset: DatasetDescriptor;
  selected_resources: ResourceDescriptor[];
  available_years: number[];
  license_status: "verified" | "unverified";
  retrieval: string;
  source_url: string;
  snapshot_path: string;
  dashboard: DashboardDiscoveryResult | null;
  warnings: string[];
}

export async function runDiscover(options: DiscoverOptions): Promise<DiscoverResult> {
  const clock = options.clock ?? (() => new Date());
  const runId = newRunId(clock);
  const startedAt = nowIso(clock);
  let snapshot: CkanSnapshot;

  if (options.fixturePackage) {
    const payload = await readJsonFile<unknown>(options.fixturePackage);
    snapshot = {
      dataset: parseCkanPackage(payload, { baseUrl: options.config.ckanBaseUrl, datasetName: options.config.ckanDatasetId }),
      raw: payload,
      source_url: `fixture:${options.fixturePackage}`,
      fetched_at: startedAt,
      retrieval: "api",
      warnings: ["Loaded CKAN metadata from a local fixture; no government server was contacted."],
    };
  } else {
    const client = options.client ?? new HttpClient(options.config.request);
    snapshot = await fetchCkanDataset({
      client,
      baseUrl: options.config.ckanBaseUrl,
      apiPath: options.config.ckanApiPath,
      datasetId: options.config.ckanDatasetId,
      datasetUuid: options.config.ckanDatasetUuid,
    });
  }

  const selected = selectResources(snapshot.dataset);
  const availableYears = [...new Set(selected.map((resource) => resource.year).filter((year): year is number => year !== null))].sort((a, b) => a - b);
  const licenseStatus = licenseStatusFor(snapshot.dataset);
  const discoveryDir = path.join(options.config.dataDir, "discovery", "0311", runId);
  await ensureDir(discoveryDir);
  const dashboard = await discoverDashboard({
    url: options.config.dashboardUrl,
    outDir: discoveryDir,
    allowBrowser: Boolean(options.allowBrowser),
    allowExport: Boolean(options.allowExport),
    timeoutMs: options.config.browser.timeoutMs,
    userAgent: options.config.request.userAgent,
    logger: options.logger,
  });

  const snapshotPath = path.join(options.config.dataDir, "manifests", "0311", `${runId}-discover.json`);
  await ensureDir(path.dirname(snapshotPath));
  await atomicWriteJson(snapshotPath, {
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(clock),
    dataset: snapshot.dataset,
    raw_ckan: snapshot.raw,
    retrieval: snapshot.retrieval,
    source_url: snapshot.source_url,
    selected_resources: selected,
    available_years: availableYears,
    license_status: licenseStatus,
    dashboard,
    warnings: snapshot.warnings,
  });

  return {
    run_id: runId,
    dataset: snapshot.dataset,
    selected_resources: selected,
    available_years: availableYears,
    license_status: licenseStatus,
    retrieval: snapshot.retrieval,
    source_url: snapshot.source_url,
    snapshot_path: snapshotPath,
    dashboard,
    warnings: snapshot.warnings,
  };
}

export function licenseStatusFor(dataset: DatasetDescriptor): "verified" | "unverified" {
  const license = dataset.license_id?.trim().toLowerCase();
  if (!license || license === "notspecified" || license === "unverified") return "unverified";
  return "verified";
}

export function formatDiscoveryTable(result: DiscoverResult): string {
  const lines: string[] = [];
  lines.push(`Dataset: ${result.dataset.title} (${result.dataset.name})`);
  lines.push(`Retrieval: ${result.retrieval} — ${result.source_url}`);
  lines.push(`License: ${result.dataset.license_id ?? "unverified"} (${result.license_status})`);
  lines.push(`Years: ${result.available_years.length > 0 ? result.available_years.join(", ") : "none detected"}`);
  lines.push("");
  lines.push("Year  Format  Datastore  Rows?  Resource ID                            Name");
  for (const resource of result.selected_resources) {
    lines.push(
      `${String(resource.year ?? "?").padEnd(4)}  ${(resource.format || "?").padEnd(6)}  ${(resource.datastore_active ? "yes" : "no").padEnd(9)}  ${(resource.size_bytes === null ? "?" : String(resource.size_bytes)).padEnd(5)}  ${resource.id}  ${resource.name}`,
    );
    if (resource.alternatives.length > 0) {
      for (const alternate of resource.alternatives) lines.push(`      alternate: ${alternate.id} ${alternate.name}`);
    }
  }
  if (result.dashboard?.skipped) lines.push(`\nDashboard: skipped (${result.dashboard.reason})`);
  if (result.dashboard && !result.dashboard.skipped) {
    lines.push(`\nDashboard: ${result.dashboard.title ?? "(untitled)"} — ${result.dashboard.final_url}`);
    lines.push(`Requests observed: ${result.dashboard.requests.length}; responses: ${result.dashboard.responses.length}`);
  }
  if (result.warnings.length > 0) {
    lines.push("");
    for (const warning of result.warnings) lines.push(`Warning: ${warning}`);
  }
  return lines.join("\n");
}
