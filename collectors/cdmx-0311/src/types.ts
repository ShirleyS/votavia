export const CASE_CATEGORIES = [
  "road_damage",
  "street_lighting",
  "traffic_signals",
  "sidewalk_accessibility",
  "trees_vegetation",
  "waste_sanitation",
  "parks_public_spaces",
  "other",
] as const;

export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const OFFICIAL_STATUSES = [
  "received",
  "in_progress",
  "resolved",
  "closed_no_action",
  "unknown",
] as const;

export type OfficialStatus = (typeof OFFICIAL_STATUSES)[number];

export const EXTRACTION_METHODS = [
  "ckan_csv",
  "ckan_datastore",
  "dashboard_api",
  "browser",
] as const;

export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

export type DatePrecision = "date" | "datetime";

export interface RawReference {
  resource_id: string | null;
  resource_name: string | null;
  resource_year: number | null;
  file_name: string | null;
  /** 1-based data row number inside the CSV, excluding the header. */
  row_number: number | null;
  /** SHA-256 of the original row values, joined deterministically. */
  row_sha256: string;
}

export interface CategoryNormalization {
  method: "explicit" | "alias" | "keyword" | "none";
  confidence: number;
  note: string | null;
}

export interface NormalizedOfficialRecord {
  /** Collector schema version, not the government dataset version. */
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
  category_normalization: CategoryNormalization;
  is_infrastructure_related: boolean | null;

  description: string | null;
  reported_at: string | null;
  reported_at_precision: DatePrecision | null;
  closed_at: string | null;
  updated_at: string | null;

  original_status: string | null;
  normalized_status: OfficialStatus;
  responsible_agency: string | null;

  collected_at: string;
  extraction_method: ExtractionMethod;
  raw_reference: RawReference;

  dedupe_key: string;
  record_hash: string;
  data_quality_flags: string[];
}

export interface ResourceDescriptor {
  id: string;
  name: string;
  format: string;
  page_url: string;
  download_url: string | null;
  year: number | null;
  year_source: "name" | "description" | "url" | "metadata_modified" | "unknown";
  datastore_active: boolean;
  created: string | null;
  last_modified: string | null;
  size_bytes: number | null;
  description: string | null;
  alternatives: Array<{ id: string; name: string; page_url: string }>;
}

export interface DatasetDescriptor {
  id: string;
  name: string;
  title: string;
  organization: string | null;
  license_id: string | null;
  license_title: string | null;
  license_url: string | null;
  metadata_modified: string | null;
  resources: ResourceDescriptor[];
  attribution: string;
}

export interface ImportCounters {
  rows_read: number;
  rows_selected: number;
  rows_rejected: number;
  rows_filtered_out: number;
  duplicates_suppressed: number;
  duplicates_conflicting: number;
  new_records: number;
  unchanged_records: number;
  changed_records: number;
  missing_coordinates: number;
  invalid_coordinates: number;
  missing_dates: number;
  pii_redactions: number;
  pii_columns_excluded: number;
}

export interface ResourceRunSummary extends ImportCounters {
  resource_id: string;
  resource_name: string;
  resource_year: number | null;
  source_url: string;
  file_path: string | null;
  sha256: string | null;
  bytes: number | null;
  schema: CsvSchemaSummary | null;
  skipped: boolean;
  skip_reason: string | null;
  errors: string[];
  warnings: string[];
}

export interface CsvSchemaSummary {
  headers: string[];
  canonical_headers: string[];
  mapping: Record<string, string | null>;
  missing_required: string[];
  duplicate_headers: string[];
  pii_columns_excluded: string[];
  delimiter: string;
  encoding: string;
}

export interface RunManifest {
  manifest_version: "1.0.0";
  collector: { name: string; version: string };
  contract_version: string;
  command: "discover" | "import" | "collect" | "validate";
  run_id: string;
  started_at: string;
  finished_at: string | null;
  status: "completed" | "partial" | "failed";
  dataset: DatasetDescriptor | null;
  filters: Record<string, unknown>;
  options: Record<string, unknown>;
  resources: ResourceRunSummary[];
  totals: ImportCounters;
  outputs: Record<string, string | null>;
  attribution: string;
  license_status: "verified" | "unverified";
  warnings: string[];
  errors: string[];
  environment: { node: string; platform: string; collector_version: string };
}

export interface CheckpointResourceState {
  etag: string | null;
  last_modified: string | null;
  sha256: string | null;
  bytes: number | null;
  file_path: string | null;
  completed: boolean;
  completed_at: string | null;
  last_run_id: string | null;
  rows_read: number;
  rows_selected: number;
  rows_rejected: number;
}

export interface CheckpointFile {
  checkpoint_version: 1;
  dataset: "0311";
  updated_at: string;
  resources: Record<string, CheckpointResourceState>;
}

export interface RecordIndexEntry {
  dedupe_key: string;
  record_hash: string;
  source_record_id: string | null;
  original_status: string | null;
  normalized_status: OfficialStatus;
  original_category: string | null;
  normalized_category: CaseCategory | null;
  reported_at: string | null;
  latitude: number | null;
  longitude: number | null;
  description_hash: string | null;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
  last_run_id: string;
  last_resource_id: string | null;
}

export type ChangeType = "new" | "updated";

export interface RecordChange {
  change_type: ChangeType;
  dedupe_key: string;
  source_record_id: string | null;
  run_id: string;
  detected_at: string;
  changed_fields: string[];
  before: Partial<RecordIndexEntry> | null;
  after: RecordIndexEntry;
}

export interface NormalizeContext {
  sourceUrl: string;
  sourceLicense: string;
  sourceLicenseVerifiedFrom: "ckan_metadata" | "dataset_page" | "unverified";
  extractionMethod: ExtractionMethod;
  collectedAt: string;
  resourceId: string | null;
  resourceName: string | null;
  resourceYear: number | null;
  fileName: string | null;
  rowNumber: number;
  allAlcaldias: boolean;
  /** Canonical target alcaldía; defaults to Cuauhtémoc in the CLI. */
  targetAlcaldia?: string;
  includeMissingAlcaldia: boolean;
  infrastructureOnly: boolean;
}

export interface NormalizationResult {
  record: NormalizedOfficialRecord | null;
  rejected: boolean;
  filteredOut: boolean;
  errors: string[];
  warnings: string[];
  flags: string[];
  piiRedactions: number;
  piiColumnsExcluded: number;
}

export const INFRASTRUCTURE_CATEGORIES = new Set<string>([
  "road_damage",
  "street_lighting",
  "traffic_signals",
  "sidewalk_accessibility",
  "trees_vegetation",
  "waste_sanitation",
  "parks_public_spaces",
  "water_drainage",
  "public_space_deterioration",
]);

export function emptyCounters(): ImportCounters {
  return {
    rows_read: 0,
    rows_selected: 0,
    rows_rejected: 0,
    rows_filtered_out: 0,
    duplicates_suppressed: 0,
    duplicates_conflicting: 0,
    new_records: 0,
    unchanged_records: 0,
    changed_records: 0,
    missing_coordinates: 0,
    invalid_coordinates: 0,
    missing_dates: 0,
    pii_redactions: 0,
    pii_columns_excluded: 0,
  };
}
