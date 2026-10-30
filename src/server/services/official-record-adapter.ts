import { randomUUID } from "node:crypto";
import type { OfficialRecordRow } from "@/server/repositories/rows";
import type { RedistributionEligibility } from "@/shared/votavia-contract";

/**
 * Structural mirror of Session 6's `NormalizedOfficialRecord`.
 *
 * Declared structurally (not imported) so the collector and the platform can
 * live in separate workspaces without a build dependency. Field names follow
 * the collector's `collectors/cdmx-0311/src/types.ts`.
 */
export interface CollectorNormalizedRecord {
  schema_version: string;
  source: string;
  source_record_id: string | null;
  source_url: string;
  source_dataset: string;
  source_license: string;
  source_license_verified_from: "ckan_metadata" | "dataset_page" | "unverified";
  alcaldia: string;
  original_alcaldia: string | null;
  colonia: string | null;
  latitude: number | null;
  longitude: number | null;
  original_category: string | null;
  original_subcategory: string | null;
  normalized_category: string | null;
  description: string | null;
  reported_at: string | null;
  closed_at: string | null;
  updated_at: string | null;
  original_status: string | null;
  normalized_status: string;
  responsible_agency: string | null;
  collected_at: string;
  extraction_method: string;
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

export interface AdapterOptions {
  syncRunId: string;
  /** Attribution shown next to the imported data. */
  attribution?: string | null;
  licenseUrl?: string | null;
  /**
   * Redistribution policy. Defaults to `allowed` only when the collector
   * confirmed the license against the source; `unknown` otherwise.
   */
  redistribution?: RedistributionEligibility;
}

/**
 * Maps one collector record to the canonical official_records row.
 *
 * Key rule: when the source has no stable id, the collector's `dedupe_key`
 * becomes `source_record_id`. That keeps imports idempotent without inventing
 * identifiers.
 */
export function fromCollectorRecord(
  record: CollectorNormalizedRecord,
  options: AdapterOptions,
): OfficialRecordRow {
  const sourceRecordId = record.source_record_id?.trim() || record.dedupe_key;
  if (!sourceRecordId) {
    throw new Error("El registro no tiene source_record_id ni dedupe_key.");
  }

  const redistribution =
    options.redistribution ??
    (record.source_license_verified_from === "unverified" ? "unknown" : "allowed");

  return {
    id: randomUUID(),
    source_system: record.source,
    source_record_id: sourceRecordId,
    dedupe_key: record.dedupe_key,
    source_dataset: record.source_dataset,
    external_folio: null,
    source_url: record.source_url,
    original_category: record.original_category,
    original_status: record.original_status,
    status_normalized: record.normalized_status,
    title: null,
    description: record.description,
    reported_at: record.reported_at,
    source_closed_at: record.closed_at,
    latitude: record.latitude,
    longitude: record.longitude,
    colonia: record.colonia,
    alcaldia: record.alcaldia,
    address_hint: null,
    responsible_agency: record.responsible_agency,
    collector_schema_version: record.schema_version,
    extraction_method: record.extraction_method,
    data_quality_flags: record.data_quality_flags,
    raw_payload: null,
    provenance: {
      dataset: record.source_dataset,
      license_verified_from: record.source_license_verified_from,
      original_alcaldia: record.original_alcaldia,
      original_subcategory: record.original_subcategory,
      normalized_category: record.normalized_category,
      raw_reference: record.raw_reference,
    },
    license: record.source_license || null,
    license_url: options.licenseUrl ?? null,
    attribution: options.attribution ?? null,
    license_verified_from: record.source_license_verified_from,
    redistribution,
    redistribution_note:
      redistribution === "unknown"
        ? "Licencia no verificada en la fuente; no redistribuir en la API pública."
        : null,
    content_hash: record.record_hash,
    sync_run_id: options.syncRunId,
    source_created_at: record.reported_at,
    source_updated_at: record.updated_at,
    source_fetched_at: record.collected_at,
    first_seen_at: record.collected_at,
    last_synced_at: record.collected_at,
    is_active: true,
    upstream_removed_at: null,
    imported_at: record.collected_at,
    updated_at: record.collected_at,
  };
}
