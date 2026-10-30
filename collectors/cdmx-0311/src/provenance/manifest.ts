import path from "node:path";
import { atomicWriteJson, ensureDir } from "../lib/fs.js";
import type { DatasetDescriptor, ImportCounters, RunManifest, ResourceRunSummary } from "../types.js";
import { COLLECTOR_NAME, COLLECTOR_VERSION, CONTRACT_VERSION } from "../version.js";
import { emptyCounters } from "../types.js";

export interface ManifestInput {
  command: RunManifest["command"];
  runId: string;
  startedAt: string;
  dataset: DatasetDescriptor | null;
  filters: Record<string, unknown>;
  options: Record<string, unknown>;
  attribution: string;
  licenseStatus: "verified" | "unverified";
}

export function createManifest(input: ManifestInput): RunManifest {
  return {
    manifest_version: "1.0.0",
    collector: { name: COLLECTOR_NAME, version: COLLECTOR_VERSION },
    contract_version: CONTRACT_VERSION,
    command: input.command,
    run_id: input.runId,
    started_at: input.startedAt,
    finished_at: null,
    status: "completed",
    dataset: input.dataset,
    filters: input.filters,
    options: input.options,
    resources: [],
    totals: emptyCounters(),
    outputs: {},
    attribution: input.attribution,
    license_status: input.licenseStatus,
    warnings: [],
    errors: [],
    environment: {
      node: process.version,
      platform: process.platform,
      collector_version: COLLECTOR_VERSION,
    },
  };
}

export function aggregateCounters(resources: readonly ResourceRunSummary[]): ImportCounters {
  const total = emptyCounters();
  for (const resource of resources) {
    for (const key of Object.keys(total) as Array<keyof ImportCounters>) {
      total[key] += resource[key];
    }
  }
  return total;
}

export function finalizeManifest(
  manifest: RunManifest,
  input: {
    finishedAt: string;
    status: RunManifest["status"];
    outputs: Record<string, string | null>;
    warnings?: string[];
    errors?: string[];
  },
): RunManifest {
  manifest.finished_at = input.finishedAt;
  manifest.status = input.status;
  manifest.outputs = input.outputs;
  manifest.totals = aggregateCounters(manifest.resources);
  manifest.warnings = [...new Set([...manifest.warnings, ...(input.warnings ?? [])])];
  manifest.errors = [...new Set([...manifest.errors, ...(input.errors ?? [])])];
  return manifest;
}

export async function writeManifest(dataDir: string, manifest: RunManifest): Promise<string> {
  const filePath = path.join(dataDir, "manifests", "0311", `${manifest.run_id}.json`);
  await ensureDir(path.dirname(filePath));
  await atomicWriteJson(filePath, manifest);
  // Never point "latest" at an empty completed import: an incremental run with
  // no new rows should not erase the last useful handoff dataset.
  if (manifest.command !== "import" || manifest.totals.rows_selected > 0 || manifest.status !== "completed") {
    await atomicWriteJson(path.join(dataDir, "manifests", "0311", "latest.json"), {
      run_id: manifest.run_id,
      command: manifest.command,
      status: manifest.status,
      finished_at: manifest.finished_at,
      manifest_path: filePath,
      outputs: manifest.outputs,
      totals: manifest.totals,
    });
  }
  return filePath;
}

export function licenseStatusFor(dataset: DatasetDescriptor | null): "verified" | "unverified" {
  if (!dataset?.license_id) return "unverified";
  const value = dataset.license_id.trim().toLowerCase();
  if (!value || value === "notspecified" || value === "unverified") return "unverified";
  return "verified";
}
