import type {
  OfficialRecordIngestInput,
  OfficialStatusObservation,
} from "../ingest-contract.js";
import type { NormalizedOfficialRecord, RecordIndexEntry } from "../types.js";
import { assessLicense, CDMX_ATTRIBUTION, type LicenseAssessment } from "./license-policy.js";

export const SOURCE_SYSTEM = "cdmx_0311";
export const SOURCE_DATASET = "0311";

/**
 * Deletion policy text shipped with every batch. Absence from one response is
 * never evidence of deletion, so the collector never emits tombstones.
 */
export const DELETION_POLICY =
  "Records absent from a batch are NOT deleted or deactivated. The collector emits no tombstones; " +
  "absence may mean a partial download, a filtered batch, a publisher rollback or a transient failure. " +
  "Deactivate a record only from an explicit government signal or a documented, reviewed decision.";

export interface AdaptationContext {
  runId: string;
  collectedAt: string;
  licenseId: string | null;
  licenseUrl: string | null;
  verifiedFrom: "ckan_metadata" | "dataset_page" | "unverified";
  sourceKind?: "ckan" | "dashboard";
  attribution?: string;
}

export interface AdaptedRecord {
  record: OfficialRecordIngestInput;
  license: LicenseAssessment;
}

export function toIngestRecord(
  normalized: NormalizedOfficialRecord,
  context: AdaptationContext,
): AdaptedRecord {
  const license = assessLicense({
    licenseId: context.licenseId,
    licenseUrl: context.licenseUrl,
    verifiedFrom: context.verifiedFrom,
    source: context.sourceKind ?? "ckan",
    attribution: context.attribution ?? CDMX_ATTRIBUTION,
  });

  // The contract requires a non-empty source_record_id. When the government
  // publishes no folio, the collector's stable dedupe key becomes the identity,
  // exactly as the shared contract specifies.
  const sourceRecordId = normalized.source_record_id ?? normalized.dedupe_key;

  const record: OfficialRecordIngestInput = {
    source_system: SOURCE_SYSTEM,
    source_record_id: sourceRecordId,
    dedupe_key: normalized.dedupe_key,
    source_dataset: SOURCE_DATASET,
    external_folio: normalized.source_record_id,
    source_url: normalized.source_url,
    original_category: normalized.original_category,
    original_status: normalized.original_status,
    status_normalized: normalized.normalized_status,
    // No title is published by the source. The collector never invents one;
    // the UI composes a label from original_category + colonia.
    title: null,
    description: normalized.description,
    reported_at: normalized.reported_at,
    source_closed_at: normalized.closed_at,
    alcaldia: normalized.alcaldia === "No especificada" ? null : normalized.alcaldia,
    responsible_agency: normalized.responsible_agency,
    collector_schema_version: normalized.schema_version,
    extraction_method: normalized.extraction_method,
    data_quality_flags: normalized.data_quality_flags,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    colonia: normalized.colonia,
    // Never collected: a street-level address hint is not published by the
    // source and would raise re-identification risk.
    address_hint: null,
    source_created_at: null,
    source_updated_at: normalized.updated_at,
    source_fetched_at: normalized.collected_at ?? context.collectedAt,
    // Absent-from-response never deactivates a record.
    is_active: true,
    content_hash: normalized.record_hash,
    sync_run_id: context.runId,
    license: license.license,
    license_url: license.license_url,
    attribution: license.attribution,
    license_verified_from: license.verified_from,
    redistribution: license.redistribution,
    redistribution_note: license.redistribution_note,
    provenance: buildProvenance(normalized),
  };

  return { record, license };
}

function buildProvenance(record: NormalizedOfficialRecord): Record<string, unknown> {
  return {
    collector: "votavia-cdmx-0311",
    extraction_method: record.extraction_method,
    resource: {
      id: record.raw_reference.resource_id,
      name: record.raw_reference.resource_name,
      year: record.raw_reference.resource_year,
      file: record.raw_reference.file_name,
    },
    row: {
      number: record.raw_reference.row_number,
      sha256: record.raw_reference.row_sha256,
    },
    original_alcaldia: record.original_alcaldia,
    original_subcategory: record.original_subcategory,
    category_source_field: record.category_source_field,
    colonia_source_field: record.colonia_source_field,
    category_normalization: record.category_normalization,
    collector_category: record.collector_category,
    is_infrastructure_related: record.is_infrastructure_related,
    reported_at_precision: record.reported_at_precision,
    collected_at: record.collected_at,
    source_license: record.source_license,
    source_license_verified_from: record.source_license_verified_from,
  };
}

export interface StatusDiffInput {
  previous: RecordIndexEntry | null;
  current: NormalizedOfficialRecord;
  runId: string;
  observedAt: string;
}

/**
 * Emits a status observation only when the source status actually changed.
 * A first-seen record also produces its initial observation.
 */
export function statusObservation(input: StatusDiffInput): OfficialStatusObservation | null {
  const { previous, current, runId, observedAt } = input;
  const statusText = current.original_status;
  if (!statusText) return null;
  const changed =
    !previous ||
    previous.original_status !== current.original_status ||
    previous.normalized_status !== current.normalized_status;
  if (!changed) return null;
  return {
    source_system: SOURCE_SYSTEM,
    source_record_id: current.source_record_id ?? current.dedupe_key,
    dedupe_key: current.dedupe_key,
    status_text: statusText,
    status_normalized: current.normalized_status,
    changed_at: current.closed_at ?? null,
    observed_at: observedAt,
    source_updated_at: current.updated_at,
    sync_run_id: runId,
    is_current: true,
  };
}
