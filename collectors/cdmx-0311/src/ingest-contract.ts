/**
 * Local mirror of Session 1's ingestion contract
 * (`src/shared/votavia-contract.ts` in the main worktree).
 *
 * The collector must not import from another worktree — the two checkouts move
 * independently — so the subset that this adapter emits is restated here and
 * pinned by `CONTRACT_VERSION`. If Session 1 changes the contract, update this
 * file and bump the version.
 */

export const INGEST_CONTRACT_VERSION = "1.0.0";

export const REDISTRIBUTION_ELIGIBILITIES = ["allowed", "restricted", "unknown"] as const;
export type RedistributionEligibility = (typeof REDISTRIBUTION_ELIGIBILITIES)[number];

/** One normalized record as produced by the Session 6 collector. */
export interface OfficialRecordIngestInput {
  source_system: string;
  /** Source id, or `dedupe_key` when the source has no stable id. */
  source_record_id: string;
  dedupe_key?: string | null;
  source_dataset?: string | null;
  external_folio?: string | null;
  source_url?: string | null;
  original_category?: string | null;
  original_status?: string | null;
  status_normalized?: string | null;
  title?: string | null;
  description?: string | null;
  reported_at?: string | null;
  source_closed_at?: string | null;
  alcaldia?: string | null;
  responsible_agency?: string | null;
  collector_schema_version?: string | null;
  extraction_method?: string | null;
  data_quality_flags?: string[];
  latitude?: number | null;
  longitude?: number | null;
  colonia?: string | null;
  address_hint?: string | null;
  source_created_at?: string | null;
  source_updated_at?: string | null;
  source_fetched_at?: string | null;
  is_active?: boolean;
  content_hash?: string | null;
  sync_run_id?: string | null;
  license?: string | null;
  license_url?: string | null;
  attribution?: string | null;
  license_verified_from?: string | null;
  redistribution?: RedistributionEligibility;
  redistribution_note?: string | null;
  provenance?: Record<string, unknown>;
}

/** Append-only source-status observation, matching `official_record_status_history`. */
export interface OfficialStatusObservation {
  source_system: string;
  source_record_id: string;
  dedupe_key: string;
  status_text: string;
  status_normalized: string | null;
  changed_at: string | null;
  observed_at: string;
  source_updated_at: string | null;
  sync_run_id: string;
  is_current: boolean;
}

export interface IngestBatchManifest {
  contract_version: string;
  collector: { name: string; version: string };
  source_system: string;
  source_dataset: string;
  run_id: string;
  generated_at: string;
  idempotency_key: string;
  counts: {
    records: number;
    status_observations: number;
    created: number;
    updated: number;
    unchanged: number;
  };
  license: {
    id: string;
    url: string | null;
    attribution: string;
    redistribution: RedistributionEligibility;
    note: string;
    verified_from: string;
  };
  upsert_key: [string, string];
  deletion_policy: string;
  outputs: Record<string, string>;
  warnings: string[];
}
