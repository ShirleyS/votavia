# *0311 field mapping and normalization

The collector preserves every government label it uses, keeps unknown values
visible and never invents an ID, coordinate, date or status.

## Input mapping

Headers are canonicalized by trimming, removing accents, lowercasing and
replacing punctuation with underscores. Mapping uses explicit aliases first and
then a narrow latitude/longitude suffix fallback.

| Output field | Accepted source headers (examples) |
| --- | --- |
| `source_record_id` | `folio`, `folio_solicitud`, `id_solicitud`, `numero_solicitud`, `solicitud_id`, `ticket` |
| `reported_date` | `fecha_solicitud`, `fecha_reporte`, `fecha_creacion`, `fecha_registro` |
| `reported_time` | `hora_solicitud`, `hora_reporte`, `hora_creacion` |
| `closed_date` | `fecha_concluido`, `fecha_conclusion`, `fecha_cierre`, `fecha_resolucion` |
| `updated_date` | `fecha_actualizacion`, `fecha_modificacion`, `ultima_actualizacion` |
| `status` | `estatus`, `estado`, `situacion`, `estatus_solicitud` |
| `category` | `categoria`, `clasificacion`, `tema`, `tipo_problema` |
| `subcategory` | `subcategoria`, `subtipo`, `subtema` |
| `request_type` | `tipo_solicitud`, `tipo` |
| `description` | `descripcion`, `detalle`, `texto_solicitud`, `contenido` |
| `alcaldia` | `alcaldia`, `delegacion`, `demarcacion`, `municipio` |
| `colonia` | `colonia_datos`, `colonia`, `colonia_solicitud` |
| `colonia_registro` | `0311_colonia_registro`, `colonia_registro`, `colonia_311` |
| `latitude` | `latitud`, `lat`, `coordenada_y` |
| `longitude` | `longitud`, `lon`, `lng`, `coordenada_x` |
| `responsible_agency` | `dependencia`, `dependencia_responsable`, `unidad_administrativa`, `area_responsable` |

`colonia_datos` is preferred for `colonia`; `0311_colonia_registro` is a
fallback. The selected source column is written to `colonia_source_field`.
`tipo_solicitud` is a request type, not treated as a topic category when a
`categoria`/`subcategoria` exists.

Required structure:

- `alcaldia` must be present unless `--all-alcaldias` or
  `--include-missing-alcaldia` is explicit.
- A row must have at least one stable identity signal: source ID, reported date
  or description. A row number alone is never an identity.

## Record contract (version 1.0.0)

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | string | Collector schema version |
| `source` | `"cdmx_0311"` | Fixed source key |
| `source_record_id` | string \| null | Government folio/ID, preserved verbatim |
| `source_url` | string | CKAN resource page used for provenance |
| `source_dataset` | `"0311"` | Dataset identifier |
| `source_license` | string | CKAN license or `unverified` |
| `source_license_verified_from` | enum | `ckan_metadata`, `dataset_page` or `unverified` |
| `alcaldia` | string | Canonical target name, or `No especificada` |
| `original_alcaldia` | string \| null | Government spelling |
| `colonia` | string \| null | `colonia_datos` or fallback |
| `colonia_source_field` | string \| null | Which source column supplied it |
| `latitude` | number \| null | Null if absent, incomplete or invalid |
| `longitude` | number \| null | Null if absent, incomplete or invalid |
| `original_category` | string \| null | Government category, verbatim |
| `original_subcategory` | string \| null | Government subcategory, verbatim |
| `category_source_field` | string \| null | Source column used for the label |
| `normalized_category` | VotaVía category \| null | `road_damage`, `street_lighting`, `traffic_signals`, `sidewalk_accessibility`, `trees_vegetation`, `waste_sanitation`, `parks_public_spaces`, `other` |
| `collector_category` | string \| null | Richer collector taxonomy, including water, accidents and non-infrastructure |
| `category_normalization` | object | `{ method, confidence, note }` |
| `is_infrastructure_related` | boolean \| null | `null` when the source does not support a decision |
| `description` | string \| null | Scrubbed and bounded to 4,000 chars |
| `reported_at` | ISO date/datetime \| null | Date-only when no time was published |
| `reported_at_precision` | `date` \| `datetime` \| null | Never invented |
| `closed_at` | ISO date/datetime \| null | From `fecha_concluido` |
| `updated_at` | ISO date/datetime \| null | Only from an explicit update column |
| `original_status` | string \| null | Government status, verbatim |
| `normalized_status` | enum | `received`, `in_progress`, `resolved`, `closed_no_action`, `unknown` |
| `responsible_agency` | string \| null | Scrubbed agency label |
| `collected_at` | ISO datetime | Collector timestamp |
| `extraction_method` | enum | `ckan_csv`, `ckan_datastore`, `dashboard_api`, `browser` |
| `raw_reference` | object | Resource ID/name/year, file, data row number, row SHA-256 |
| `dedupe_key` | string | `0311:id:…`, `0311:natural:…` or `0311:content:…` |
| `record_hash` | SHA-256 | Stable content hash; excludes collection time and row position |
| `data_quality_flags` | string[] | Sorted, explainable flags |

## Dates

Accepted formats include `YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`,
`DD-MM-YYYY`, compact `YYYYMMDD` and Excel serial dates. Mexican
`DD/MM/YYYY` is the default when a date is ambiguous; the record is flagged
`ambiguous_date_assumed_dmy` instead of silently changing conventions.

When a separate time is published, it is combined in `America/Mexico_City` and
written with an explicit offset (`-06:00`, or `-05:00` during historical DST).
When no time exists, the output stays date-only. The collector never writes a
midnight timestamp just to satisfy a schema.

## Statuses

Government statuses are preserved in `original_status`. The normalized status
is a separate convenience field:

- `received`: recibida, pendiente, registrada, nueva, en espera.
- `in_progress`: en proceso, asignada, en atención, en seguimiento, en revisión.
- `resolved`: concluida, resuelta, atendida, finalizada, terminada.
- `closed_no_action`: cancelada, improcedente, rechazada, duplicada, sin acción.
- `unknown`: missing or unmapped values, with `unmapped_status`/`missing_status`.

`resolved` is a **government status**, not VotaVía community verification. Do not
copy it into a community verification field.

## Categories

The collector keeps a richer taxonomy so that water, accidents and social
services are not forced into pavement categories:

- Infrastructure: `road_damage`, `street_lighting`, `traffic_signals`,
  `sidewalk_accessibility`, `trees_vegetation`, `waste_sanitation`,
  `parks_public_spaces`, `water_drainage`, `public_space_deterioration`.
- Distinct non-infrastructure: `traffic_accident`, `noise_environment`,
  `animal_services`, `social_services`, `other`.

`traffic_accident` maps to `normalized_category = "other"` and
`is_infrastructure_related = false`; it is never classified as a pothole.
`water_drainage` and `public_space_deterioration` map to `other` in the current
VotaVía app taxonomy but remain distinct in `collector_category` and are marked
as infrastructure-related.

Category matching order: exact app-label alias → government label/subcategory →
description keyword. The method and heuristic confidence are recorded. A
government label with no mapping stays in `original_category`; the collector
does not discard it.

## Coordinates

- Decimal comma is accepted.
- Both coordinates must be present together.
- Out-of-range values become null and are flagged.
- An unmistakable X/Y swap is corrected and flagged `coordinates_swapped`.
- Points outside an approximate CDMX/Cuauhtémoc envelope are flagged, not
  discarded, because official coordinates can be coarse.
- No geocoding, interpolation or neighborhood-centroid substitution is done.

## Personal information

- Columns that look like names, phones, emails, CURP, RFC or personal addresses
  are excluded from output (`pii_columns_excluded`).
- Emails, Mexican phone patterns, CURP, RFC and common “mi nombre es …” patterns
  are redacted from free text.
- The description is bounded to 4,000 characters.
- Free-text name detection is best-effort; it is not a substitute for a privacy
  review. Do not publish raw source rows.
- `raw_reference` contains only hashes and position metadata, not raw field
  values.

## Deduplication and change detection

Identity precedence:

1. `0311:id:<normalized government folio>` when a source ID exists.
2. `0311:natural:<SHA-256>` from alcaldía, colonia, coordinates, reported date,
   category and normalized description.
3. `0311:content:<SHA-256>` only when the natural components are empty.

Row position is never part of either key. `record_hash` covers substantive
fields but excludes `collected_at`, `row_number` and run identifiers, so the
same record re-imported from a shifted CSV remains unchanged.

When the same key appears again with a different hash, the run writes a
`changes.jsonl` entry with the changed fields and the previous/current snapshots.
Within one batch, an identical duplicate is suppressed; a conflicting duplicate
is counted and written to `rejected.jsonl` with both hashes rather than silently
picking a winner.

## Quality flags

Common flags include: `missing_coordinates`, `incomplete_coordinates`,
`invalid_coordinates`, `coordinates_swapped`, `coordinates_outside_cdmx_bbox`,
`coordinates_outside_cuauhtemoc_bbox`, `missing_date`, `invalid_closed_date`,
`ambiguous_date_assumed_dmy`, `assumed_mdy_order`, `excel_serial_date`,
`missing_source_record_id`, `missing_alcaldia`, `unmapped_status`,
`unmapped_category`, `not_infrastructure`, `pii_*_redacted`,
`description_truncated` and `column_count_mismatch`.

## From collector record to ingestion record

`src/adapters/ingest.ts` maps a `NormalizedOfficialRecord` into Session 1's
`OfficialRecordIngestInput`. The differences that matter:

| Collector field | Ingest field | Transformation |
| --- | --- | --- |
| `source_record_id` | `source_record_id` | Falls back to `dedupe_key` when null |
| — | `external_folio` | The government folio, verbatim |
| `normalized_status` | `status_normalized` | Advisory only |
| `closed_at` | `source_closed_at` | Direct |
| `alcaldia = "No especificada"` | `alcaldia` | → `null` (never invent a jurisdiction) |
| `record_hash` | `content_hash` | Direct |
| `raw_reference` | `provenance` | Nested, plus category normalization detail |
| — | `title` | Always `null`; not published by the source |
| — | `address_hint` | Always `null`; not collected |
| — | `is_active` | Always `true`; absence never deactivates |

`source_license` / `source_license_verified_from` are re-derived into
`license` / `license_verified_from` plus a `redistribution` verdict from
`src/adapters/license-policy.ts`.

## License verdicts

| Published license | `redistribution` |
| --- | --- |
| `CC-BY-4.0-ESP` | `allowed` (attribution required) |
| Other `CC-*` variants | `restricted` |
| Missing / `notspecified` | `unknown` |
| Any dashboard source | `unknown` |

`unknown` blocks public exposure. See
[`session4-public-schema.md`](session4-public-schema.md).

See [`coverage-and-access.md`](coverage-and-access.md) for observed coverage and
access conditions, and [`handoff.md`](handoff.md) for the ingestion algorithm.
