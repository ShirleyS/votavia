# VotaVía — CDMX *0311 official-data collector

Standalone collector for the Government of Mexico City’s **Solicitudes *0311**
dataset and the public *0311 requests dashboard. It discovers official CKAN
resources, streams historical CSV/DataStore data, normalizes Cuauhtémoc records
and emits a versioned JSONL handoff for VotaVía ingestion.

It does **not** modify the main application, its database schema or public APIs.
It owns no Supabase tables. See [`docs/handoff.md`](docs/handoff.md).

## Current status

| Area | Status |
| --- | --- |
| CKAN dataset and 2019–2024 resource IDs | Discovered from official/indexed pages |
| Historical CSV parser and normalizer | Working; fixture-tested |
| Cuauhtémoc filtering | Working |
| Provenance, checksums, checkpoints | Working |
| Duplicate and status-change detection | Working |
| Ingestion adapter (Session 1 contract) | Working; emits `OfficialRecordIngestInput` + status history |
| Scheduled synchronization | Implemented; **disabled by default**, gated on two approvals |
| Playwright dashboard discovery | Implemented; disabled by default |
| Dashboard API/export | **Not verified** (CDMX hosts unreachable from this build environment) |
| Dashboard reuse terms | **Unverified** |
| Live CKAN download from this machine | **Blocked by network sandbox** |

Details: [`docs/0311-dashboard-discovery.md`](docs/0311-dashboard-discovery.md).

## Quick start (offline fixtures)

### First live run, scoped to Cuauhtémoc

Cuauhtémoc is the default target and the only alcaldía this collector publishes.
Rows from the other 15 alcaldías are filtered out, and rows with a blank
alcaldía are dropped unless `--include-missing-alcaldia` is set (they are then
labelled `No especificada`, never assigned to Cuauhtémoc).

```bash
./scripts/cuauhtemoc-first-run.sh discover   # read CKAN metadata only
./scripts/cuauhtemoc-first-run.sh peek       # bounded dry run, writes nothing
./scripts/cuauhtemoc-first-run.sh import     # bounded import (2024, max 500)
./scripts/cuauhtemoc-first-run.sh report     # counts by category/colonia/status
```

Override the scope with `ALCALDIA`, `YEAR`, `MAX_RECORDS` or `DATA_DIR`. The
newest observed resource covers 2024-Q1, so `YEAR=2024` is the default; raise
`MAX_RECORDS` only after reviewing the first sample. These commands are
read-only against the government source and write to
`data/official-0311-cuauhtemoc/`.

```bash
cd collectors/cdmx-0311
npm install
npm run build

# 1. Inspect CKAN metadata without contacting the government site
npm run discover:0311 -- --fixture-package fixtures/ckan-package-0311.json

# 2. Import representative Cuauhtémoc records
npm run import:0311 -- \
  --ckan-fixture fixtures/ckan-package-0311.json \
  --fixture-dir fixtures/csv \
  --year 2022 --year 2023 --year 2024

# 3. Validate the normalized snapshot
npm run validate:0311

# 4. Emit the ingestion batch for Session 1
npm run export:0311

# 5. Run the test suite
npm test
```

Outputs default to `./data/official-0311`:

```text
data/official-0311/
  raw/0311/<year>/...
  normalized/0311/<run-id>/records.jsonl
  normalized/0311/<run-id>/changes.jsonl
  normalized/0311/<run-id>/rejected.jsonl
  manifests/0311/<run-id>.json
  manifests/0311/latest.json
  ingest/0311/<batch-id>/records.jsonl
  ingest/0311/<batch-id>/status-history.jsonl
  ingest/0311/<batch-id>/manifest.json
  state/0311/checkpoint.json
  state/0311/records-index.jsonl
  state/0311/ingest-index.jsonl
  state/0311/schedule.json
  state/0311/sync-log.jsonl
```

Change the root with `--data-dir /path/to/data`.

## Live CKAN import

On a network where `datos.cdmx.gob.mx` resolves:

```bash
npm run discover:0311
npm run import:0311 -- --year 2024
npm run import:0311                   # all discovered years
npm run validate:0311
```

The importer:

1. Calls CKAN `package_show?id=0311`, then the known dataset UUID and finally
   the dataset HTML page.
2. Selects one CSV/TSV/JSON resource per year and records alternates.
3. Uses a CKAN DataStore resource when available, otherwise streams a direct
   download.
4. Applies conditional HTTP requests (`ETag` / `If-Modified-Since`), bounded
   retries, a minimum request interval, a user agent and a maximum file size.
5. Streams CSV with quoted-field, BOM, delimiter and encoding handling.
6. Filters Cuauhtémoc, normalizes dates/statuses/categories, removes known PII
   columns and redacts contact patterns.
7. Deduplicates by stable government folio or a content-derived natural key.
8. Writes a manifest with checksums, counts, schema detection, warnings and
   license status.

### Useful import flags

| Flag | Effect |
| --- | --- |
| `--year 2024` | Repeatable year filter |
| `--limit 1000` | Maximum selected records across the run |
| `--max-records 500` | Maximum selected records per resource |
| `--all-alcaldias` | Disable the Cuauhtémoc filter |
| `--include-missing-alcaldia` | Keep rows without alcaldía, flagged and labelled `No especificada`; does not infer Cuauhtémoc |
| `--infrastructure-only` | Drop records explicitly marked non-infrastructure |
| `--force` | Ignore completed checkpoints and re-download/reprocess |
| `--dry-run` | Count/inspect without normalized files or checkpoints |
| `--continue-on-error` | Continue after a resource fails; result status becomes `partial` |

## Dashboard collection (guarded)

Browser discovery is allowed only with an explicit flag:

```bash
npm run discover:0311 -- --allow-browser
```

Review `data/official-0311/discovery/0311/<run>/discovery.json` and the
screenshot. If the interface and terms are acceptable, copy the example config,
replace the placeholder selectors/patterns with the real ones and obtain human
sign-off:

```bash
cp dashboard.config.example.json dashboard.config.json
# edit, then set terms_verified: true only after review
VOTAVIA_0311_BROWSER_APPROVED=1 \
  npm run collect:0311 -- --allow-browser
```

Collection requires **three** independent gates:

1. `--allow-browser`;
2. `VOTAVIA_0311_BROWSER_APPROVED=1` (exact value);
3. `terms_verified: true` in the reviewed dashboard config.

Export buttons require an additional `--allow-export`. Login walls, CAPTCHAs,
`access denied` pages and rate limits are never bypassed. The collector records
the stop condition and exits.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run discover:0311` | CKAN metadata, resource selection and optional dashboard discovery |
| `npm run import:0311` | Historical CSV/DataStore ingestion and normalization |
| `npm run collect:0311` | Guarded Playwright collection using a reviewed config |
| `npm run validate:0311` | Validate normalized JSONL and write a report |
| `npm run export:0311` | Emit the `OfficialRecordIngestInput` batch + status history |
| `npm run sync:0311` | Run due scheduled sync (live access disabled by default) |
| `npm test` | Unit and fixture integration tests; no live government site required |
| `npm run typecheck` | TypeScript check |

Add CLI arguments after `--`, for example `npm run import:0311 -- --year 2024`.

For machine-readable JSON without npm’s banner, call the compiled CLI directly:
`node dist/cli.js discover --json`.

Generated sample outputs:
[`examples/ingest-records.jsonl`](../../examples/ingest-records.jsonl),
[`examples/ingest-manifest.json`](../../examples/ingest-manifest.json),
[`examples/status-history.jsonl`](../../examples/status-history.jsonl) and the
collector-normalized [`examples/sample-records.jsonl`](../../examples/sample-records.jsonl).
They come from fixtures, not a live government download.

## Tests

The suite covers:

- CSV quoting, embedded newlines, BOM, CRLF, delimiter sniffing, Windows-1252
  fallback and unterminated quotes.
- Date formats, CDMX offsets, historical DST, invalid/sentinel dates and Excel
  serials.
- Accent/case-insensitive alcaldía matching, missing alcaldía, coordinate
  validation, X/Y swaps and bbox flags.
- Status and category mapping, including keeping traffic accidents distinct.
- PII redaction and PII-column exclusion.
- Header aliases, duplicate headers and column-count mismatches.
- Stable dedupe keys, content hashes, status-change detection and checkpoints.
- CKAN parsing, one-resource-per-year selection, DataStore pagination and export
  limits.
- Streaming download checksums, 304 responses, retries, HTML error pages and
  size limits.
- End-to-end fixture import, incremental skip, `--force` change detection,
  `--limit`, `--dry-run`, missing-alcaldía-column failure and validation.
- Browser safety gates: default-off discovery, missing approval, unverified
  terms and config version checks.
- Ingestion adapter mapping to `OfficialRecordIngestInput`, license verdicts,
  status observations, byte-identical repeat exports and unchanged-record
  idempotency.
- Scheduler due calculation, jitter, staleness, backoff, approval gates, retry
  limits and failure-ledger behaviour.

Current count: **129 tests across 18 files**.

```bash
npm test
```

The live government site is never required. Network access is only used by
explicit live commands.

## Scheduling

Synchronization is implemented but **off by default**. It requires all three of:
`enabled: true` in the policy, `VOTAVIA_0311_LIVE=1`, and
`VOTAVIA_0311_SCHEDULE_APPROVED=1`.

```bash
npm run sync:0311 -- --status    # read-only health snapshot
npm run sync:0311                # run only if due
npm run sync:0311 -- --force     # bypass the due check, still gated
```

Defaults: daily metadata check, monthly full refresh, max 2 run attempts,
exponential backoff capped at 24 h, 1 request / 1.5 s. See
[`docs/scheduling.md`](docs/scheduling.md) for cron/systemd/launchd examples and
the failure-reporting model.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/0311-dashboard-discovery.md`](docs/0311-dashboard-discovery.md) | Dashboard investigation and its conclusive negative result |
| [`docs/coverage-and-access.md`](docs/coverage-and-access.md) | Years, freshness, missing fields, access conditions, reuse status |
| [`docs/field-mapping.md`](docs/field-mapping.md) | Source columns and normalization rules |
| [`docs/handoff.md`](docs/handoff.md) | Session 1 ingestion contract and upsert algorithm |
| [`docs/session4-public-schema.md`](docs/session4-public-schema.md) | Approved public fields for Session 4 |
| [`docs/scheduling.md`](docs/scheduling.md) | Scheduler policy, exit codes, failure reporting |
| [`docs/access-request-email.md`](docs/access-request-email.md) | Draft reuse clarification (not sent) |

## Verified official sources

| Source | URL |
| --- | --- |
| CKAN dataset | `https://datos.cdmx.gob.mx/dataset/0311` |
| CKAN dataset UUID | `529aac27-d1c1-426f-8c45-fd76fba43bf4` |
| Dashboard | `https://tablero311.cdmx.gob.mx/` |

Known historical resource IDs: 2019 `84bfe107-c6b5-4c9b-8f7c-69c65cf354bc`,
2020 `710ec3c1-7739-436f-b76a-99c64bd69d8a`, 2021
`bcc682eb-ffc5-4d42-a202-2475fb006e3d`, 2022
`253cd343-e420-49a6-b795-1038ee4073a9`, 2023
`d2578dff-f4f3-4202-974c-a75ef9110f5b`, 2024
`44913088-806d-4f80-acca-1409a8225e9c`. The collector does not rely on this
list; it discovers resources at runtime.

## Licensing and privacy

- Historical CKAN metadata declares **CC-BY-4.0-ESP**. The collector reads the
  actual value at runtime and marks missing/`notspecified` licenses
  `unverified`.
- Dashboard terms and redistribution rights are **unverified**. Do not publish
  dashboard-derived data until `datosabiertos@cdmx.gob.mx` clarifies them.
- Required attribution: Gobierno de la Ciudad de México — Portal de Datos
  Abiertos CDMX, conjunto «Solicitudes *0311».
- Known PII columns are excluded. Emails, phones, CURP, RFC and common named-person
  patterns are redacted from free text. This is not a full privacy review; never
  publish raw source rows.
- The draft clarification email is in
  [`docs/access-request-email.md`](docs/access-request-email.md). It has not been
  sent, and no permission has been granted.

## Architecture

```text
src/
  adapters/       CKAN package parsing, DataStore paging, streaming downloads
  browser/        Guarded Playwright discovery and collection
  commands/       discover / import / collect / validate
  lib/            HTTP, files, hashes, time zones, logging
  normalization/  Dates, statuses, categories, geography, PII, records
  parsers/        Encoding detection, streaming CSV, schema aliases
  provenance/     Run manifests and license status
  state/          Resource checkpoints and record index
  validation/     Record and batch validation
  cli.ts          Command-line entry point
```

See [`docs/field-mapping.md`](docs/field-mapping.md) for the complete field
contract and normalization rules.

## Troubleshooting

**`ERR_TUNNEL_CONNECTION_FAILED`, DNS failure or timeout** — the CDMX host is
not reachable from the current network. Use fixtures or run live discovery from
a normal network; the collector does not bypass network controls.

**`BROWSER_COLLECTION_DISABLED`** — this is expected. Browser collection stays
off until access/reuse terms are reviewed. Do not set the approval variable just
to silence the error.

**`DASHBOARD_NOT_CONFIGURED`** — run discovery, review the JSON, then create a
config with real selectors and `terms_verified: true`.

**`EXPORT_LIMIT`** — the CKAN DataStore reports more rows than the configured
maximum. Raise `--max-records` deliberately or ingest in a reviewed, bounded
way; the collector will not silently truncate.

**`SCHEMA_INVALID` missing alcaldía** — the source file does not expose an
alcaldía field. Inspect the header report; use `--all-alcaldias` only if the
geographic filter is no longer required.

## Non-goals

- Writing into the VotaVía database or application schema.
- Community verification of government statuses.
- Geocoding, address completion or coordinate fabrication.
- Bypassing authentication, CAPTCHA, robots controls or rate limits.
- Claiming legal permission or redistribution clearance.
