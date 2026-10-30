import path from "node:path";
import { CollectorError } from "./errors.js";
import { DATASET_NAME } from "./version.js";

export interface CollectorConfig {
  datasetName: typeof DATASET_NAME;
  ckanBaseUrl: string;
  ckanDatasetId: string;
  ckanDatasetUuid: string;
  ckanApiPath: string;
  dashboardUrl: string;
  dataDir: string;
  alcaldia: string;
  allAlcaldias: boolean;
  includeMissingAlcaldia: boolean;
  infrastructureOnly: boolean;
  maxRecordsPerResource: number | null;
  request: {
    timeoutMs: number;
    retries: number;
    minIntervalMs: number;
    maxBytes: number;
    userAgent: string;
  };
  browser: {
    approvedEnv: string;
    requireExplicitApproval: true;
    timeoutMs: number;
  };
}

export const DEFAULT_CKAN_BASE = "https://datos.cdmx.gob.mx";
export const DEFAULT_CKAN_DATASET_ID = "0311";
export const DEFAULT_CKAN_DATASET_UUID = "529aac27-d1c1-426f-8c45-fd76fba43bf4";
export const DEFAULT_DASHBOARD_URL = "https://tablero311.cdmx.gob.mx/";
export const DEFAULT_ALCALDIA = "Cuauhtémoc";
export const DEFAULT_LICENSE = "unverified";

export interface ConfigOverrides {
  ckanBaseUrl?: string;
  ckanDatasetId?: string;
  ckanDatasetUuid?: string;
  dashboardUrl?: string;
  dataDir?: string;
  alcaldia?: string;
  allAlcaldias?: boolean;
  includeMissingAlcaldia?: boolean;
  infrastructureOnly?: boolean;
  maxRecordsPerResource?: number | null;
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number;
  maxBytes?: number;
  userAgent?: string;
  env?: NodeJS.ProcessEnv;
}

export function loadConfig(overrides: ConfigOverrides = {}): CollectorConfig {
  const env = overrides.env ?? process.env;
  const dataDir = overrides.dataDir ?? env.VOTAVIA_0311_DATA_DIR ?? path.join(process.cwd(), "data", "official-0311");
  const maxBytes = overrides.maxBytes ?? 2_000_000_000;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new CollectorError("CONFIG_INVALID", "maxBytes must be a positive number");
  }
  const maxRecords = overrides.maxRecordsPerResource;
  if (maxRecords !== undefined && maxRecords !== null && (!Number.isInteger(maxRecords) || maxRecords <= 0)) {
    throw new CollectorError("CONFIG_INVALID", "maxRecordsPerResource must be a positive integer or null");
  }
  return {
    datasetName: DATASET_NAME,
    ckanBaseUrl: trimSlash(overrides.ckanBaseUrl ?? DEFAULT_CKAN_BASE),
    ckanDatasetId: overrides.ckanDatasetId ?? DEFAULT_CKAN_DATASET_ID,
    ckanDatasetUuid: overrides.ckanDatasetUuid ?? DEFAULT_CKAN_DATASET_UUID,
    ckanApiPath: "/api/3/action",
    dashboardUrl: overrides.dashboardUrl ?? DEFAULT_DASHBOARD_URL,
    dataDir,
    alcaldia: overrides.alcaldia ?? DEFAULT_ALCALDIA,
    allAlcaldias: overrides.allAlcaldias ?? false,
    includeMissingAlcaldia: overrides.includeMissingAlcaldia ?? false,
    infrastructureOnly: overrides.infrastructureOnly ?? false,
    maxRecordsPerResource: maxRecords ?? null,
    request: {
      timeoutMs: overrides.timeoutMs ?? Number(env.VOTAVIA_0311_HTTP_TIMEOUT_MS ?? 60_000),
      retries: overrides.retries ?? 3,
      minIntervalMs: overrides.minIntervalMs ?? 1_000,
      maxBytes,
      userAgent: overrides.userAgent ?? env.VOTAVIA_0311_USER_AGENT ?? "VotaVia-0311-collector/0.1",
    },
    browser: {
      approvedEnv: "VOTAVIA_0311_BROWSER_APPROVED",
      requireExplicitApproval: true,
      timeoutMs: Number(env.VOTAVIA_0311_BROWSER_TIMEOUT_MS ?? 45_000),
    },
  };
}

/**
 * Browser collection needs three independent signals: a CLI flag, an explicit
 * environment approval, and a reviewed dashboard configuration. Terms of use
 * are not considered verified by the collector.
 */
export function isBrowserCollectionApproved(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOTAVIA_0311_BROWSER_APPROVED === "1";
}

export function assertBrowserCollectionApproved(env: NodeJS.ProcessEnv = process.env): void {
  if (!isBrowserCollectionApproved(env)) {
    throw new CollectorError(
      "BROWSER_COLLECTION_DISABLED",
      "Browser collection is disabled by default. Set VOTAVIA_0311_BROWSER_APPROVED=1 only after the dashboard access and reuse terms have been verified.",
      { details: { approvalEnv: "VOTAVIA_0311_BROWSER_APPROVED" } },
    );
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
