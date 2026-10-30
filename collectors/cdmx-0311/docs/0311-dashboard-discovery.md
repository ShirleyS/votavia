# *0311 dashboard and CKAN discovery

Status as of **2026-10-30** (second pass). This document separates what was directly observed
from what still needs a live, human-reviewed browser session. It does **not**
grant permission to scrape, redistribute or automate access.

## 1. Official sources

| Source | URL | Status |
| --- | --- | --- |
| CKAN dataset | `https://datos.cdmx.gob.mx/dataset/0311` | Confirmed page and metadata in the public search index |
| CKAN dataset UUID | `529aac27-d1c1-426f-8c45-fd76fba43bf4` | Observed in localized CKAN URLs |
| Dashboard | `https://tablero311.cdmx.gob.mx/` | Public landing page title confirmed; live rendering blocked from this environment |

The CKAN dataset is titled **“Solicitudes *0311”** and is published by the
Agencia Digital de Innovación Pública (ADIP). The historical dataset lists the
**CC-BY-4.0-ESP** license. The collector reads the license from CKAN metadata at
runtime instead of assuming it; a missing or `notspecified` value becomes
`unverified`.

### Historical resources observed

These resource IDs and year labels were recovered from indexed CKAN resource
pages and the dataset page:

| Year | CKAN resource ID | Notes |
| --- | --- | --- |
| 2019 | `84bfe107-c6b5-4c9b-8f7c-69c65cf354bc` | CSV |
| 2020 | `710ec3c1-7739-436f-b76a-99c64bd69d8a` | CSV |
| 2021 | `bcc682eb-ffc5-4d42-a202-2475fb006e3d` | CSV |
| 2022 | `253cd343-e420-49a6-b795-1038ee4073a9` | CSV; an alternate 2022 view `2722a030-020c-497c-bef8-a8c6188f7aaa` was also indexed |
| 2023 | `d2578dff-f4f3-4202-974c-a75ef9110f5b` | CSV |
| 2024 | `44913088-806d-4f80-acca-1409a8225e9c` | CSV; dataset page last updated 2024-04-01 |

Dataset-page snippets also showed downloadable formats **CSV, TSV, JSON and
XML**. The collector selects one canonical CSV/TSV/JSON resource per year,
retains alternate resource IDs in the manifest and prefers a resource with an
active CKAN DataStore when duplicates exist.

Do not treat this table as a hardcoded year list. `discover:0311` calls
`package_show` first, falls back to the dataset UUID and then to the dataset
HTML page. Years are extracted from resource names, descriptions, URLs and
metadata modification dates.

### Historical column names observed

Indexed CKAN resource pages exposed these column names:

`fecha_solicitud`, `hora_solicitud`, `fecha_concluido`, `alcaldia`,
`colonia_datos`, `0311_colonia_registro`, `codigo_postal_solicitud`, `latitud`,
`longitud`.

The complete header was not available while the CDMX hosts were unreachable.
The importer therefore maps headers by inclusive aliases and reports the actual
detected schema in the manifest instead of assuming a fixed column order.

## 2. Dashboard discovery

### What was confirmed

- The landing page title is **“Tablero de Solicitudes *0311 Locatel”**.
- The site describes the **Sistema Unificado de Atención Ciudadana**.
- A map/crawl of the landing page returned only one URL. Its visible text
  included alcaldía-level counts, for example:
  - Álvaro Obregón: 10,095
  - Azcapotzalco: 10,362
  - Benito Juárez: 10,270
  - Coyoacán: 19,569
- Those counts are aggregates. They do **not** establish that individual
  records, coordinates, identifiers or statuses are exposed.

- The dashboard is **built and operated by CentroGeo** for ADIP. The search
  index description of the landing page reads: *“Habilitado por CentroGeo,
  muestra toda la información de las solicitudes de la ciudadanía y permite
  darles seguimiento.”* CentroGeo is a CONAHCYT public research center; its
  institutional program document also cites the *0311-LOCATEL board as a
  deployed product with more than 11,000 visits.

  This is useful for a human follow-up (CentroGeo may publish a technical
  report or accept a direct data request), but it does **not** establish a
  public API. No CentroGeo developer documentation, API reference, export
  guide, GeoServer/ArcGIS endpoint or bulk-download page was found in repeated
  searches.

### What could not be verified

Live rendering and scraping of `tablero311.cdmx.gob.mx` failed from this
environment on 2026-10-30, on two independent attempts:

- Direct navigation reported `ERR_TUNNEL_CONNECTION_FAILED`.
- A text-rendering proxy timed out while waiting for `networkidle`.
- Sandbox DNS resolution blocked ordinary `curl` access.
- Browser control was unavailable.
- The same failure occurred against `datos.cdmx.gob.mx`, `archivo.datos.cdmx.gob.mx`
  and `sig.cdmx.gob.mx`, through direct fetch, a text-rendering proxy and a
  stealth browser engine. This is a network-path failure, not a site-specific
  rejection.

Therefore the following remain **unverified**, not “absent”:

1. Whether the dashboard is usable without authentication.
2. Whether Cuauhtémoc can be selected.
3. Whether neighborhood, category, status and date filters exist.
4. Whether data is shown as individual points, records, aggregates or a mix.
5. Whether CSV/XLSX/JSON export exists.
6. Whether export buttons trigger downloads or network requests.
7. Whether a public structured API exists.
8. Whether pagination, date limits or export caps apply.
9. Whether individual IDs, dates, coordinates and resolution statuses exist.
10. Whether the site’s terms restrict automated access or reuse.

Do not claim a dashboard API or export exists until `discover:0311
--allow-browser` has captured and a human has reviewed the requests.

### Current conclusion

**CKAN is the only verified structured access path.** For the dashboard, the
evidence supports “no publicly documented API or export”, not “there is none”:
the page could not be inspected at all. Until a human runs the guarded
discovery from a normal network, the dashboard must be treated as:

| Question | Answer |
| --- | --- |
| Documented API | None found |
| Documented export | None found |
| Record-level data confirmed | No — only alcaldía aggregates observed |
| Automated access permitted | Unverified |
| Data reuse / redistribution permitted | Unverified |
| Suitable for scheduled collection | **No** — blocked pending verification |

The collector therefore defaults to CKAN-only ingestion and keeps every
dashboard path behind three explicit gates.

## 3. How to complete dashboard discovery

Install the collector dependencies, then run:

```bash
npm run discover:0311 -- --allow-browser
```

The command writes a run directory under `data/official-0311/discovery/0311/`
containing:

- `discovery.json`: cookies-free request/response metadata, status codes,
  content types, page title, final URL, form controls, table/iframe counts,
  export-like links and an auth/CAPTCHA heuristic.
- `dashboard.png`: a full-page screenshot.
- `downloads/`: empty unless `--allow-export` was explicit.

It does **not** save response bodies, click export controls by default, bypass a
login, solve a CAPTCHA, change a rate limit or evade an access restriction.

After review, record the real selectors and endpoint patterns in
`dashboard.config.json`, using `dashboard.config.example.json` as a starting
point. Only then set `terms_verified: true` and run the guarded collection.

## 4. Access and reuse terms

| Item | Status |
| --- | --- |
| CKAN historical license | `CC-BY-4.0-ESP` in published metadata; verify at runtime |
| CKAN attribution | Government of Mexico City / ADIP / Portal de Datos Abiertos CDMX |
| Dashboard license | **Unverified** |
| Dashboard automated access | **Unverified** |
| Redistribution of dashboard-derived records | **Unverified** |
| Redistribution of CKAN-derived records | Subject to CC-BY-4.0-ESP and attribution; legal review still recommended |

The draft clarification request is in
[`access-request-email.md`](access-request-email.md). No permission has been
granted, and the draft has not been sent.

## 5. Safety design in this collector

- Browser discovery is off unless `--allow-browser` is passed.
- Browser collection requires all three: `--allow-browser`, the exact
  `VOTAVIA_0311_BROWSER_APPROVED=1` environment value, and a reviewed config
  with `terms_verified: true`.
- Export clicks require separate `--allow-export` consent.
- Authentication walls, CAPTCHA text and `access denied` pages are recorded and
  treated as a stop condition, never bypassed.
- HTTP requests use an honest user agent, bounded retries, a minimum interval
  and a maximum response size.
- HTML error pages are rejected instead of being parsed as CSV.

## 6. Immediate next steps

1. Run browser discovery from a network where the CDMX hosts resolve.
2. Save the exported HAR or the `discovery.json` and review every XHR/fetch URL.
3. Confirm whether individual records or only aggregates are available.
4. Ask `datosabiertos@cdmx.gob.mx` to confirm dashboard reuse, automation and a
   bulk endpoint.
5. Keep the CKAN CSV pipeline as the authoritative historical source.
6. Do not publish dashboard-derived data until terms are documented.
