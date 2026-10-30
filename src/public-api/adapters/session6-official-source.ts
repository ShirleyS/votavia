import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  CASE_CATEGORIES,
  type Case,
  type CaseCategory,
  type CaseStatus,
} from "@/shared/votavia-contract";
import {
  safeSourceUrl,
  type ExternalStatusKind,
  type LicenseVerificationSource,
} from "../contract-extensions";
import type {
  CaseDetailSnapshot,
  PublicCaseSource,
  PublishedCaseQuery,
} from "../source";

/**
 * Read-only bridge to Session 6 (official data ingestion).
 *
 * Session 6 owns collection, parsing, PII scrubbing and normalization. This
 * adapter only consumes its documented output: a normalized records JSONL and
 * an optional run manifest. It never scrapes a website and never writes back.
 *
 * Contract reference (do not edit there):
 *   votavia-official-data/collectors/cdmx-0311/src/types.ts
 *   votavia-official-data/collectors/cdmx-0311/docs/field-mapping.md
 *
 * Mapping decisions that protect residents and avoid false claims:
 * - Government `normalized_status` maps ONLY to `external_government_status`.
 *   Imported records enter VotaVía as `reported`; VotaVía never adopts a
 *   government closure as its own resolution.
 * - `community_verification_status` is always `unreviewed` for imports.
 * - `resolved_at` is always null for imports.
 * - Records with `source_license_verified_from: "unverified"`, or from a run
 *   whose manifest says `license_status: "unverified"`, fail the publication
 *   gate even when the global feed flag is on.
 * - Records without usable coordinates are skipped: the canonical `Case`
 *   requires a point, and inventing one would publish a false location.
 */

export const SESSION6_RECORDS_PATH_ENV = "VOTAVIA_OFFICIAL_RECORDS_PATH";
export const SESSION6_MANIFEST_PATH_ENV = "VOTAVIA_OFFICIAL_MANIFEST_PATH";

/** Local mirror of Session 6's `NormalizedOfficialRecord` (schema 1.0.0). */
export interface Session6OfficialRecord {
  schema_version: "1.0.0";
  source: "cdmx_0311";
  source_record_id: string | null;
  source_url: string;
  source_dataset: "0311";
  source_license: string;
  source_license_verified_from: "ckan_metadata" | "dataset_page" | "unverified";
  alcaldia: string;
  original_alcaldia: string | null;
  colonia: string | null;
  colonia_source_field: string | null;
  latitude: number | null;
  longitude: number | null;
  original_category: string | null;
  original_subcategory: string | null;
  category_source_field: string | null;
  normalized_category: CaseCategory | null;
  collector_category: string | null;
  category_normalization: {
    method: "explicit" | "alias" | "keyword" | "none";
    confidence: number;
    note: string | null;
  };
  is_infrastructure_related: boolean | null;
  description: string | null;
  reported_at: string | null;
  reported_at_precision: "date" | "datetime" | null;
  closed_at: string | null;
  updated_at: string | null;
  original_status: string | null;
  normalized_status: "received" | "in_progress" | "resolved" | "closed_no_action" | "unknown";
  responsible_agency: string | null;
  collected_at: string;
  extraction_method: "ckan_csv" | "ckan_datastore" | "dashboard_api" | "browser";
  raw_reference: {
    resource_id: string | null;
    resource_name: string | null;
    resource_year: number | null;
    file_name: string | null;
    row_number: number | null;
    row_sha256: string;
  };
  dedupe_key: string;
  record_hash: string;
  data_quality_flags: string[];
}

/** Subset of Session 6's `RunManifest` used for dataset-level statements. */
export interface Session6Manifest {
  manifest_version: "1.0.0";
  contract_version: string;
  run_id: string;
  status: "completed" | "partial" | "failed";
  dataset: {
    name: string;
    title: string;
    organization: string | null;
    license_id: string | null;
    license_title: string | null;
  } | null;
  attribution: string;
  license_status: "verified" | "unverified";
  warnings: string[];
}

export interface Session6DatasetInfo {
  dataset: string;
  source_name: string;
  attribution: string | null;
  license_status: "verified" | "unverified" | "unknown";
  license_id: string | null;
  run_id: string | null;
  manifest_status: "completed" | "partial" | "failed" | null;
}

export interface LoadedOfficialRecords {
  cases: Case[];
  dataset: Session6DatasetInfo;
  diagnostics: {
    rows_read: number;
    rows_skipped_invalid: number;
    rows_skipped_no_coordinates: number;
    rows_publishable: number;
  };
}

const DATASET_SLUG = "cdmx-0311";
const CATEGORY_SET = new Set<string>(CASE_CATEGORIES);

export function officialRecordsPath(env: NodeJS.ProcessEnv = process.env): string {
  return (env[SESSION6_RECORDS_PATH_ENV] ?? "").trim();
}

export function officialManifestPath(env: NodeJS.ProcessEnv = process.env): string {
  return (env[SESSION6_MANIFEST_PATH_ENV] ?? "").trim();
}

/**
 * Deterministic UUID derived from the source's dedupe key, so the public
 * `case_id` survives re-imports and matches the canonical UUID format.
 */
export function officialCaseId(dedupeKey: string): string {
  const hash = createHash("sha1")
    .update(`votavia:official:${dedupeKey}`)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function officialDisplayId(dedupeKey: string): string {
  const digest = createHash("sha256").update(dedupeKey).digest("hex");
  return `CDMX-0311-${digest.slice(0, 6).toUpperCase()}`;
}

function normalizeCategory(value: unknown): CaseCategory {
  return typeof value === "string" && CATEGORY_SET.has(value)
    ? (value as CaseCategory)
    : "other";
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function usableCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

const EXTERNAL_STATUS: Record<
  Session6OfficialRecord["normalized_status"],
  { kind: ExternalStatusKind; label: string }
> = {
  received: { kind: "open", label: "Recibido por la autoridad (según la fuente)" },
  in_progress: { kind: "in_progress", label: "En atención según la autoridad" },
  resolved: {
    kind: "closed",
    label: "Atendido según la fuente; no verificado por VotaVía",
  },
  closed_no_action: {
    kind: "closed",
    label: "Cerrado sin acción según la fuente; no verificado por VotaVía",
  },
  unknown: { kind: "unknown", label: "Sin estado público en la fuente" },
};

function licenseVerification(
  value: Session6OfficialRecord["source_license_verified_from"],
): LicenseVerificationSource {
  if (value === "ckan_metadata" || value === "dataset_page" || value === "unverified") {
    return value;
  }
  return "unknown";
}

function publicTitle(record: Session6OfficialRecord): string {
  const subject =
    record.original_subcategory?.trim() ||
    record.original_category?.trim() ||
    "Reporte 0311";
  const place = record.colonia?.trim() || record.alcaldia?.trim() || "CDMX";
  return `${subject} — ${place}`.slice(0, 160);
}

/**
 * Maps one normalized Session 6 record into the canonical `Case` shape plus
 * the public metadata read by `readPublicMetadata`. Returns null when the
 * record cannot be published safely (e.g. no usable coordinates).
 */
export function mapSession6Record(
  record: Session6OfficialRecord,
  dataset: Session6DatasetInfo,
): Case | null {
  if (!record || record.schema_version !== "1.0.0") return null;
  if (!record.dedupe_key || typeof record.dedupe_key !== "string") return null;

  const latitude = usableCoordinate(record.latitude, -90, 90);
  const longitude = usableCoordinate(record.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;

  const collectedAt = normalizeIso(record.collected_at) ?? new Date().toISOString();
  const sourceReportedAt = normalizeIso(record.reported_at);
  const sourceClosedAt = normalizeIso(record.closed_at);
  const sourceUpdatedAt = normalizeIso(record.updated_at);
  const createdAt = sourceReportedAt ?? collectedAt;
  const updatedAt = sourceUpdatedAt ?? sourceClosedAt ?? createdAt;

  const manifestVerified = dataset.license_status !== "unverified";
  const licenseVerificationSource = licenseVerification(record.source_license_verified_from);
  const licenseId = (record.source_license ?? "").trim();
  const licenseKnown =
    Boolean(licenseId) && licenseId.toLowerCase() !== "unverified" && licenseId.toLowerCase() !== "unknown";
  const redistributable =
    manifestVerified && licenseVerificationSource !== "unverified" && licenseKnown;

  const external = EXTERNAL_STATUS[record.normalized_status] ?? EXTERNAL_STATUS.unknown;
  const caseId = officialCaseId(record.dedupe_key);
  const sourceUrl = safeSourceUrl(record.source_url);
  const alcaldia = record.alcaldia?.trim() || "No especificada";

  return {
    case_id: caseId,
    display_id: officialDisplayId(record.dedupe_key),
    category: normalizeCategory(record.normalized_category),
    // Never derive the VotaVía operational status from a government field.
    status: "reported" satisfies CaseStatus,
    title: publicTitle(record),
    description: (record.description ?? "").slice(0, 4_000),
    location: {
      latitude,
      longitude,
      colonia: record.colonia?.trim() || "No especificada",
      alcaldia,
      address_hint: null,
    },
    colonia: record.colonia?.trim() || "No especificada",
    latitude,
    longitude,
    photos: [],
    support_count: 0,
    supported_by_me: false,
    observation_count: 0,
    has_safety_concern: false,
    has_accessibility_concern: false,
    is_demo: false,
    is_published: true,
    created_at: createdAt,
    updated_at: updatedAt,
    // A government closure is not an independent resolution.
    resolved_at: null,

    record_origin: "government_import",
    external_government_status: {
      code: record.original_status ?? null,
      label: external.label,
      kind: external.kind,
      reported_at: sourceUpdatedAt ?? sourceClosedAt ?? null,
    },
    community_verification_status: "unreviewed",
    community_verification_summary: null,
    community_verified_at: null,
    provenance: {
      record_origin: "government_import",
      dataset: dataset.dataset,
      source_name: dataset.source_name,
      source_url: sourceUrl,
      official_folio: record.source_record_id?.trim() || null,
      source_reported_at: sourceReportedAt,
      last_synced_at: collectedAt,
      license: {
        id: licenseId || "unknown",
        name: dataset.license_id || licenseId || "No declarada",
        url: null,
        redistributable,
      },
      license_verified_from: licenseVerificationSource,
      permission: {
        // A verified open licence that permits reuse IS the redistribution
        // permission. Unverified sources never reach this true branch.
        verified: redistributable,
        verified_at: null,
        reference: null,
      },
      attribution: dataset.attribution,
    },
    official_record: {
      source_dataset: record.source_dataset ?? "0311",
      original_status: record.original_status,
      original_category: record.original_category,
      original_subcategory: record.original_subcategory,
      responsible_agency: record.responsible_agency,
      is_infrastructure_related: record.is_infrastructure_related,
      data_quality_flags: Array.isArray(record.data_quality_flags)
        ? record.data_quality_flags.slice(0, 20)
        : [],
      source_updated_at: sourceUpdatedAt,
      source_closed_at: sourceClosedAt,
      extraction_method: record.extraction_method,
      collected_at: collectedAt,
    },
  } as Case;
}

export function parseRecordsJsonl(text: string): {
  records: Session6OfficialRecord[];
  skipped: number;
} {
  const records: Session6OfficialRecord[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Session6OfficialRecord;
      if (parsed && parsed.schema_version === "1.0.0" && parsed.dedupe_key) {
        records.push(parsed);
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped };
}

async function readManifest(manifestPath: string): Promise<Session6Manifest | null> {
  if (!manifestPath) return null;
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as Session6Manifest;
    if (parsed?.manifest_version !== "1.0.0") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resolveRecordsFile(target: string): Promise<string> {
  try {
    const info = await stat(target);
    if (info.isDirectory()) return path.join(target, "records.jsonl");
  } catch {
    // Let the read below surface the error.
  }
  return target;
}

export function datasetInfoFromManifest(
  manifest: Session6Manifest | null,
  fallbackAttribution: string | null = null,
): Session6DatasetInfo {
  const datasetTitle = manifest?.dataset?.title?.trim();
  const organization = manifest?.dataset?.organization?.trim();
  const sourceName = datasetTitle
    ? organization
      ? `${datasetTitle} · ${organization}`
      : datasetTitle
    : "Solicitudes *0311 · Portal de Datos Abiertos CDMX";
  return {
    dataset: DATASET_SLUG,
    source_name: sourceName.slice(0, 120),
    attribution: (manifest?.attribution ?? fallbackAttribution)?.slice(0, 240) ?? null,
    license_status: manifest?.license_status ?? "unknown",
    license_id: manifest?.dataset?.license_id ?? null,
    run_id: manifest?.run_id ?? null,
    manifest_status: manifest?.status ?? null,
  };
}

/**
 * Loads and maps Session 6 output. `recordsPath` may point at `records.jsonl`
 * or at a run directory containing it. Never throws on a bad row; returns
 * diagnostics instead so one corrupted line cannot take down the API.
 */
export async function loadOfficialRecords(options: {
  recordsPath: string;
  manifestPath?: string;
}): Promise<LoadedOfficialRecords> {
  const filePath = await resolveRecordsFile(options.recordsPath);
  const [text, manifest] = await Promise.all([
    readFile(filePath, "utf8"),
    readManifest(options.manifestPath ?? ""),
  ]);
  const dataset = datasetInfoFromManifest(manifest);
  const { records, skipped } = parseRecordsJsonl(text);

  const cases: Case[] = [];
  let skippedNoCoordinates = 0;
  for (const record of records) {
    const mapped = mapSession6Record(record, dataset);
    if (mapped) cases.push(mapped);
    else skippedNoCoordinates += 1;
  }
  return {
    cases,
    dataset,
    diagnostics: {
      rows_read: records.length + skipped,
      rows_skipped_invalid: skipped,
      rows_skipped_no_coordinates: skippedNoCoordinates,
      rows_publishable: cases.length,
    },
  };
}

/** Simple mtime/size cache so repeated requests do not re-read the file. */
let cache: {
  key: string;
  loaded: LoadedOfficialRecords;
} | null = null;

export function __resetOfficialRecordsCacheForTests() {
  cache = null;
}

export async function loadOfficialRecordsCached(
  recordsPath: string,
  manifestPath = "",
): Promise<LoadedOfficialRecords> {
  const filePath = await resolveRecordsFile(recordsPath);
  let signature = `${filePath}|${manifestPath}`;
  try {
    const info = await stat(filePath);
    signature += `|${info.mtimeMs}|${info.size}`;
  } catch {
    // Missing file: no cache key, and the read will throw a normal error.
    return loadOfficialRecords({ recordsPath, manifestPath });
  }
  if (cache && cache.key === signature) return cache.loaded;
  const loaded = await loadOfficialRecords({ recordsPath, manifestPath });
  cache = { key: signature, loaded };
  return loaded;
}

/**
 * A `PublicCaseSource` that exposes only Session 6 imports. Wrapped by
 * `CompositeCaseSource` so it never replaces Session 1's canonical data.
 */
export class Session6OfficialCaseSource implements PublicCaseSource {
  readonly kind = "live" as const;

  constructor(
    private readonly recordsPath: string,
    private readonly manifestPath = "",
  ) {}

  private async cases(): Promise<Case[]> {
    const loaded = await loadOfficialRecordsCached(this.recordsPath, this.manifestPath);
    return loaded.cases;
  }

  async listPublished(query: PublishedCaseQuery) {
    const items = await this.cases();
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total: items.length };
  }

  async getById(caseId: string): Promise<CaseDetailSnapshot | null> {
    const item = (await this.cases()).find((row) => row.case_id === caseId);
    return item ? { item, timeline: [], observations: [] } : null;
  }

  async statistics() {
    return {
      total_cases: (await this.cases()).length,
      resolved_cases: 0,
      total_supports: 0,
      total_observations: 0,
      is_demo: false,
      by_category: [],
      by_status: [],
      by_colonia: [],
      recent_resolved: [],
    };
  }

  async health() {
    const loaded = await loadOfficialRecordsCached(this.recordsPath, this.manifestPath);
    return {
      status: "ok" as const,
      detail: `Registros normalizados de Session 6: ${loaded.cases.length} publicables, ${loaded.diagnostics.rows_skipped_no_coordinates} sin coordenadas.`,
    };
  }
}
