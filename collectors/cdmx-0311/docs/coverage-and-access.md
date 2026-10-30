# *0311 observed coverage, freshness and access conditions

Last updated: 2026-10-30. Every statement below is either observed in published
metadata or marked **unverified**. Nothing here is a permission grant.

## 1. Coverage

### Years

| Year | Resource | Format | Status |
| --- | --- | --- | --- |
| 2019 | `84bfe107-c6b5-4c9b-8f7c-69c65cf354bc` | CSV | Resource page observed |
| 2020 | `710ec3c1-7739-436f-b76a-99c64bd69d8a` | CSV | Resource page observed |
| 2021 | `bcc682eb-ffc5-4d42-a202-2475fb006e3d` | CSV | Resource page observed |
| 2022 | `253cd343-e420-49a6-b795-1038ee4073a9` | CSV | Resource page observed; alternate view `2722a030-020c-497c-bef8-a8c6188f7aaa` also indexed |
| 2023 | `d2578dff-f4f3-4202-974c-a75ef9110f5b` | CSV | Resource page observed |
| 2024 | `44913088-806d-4f80-acca-1409a8225e9c` | CSV | Observed; dataset page last updated 2024-04-01 |

**No 2025 or 2026 resource was found.** The newest observed resource describes
coverage only through **2024-03-31**. Treat "most recent data" as 2024-Q1 until
a live `discover:0311` proves otherwise.

Dataset page snippets also showed **TSV, JSON and XML** downloads. The collector
prefers CSV/TSV/JSON and records alternates in the resource manifest.

### Geographic coverage

The dataset is city-wide (16 alcaldías). This collector targets **Cuauhtémoc**
by default. Rows whose alcaldía is missing are dropped unless
`--include-missing-alcaldia` is set, and are then labelled `No especificada`
rather than assigned to Cuauhtémoc.

### Fields observed

Confirmed in indexed CKAN resource pages:

`fecha_solicitud`, `hora_solicitud`, `fecha_concluido`, `alcaldia`,
`colonia_datos`, `0311_colonia_registro`, `codigo_postal_solicitud`, `latitud`,
`longitud`.

The **complete** header could not be retrieved because the host was
unreachable. The importer maps by alias and records the detected schema in every
run manifest, so a live run will reveal the real column set without code
changes.

### Fields most likely missing in production

These are absent from the observed subset and are emitted as `null`, never
invented:

| Field | Expected state |
| --- | --- |
| `source_created_at` | Not published |
| `updated_at` | Not published in observed columns |
| Street address | Not published (deliberately not collected) |
| Title | Not published; UI composes a label |
| Person/contact data | Excluded by policy, even if present |

### Record volume

Not measured. The landing page exposed alcaldía aggregates only (for example
Coyoacán 19,569; Azcapotzalco 10,362). Cuauhtémoc's count was not captured, and
aggregates cannot be used to predict the filtered row count.

## 2. Freshness

| Signal | Observation |
| --- | --- |
| Dataset `metadata_modified` | `2024-04-01` |
| Newest resource coverage | Through 2024-03-31 |
| Update cadence | Appears approximately quarterly/annual, not real-time |
| Live verification | Not possible from this environment |

Because the source is not real-time, the scheduler defaults to a **daily
metadata check** and a **monthly full refresh**. That is already more frequent
than the data changes.

## 3. Access conditions

### CKAN

| Item | Status |
| --- | --- |
| Public read access | Yes — public open-data portal |
| Authentication required | No |
| Documented API | Yes: `api/3/action/package_show` and `datastore_search` |
| Rate limit | **Not published** — collector self-limits to 1 request / 1.5 s |
| Automated access terms | Not explicitly reviewed |
| Redistribution | CC-BY-4.0-ESP per published metadata; attribution required |

### Dashboard

| Item | Status |
| --- | --- |
| Public read access | Landing page is public |
| Structured API | **Not found / unverified** |
| Export | **Not found / unverified** |
| Automated access permitted | **Unverified** |
| Redistribution permitted | **Unverified** |

The collector never automates the dashboard unless a human has recorded
`terms_verified: true` in a reviewed config *and* set both approval variables.

## 4. Reuse permissions

| Source | Redistribution verdict emitted | Basis |
| --- | --- | --- |
| CKAN historical CSV, license present | `allowed` | Published CC-BY-4.0-ESP |
| CKAN historical CSV, license absent | `unknown` | No license published |
| Dashboard | `unknown` | No clarified reuse terms |

These verdicts are recorded per record (`redistribution`,
`redistribution_note`) and per batch, so Session 4 can gate publication
mechanically instead of relying on memory.

**Unverified items that still need written confirmation** from
`datosabiertos@cdmx.gob.mx`:

- Whether CC-BY-4.0-ESP extends to the dashboard's displayed data.
- Whether automated/bulk access to the dashboard is permitted.
- Whether redistribution of a normalized, derived dataset is permitted.
- The preferred attribution string.
- The full data dictionary and status vocabulary.
- Whether folios are stable across annual files.
- Whether descriptions can contain personal data.

See [`access-request-email.md`](access-request-email.md). It has not been sent.

## 5. What a live run must confirm

1. Whether a 2025/2026 resource now exists.
2. The real full column set per year and whether it changed between years.
3. Whether `folio` is populated and unique, or whether natural keys are needed.
4. Whether coordinates are actually populated at scale.
5. Cuauhtémoc row counts and the share with missing coordinates.
6. Whether `datastore_active` is true for any resource (enables filtered pulls).
7. The real status vocabulary, to extend `status.ts`.
8. Whether the dashboard exposes any structured endpoint, via guarded discovery.
