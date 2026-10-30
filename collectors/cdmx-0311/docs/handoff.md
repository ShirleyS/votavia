# Handoff to Session 1: official *0311 records

The collector is a standalone producer. It does **not** write to Supabase,
alter the application schema or call internal APIs. Session 1 owns persistence.

## The contract already exists

Session 1 has already defined the ingestion surface in
`src/shared/votavia-contract.ts` (main worktree):

- `OfficialRecordIngestInput` — what this collector emits.
- `OfficialRecord` — stored shape.
- `OfficialRecordStatusHistoryEntry` — append-only source-status history.
- `official_records` table — unique on `(source_system, source_record_id)`.

This collector therefore does **not** propose a competing schema. It emits
records shaped for `OfficialRecordIngestInput`; a local mirror of the types lives
in `src/ingest-contract.ts`, pinned by `INGEST_CONTRACT_VERSION`.

If Session 1 changes the contract, update `src/ingest-contract.ts`, bump the
version, and re-run the adapter tests, which assert the mapping field by field.

## Run the pipeline

```bash
cd collectors/cdmx-0311
npm run build

npm run import:0311 -- \
  --ckan-fixture fixtures/ckan-package-0311.json \
  --fixture-dir fixtures/csv \
  --year 2022 --year 2023 --year 2024

npm run export:0311          # emits the ingestion batch
npm run validate:0311        # validates normalized records
```

Live equivalent (network required):

```bash
npm run discover:0311
npm run import:0311
npm run export:0311
```

## What the batch contains

```text
data/official-0311/
  normalized/0311/<run-id>/
    records.jsonl              collector-normalized view
    changes.jsonl              only new/updated records
    rejected.jsonl             invalid rows and within-batch conflicts
  ingest/0311/<batch-id>/
    records.jsonl              OfficialRecordIngestInput[]
    status-history.jsonl       OfficialStatusObservation[]
    manifest.json              batch metadata + idempotency key
  manifests/0311/              run manifests, CKAN snapshot, validation reports
  state/0311/
    checkpoint.json            per-resource download state
    records-index.jsonl        collector view of records
    ingest-index.jsonl         what the consumer has already been told
    schedule.json              schedule state
    sync-log.jsonl             append-only sync history
```

Consume **`ingest/0311/<batch-id>/records.jsonl`** — not the normalized file.
The ingest batch is the stable contract surface; the normalized view is the
collector's internal representation.

## Upsert algorithm

```text
for each record in records.jsonl:
    upsert on (source_system, source_record_id)
    if not found:                          INSERT, created = true
    else if stored.content_hash == rec.content_hash:
                                           no-op (optionally touch last_synced_at)
    else:                                  UPDATE mutable fields only
```

Identity rules:

- `source_system` is always `cdmx_0311`.
- `source_record_id` is the government folio when present, otherwise the
  collector's stable `dedupe_key` (`0311:id:…` / `0311:natural:…`). This is
  exactly what the shared contract specifies.
- `external_folio` carries the human folio and **may be null or repeated** —
  never use it as a key.
- `provenance.row.number` is provenance only and must never be an identity.

## Deletion policy — absence is not deletion

The collector emits **no tombstones**. A record missing from a batch may mean a
partial download, a filtered run, a publisher rollback or a transient failure.

Therefore:

- Never delete or deactivate a record because it is absent from one batch.
- Do not infer `is_active = false` from absence.
- If a full deactivation is ever needed, it must come from an explicit
  government signal or a documented, reviewed decision — followed by a separate
  migration, not an import heuristic.

The batch manifest repeats this policy in `deletion_policy` so it cannot be lost
in transit.

## Field mapping

| Ingest field | Source |
| --- | --- |
| `source_system` | constant `cdmx_0311` |
| `source_record_id` | `source_record_id` ?? `dedupe_key` |
| `dedupe_key` | collector dedupe key |
| `source_dataset` | `0311` |
| `external_folio` | government folio, verbatim |
| `source_url` | CKAN resource page |
| `original_category` / `original_status` | government labels, verbatim |
| `status_normalized` | collector mapping (advisory) |
| `description` | scrubbed free text, <= 4,000 chars |
| `reported_at` | ISO; date-only when no time was published |
| `source_closed_at` | `fecha_concluido` |
| `alcaldia` | canonical name, or `null` when not published |
| `colonia`, `latitude`, `longitude` | as published, never geocoded |
| `responsible_agency` | `dependencia` |
| `collector_schema_version` | `1.0.0` |
| `extraction_method` | `ckan_csv` / `ckan_datastore` / `dashboard_api` |
| `data_quality_flags` | sorted flags |
| `source_fetched_at` | collection timestamp |
| `source_updated_at` | only from an explicit update column |
| `is_active` | always `true` (see deletion policy) |
| `content_hash` | stable record hash, excludes collection time |
| `sync_run_id` | collector run id |
| `license`, `license_url`, `attribution` | from CKAN metadata |
| `redistribution` | `allowed` / `restricted` / `unknown` |
| `provenance` | resource, row hash, category normalization details |

Deliberately **null**: `title` (not published — compose in the UI),
`address_hint` (re-identification risk), `source_created_at` (not published).

## Status history

`status-history.jsonl` contains one observation per status *change*, plus the
initial observation for a first-seen record. Repeated batches with an unchanged
status emit nothing.

Append to `official_record_status_history` and set `is_current = false` on the
previous row for that `official_record_id` in the same transaction.

```json
{
  "source_system": "cdmx_0311",
  "source_record_id": "CUH-2024-0002",
  "dedupe_key": "0311:id:CUH20240002",
  "status_text": "Concluido",
  "status_normalized": "resolved",
  "changed_at": "2024-04-12",
  "observed_at": "2026-10-30T19:48:39.195Z",
  "source_updated_at": null,
  "sync_run_id": "20261030194839-5cnh",
  "is_current": true
}
```

`status_normalized` is advisory. **Never** copy it into
`community_verification_status`. A government `resolved` is not a
community-verified resolution.

## Idempotency guarantees

Verified by tests and by a manual repeat run:

| Action | Result |
| --- | --- |
| Re-import the same files | `new 0, unchanged 10, changed 0` |
| Re-export the same batch | `new 0, unchanged 10, status observations 0` |
| Compare `idempotency_key` across repeat exports | Identical |
| Export the same normalized run twice | `records.jsonl` byte-identical |

`idempotency_key` is a SHA-256 over `(source_record_id, content_hash)` pairs, so
two batches with the same identity and content always share a key regardless of
timestamps.

## Partial failures

- `--continue-on-error` marks the run `partial` and still writes the records it
  could read.
- A failed run leaves prior data untouched and reports in `sync-log.jsonl`.
- Import never truncates; it only appends or renames completed files.
- A no-change run does not overwrite `manifests/0311/latest.json`.

## Public exposure

Session 4 must only publish records with `redistribution === "allowed"` and must
use the allowlist in [`session4-public-schema.md`](session4-public-schema.md).

## Verification checklist for Session 1

- [ ] Ingest adapter tests pass (`npm test`).
- [ ] A batch imports with `created` equal to the record count.
- [ ] Re-running the same batch creates zero new rows.
- [ ] `status-history.jsonl` appends only on real changes.
- [ ] No record is deleted when absent from a later batch.
- [ ] `community_verification_status` is untouched by import.
- [ ] `redistribution` is respected before any public read.
- [ ] `attribution` is stored and rendered.

## Samples

- [`examples/ingest-records.jsonl`](../../../examples/ingest-records.jsonl)
- [`examples/status-history.jsonl`](../../../examples/status-history.jsonl)
- [`examples/ingest-manifest.json`](../../../examples/ingest-manifest.json)
- [`examples/sample-records.jsonl`](../../../examples/sample-records.jsonl) — collector-normalized view

All samples are generated from fixtures, not a live government download.

## Known limits

- Free-text PII detection is pattern-based; a human privacy review is still
  required before publication.
- The dashboard adapter cannot normalize an unknown payload shape until
  discovery identifies its endpoint.
- CKAN hosts were unreachable from the build environment; the fixture suite
  proves the pipeline, not live availability.
- The collector does not grant redistribution rights.

## Ownership

- Dataset publisher: Agencia Digital de Innovación Pública (ADIP), CDMX.
- Clarification address: `datosabiertos@cdmx.gob.mx`.
- Integration owner: Ismael / Session 1.
- Collector owner: Session 6 / official data.
