# Public exposure contract for Session 4 (read-only API)

This document tells Session 4 exactly which official-record fields may be
published, which must never be published, and the precondition that gates the
whole record.

It does not build the API. Session 4 owns that.

## Precondition: redistribution verdict

Publish an official record **only** when `redistribution === "allowed"`.

| Verdict | Action |
| --- | --- |
| `allowed` | Publish, with attribution |
| `restricted` | Do not publish until reviewed |
| `unknown` | Do not publish |

Dashboard-derived records are always `unknown` and must stay unpublished.

## Approved fields

```json
{
  "source_system": "cdmx_0311",
  "source_dataset": "0311",
  "source_url": "https://datos.cdmx.gob.mx/dataset/0311/resource/…",
  "external_folio": "CUH-2024-0003",
  "original_category": "Fuga de agua",
  "original_status": "Concluido",
  "status_normalized": "resolved",
  "description": "Fuga de agua en la banqueta. Contacto: [redacted:phone].",
  "reported_at": "2024-04-03T11:15:00-06:00",
  "source_closed_at": "2024-04-05",
  "alcaldia": "Cuauhtémoc",
  "colonia": "Centro Histórico",
  "latitude": 19.4352,
  "longitude": -99.1412,
  "responsible_agency": "SACMEX",
  "data_quality_flags": ["pii_phone_redacted"],
  "license": "CC-BY-4.0-ESP",
  "license_url": "https://creativecommons.org/licenses/by/4.0/deed.es",
  "attribution": "Gobierno de la Ciudad de México — Portal de Datos Abiertos CDMX, conjunto «Solicitudes *0311» (ADIP).",
  "redistribution": "allowed",
  "last_synced_at": "2026-10-30T19:50:08.584Z"
}
```

The allowlist is also exported programmatically as
`PUBLIC_FIELD_ALLOWLIST` from `src/adapters/license-policy.ts`, so a test can
assert the API never widens it silently.

## Fields that must never be published

| Field | Reason |
| --- | --- |
| `official_record_id` | Internal surrogate key |
| `source_record_id` | Internal idempotency identity; `external_folio` is the public handle |
| `dedupe_key` | Collector internals |
| `content_hash` | Collector internals |
| `sync_run_id` | Collector internals |
| `provenance` | Contains raw row hashes and pipeline detail |
| `raw_payload` | Not stored, and would carry PII |
| `address_hint` | Re-identification risk; always null |
| `license_verified_from` | Internal review state |
| `redistribution_note` | Internal legal note |
| `first_seen_at` | Collector internals |

## Presentation rules

1. **`title` is null.** Compose a display label from
   `original_category` + `colonia` (for example “Fuga de agua — Centro
   Histórico”). Do not store a synthesized title as if the government published
   it.
2. **Always render `attribution`** next to official records, with `license`
   and a link to `license_url`.
3. **Never derive community verification from `status_normalized`.** A
   government `resolved` is not a community-verified resolution. Keep
   `original_status` visible alongside any normalized value, and label it as the
   government's status.
4. **Show `data_quality_flags`** where they affect interpretation — missing
   coordinates, invalid coordinates, missing date, ambiguous date, redacted PII.
5. **Filter by `is_active`**; the collector never emits `false`, but the field
   exists so a future reviewed deactivation can propagate.
6. **Do not paginate on `external_folio`.** It may be null or repeated; use the
   internal `official_record_id` as the API cursor while exposing
   `external_folio` as a label.

## Suggested public shape

```ts
export interface PublicOfficialRecord {
  external_folio: string | null;
  source: "cdmx_0311";
  dataset: "0311";
  source_url: string | null;
  category: string | null;          // original_category
  status: string | null;            // original_status
  status_normalized: string | null; // advisory
  description: string | null;
  reported_at: string | null;
  closed_at: string | null;
  alcaldia: string | null;
  colonia: string | null;
  latitude: number | null;
  longitude: number | null;
  responsible_agency: string | null;
  data_quality_flags: string[];
  attribution: string;
  license: string | null;
  license_url: string | null;
  last_synced_at: string;
}
```

## Aggregates

Counts by alcaldía, colonia, category or status may be published when they are
computed from `allowed` records only. Do not mix dashboard aggregates into a
CKAN-derived statistic: their provenance and terms differ.

## Checklist before enabling the endpoint

- [ ] Every served record has `redistribution === "allowed"`.
- [ ] Denylisted fields are absent from every response.
- [ ] `attribution` is rendered with `license` and `license_url`.
- [ ] Government status is visually distinct from community verification.
- [ ] `data_quality_flags` are surfaced.
- [ ] No raw source rows, PII columns or `raw_payload` are reachable.
- [ ] Dashboard-derived data is excluded.
