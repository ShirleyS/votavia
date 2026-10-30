# Handoff contract: official *0311 records to VotaVía ingestion

The collector is a standalone producer. It does **not** write to Supabase, alter
the application schema or call internal APIs. Integration is owned by Ismael.

## Batch layout

```text
data/official-0311/
  raw/0311/<year>/<resource-file>
  normalized/0311/<run-id>/
    records.jsonl
    changes.jsonl
    rejected.jsonl
    resources/<year>-<resource-id>.jsonl
    resources/<year>-<resource-id>.rejected.jsonl
    resources/<year>-<resource-id>.changes.jsonl
  manifests/0311/
    <run-id>.json
    <run-id>-ckan.json
    <run-id>-discover.json
    validation-<run-id>.json
    latest.json
    resources.json
  state/0311/
    checkpoint.json
    records-index.jsonl
```

`records.jsonl` is the batch snapshot for the selected years and filters. It is
not a stream of only new rows: unchanged records are included so downstream can
reconcile the batch. `changes.jsonl` contains only new/updated records and is
for event-style consumers. `rejected.jsonl` contains invalid rows and
within-batch conflicts, never accepted records.

Every run has an explicit `run-id`; `latest.json` points to the last non-empty
completed import. A no-change incremental run does not overwrite that pointer.

## Required ingestion behavior

1. Read `records.jsonl` line by line. Each line is one complete record.
2. Upsert on `(source, dedupe_key)`; `source` is always `cdmx_0311`.
3. If the stored `record_hash` equals the incoming value, treat the record as
   unchanged (update `last_seen_at` only if the application tracks it).
4. If the hash differs, update the official fields and record the change from
   `changes.jsonl`; do not treat a government status change as community
   verification.
5. Never use `raw_reference.row_number` as identity. It is provenance only and
   changes when the publisher rewrites a CSV.
6. Preserve `source_record_id`, `source_url`, `source_license`, `collected_at`
   and `raw_reference` for provenance.
7. Treat `alcaldia = "No especificada"` as an explicit quality condition. If the
   consumer requires Cuauhtémoc-only data, reject it unless the product owner
   accepts unfiltered rows.
8. Exclude non-infrastructure rows when the product requires infrastructure:
   filter `is_infrastructure_related === false`; keep `null` as “needs review”.
9. Do not derive community verification from `normalized_status`. Keep the
   government status in `original_status`/`normalized_status` and the community
   verification field separate.
10. Store no citizen names, phones, emails or raw PII columns. The collector
    excludes known PII columns and redacts patterns in free text, but downstream
    must not re-add raw source rows.

Recommended database key: a unique constraint on `(source, dedupe_key)`, plus an
index on `source_record_id` and `reported_at`. A later official record with the
same folio should update the existing row, not create a second case.

## Record example

```json
{
  "schema_version": "1.0.0",
  "source": "cdmx_0311",
  "source_record_id": "CUH-2024-0003",
  "source_url": "https://datos.cdmx.gob.mx/dataset/0311/resource/44913088-806d-4f80-acca-1409a8225e9c",
  "source_dataset": "0311",
  "source_license": "CC-BY-4.0-ESP",
  "source_license_verified_from": "ckan_metadata",
  "alcaldia": "Cuauhtémoc",
  "colonia": "Centro Histórico",
  "latitude": 19.4352,
  "longitude": -99.1412,
  "original_category": "Fuga de agua",
  "normalized_category": "other",
  "collector_category": "water_drainage",
  "is_infrastructure_related": true,
  "description": "Fuga de agua en la banqueta. Contacto: [redacted:phone].",
  "reported_at": "2024-04-03T11:15:00-06:00",
  "original_status": "Concluido",
  "normalized_status": "resolved",
  "dedupe_key": "0311:id:CUH20240003",
  "record_hash": "3892807e...",
  "data_quality_flags": ["pii_phone_redacted"],
  "raw_reference": {
    "resource_id": "44913088-806d-4f80-acca-1409a8225e9c",
    "resource_year": 2024,
    "row_number": 5,
    "row_sha256": "cf0adb2c..."
  }
}
```

See [`examples/sample-records.jsonl`](../../../examples/sample-records.jsonl) for
three complete, non-PII sample records and
[`examples/sample-manifest.json`](../../../examples/sample-manifest.json) for a
trimmed manifest. These samples were generated from fixtures, not from a live
government download.

## Manifest fields

The run manifest records:

- Collector name/version, contract version and run ID.
- Command, start/finish timestamps and status (`completed`, `partial`, `failed`).
- Dataset title, dataset UUID, organization, license and attribution.
- Filters: alcaldía, missing-alcaldía policy, infrastructure-only, years, limits.
- Every selected resource: CKAN ID, year, source page, file path, SHA-256,
  bytes, detected schema, delimiter, encoding, row counters, errors, warnings and
  skip reason.
- Totals: rows read/selected/rejected/filtered, duplicates, conflicts, new,
  unchanged, changed, missing/invalid coordinates, missing dates, PII counts.
- Output paths and license status.
- Environment and collector version.

Recommended downstream checks:

- Reject a batch if `manifest.status === "failed"`.
- Warn if `license_status === "unverified"`.
- Preserve `manifest_path` with the imported batch.
- Import `changes.jsonl` only after `records.jsonl` is accepted.

## Validation before ingestion

```bash
npm run validate:0311 -- --input data/official-0311/normalized/0311/<run>/records.jsonl
```

The validator checks required fields, enum values, coordinate ranges, ISO dates,
dedupe-key shape, SHA-256 fields, surviving contact patterns, duplicate keys and
license presence. It writes `manifests/0311/validation-<run>.json` and exits
non-zero when anything is invalid or duplicated.

## Incremental model

- CKAN downloads use `ETag` / `If-Modified-Since` and return `not_modified` on
  HTTP 304.
- Resource checkpoints store SHA-256, byte count, ETag, file path and counters.
- Fixture/offline runs skip a resource when the checkpoint is complete and the
  file hash is unchanged.
- `--force` reprocesses resources; `--dry-run` never writes normalized files or
  checkpoints.
- Cross-run record identity is stored in `records-index.jsonl`; it is compacted
  after each successful run.

## Known limits

- The importer does not know whether 0311 free text contains names beyond common
  contact patterns; a privacy review is still required before publication.
- The dashboard adapter cannot normalize an unknown payload shape until discovery
  identifies its endpoint and record array.
- The CKAN API and CDMX hosts were unreachable from the build environment; the
  fixture suite proves the pipeline, not live availability.
- The collector does not grant redistribution rights. Dashboard data remains
  `unverified` until written clarification is received.

## Contact points

- Dataset publisher: Agencia Digital de Innovación Pública (ADIP), CDMX.
- Suggested clarification address: `datosabiertos@cdmx.gob.mx`.
- Integration owner: Ismael (VotaVía official-record ingestion).
- Collector owner: Session 6 / official data.
