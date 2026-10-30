# Contrato de ingesta — Tablero 0311 CDMX (Sesión 6 / Ismael)

Este documento define la frontera entre el **colector oficial** (Sesión 6) y la
**base de datos canónica** (Fase 1/2). Session 6 es dueña de extracción, normalización y
sincronización programada. Esta sesión **no** implementa el colector.

Estado: **alineado con el colector real** de Session 6
(`votavia-official-data/collectors/cdmx-0311/src/types.ts`, schema `1.0.0`). Si el colector cambia
su esquema, actualiza la tabla de mapeo de la sección 2 y el adaptador
`src/server/services/official-record-adapter.ts`. La migración
`supabase/migrations/0003_shared_civic_model.sql` implementa este contrato.

---

## 1. Regla de separación

| Dato | Tabla | Quién escribe |
| --- | --- | --- |
| Reporte ciudadano | `cases` | VotaVía (API interna) |
| Caso compartido | `issues` | VotaVía |
| Registro oficial importado | `official_records` | Sesión 6 (vía RPC) |
| Historial de estado oficial | `official_record_status_history` | Trigger/RPC de la base |
| Vínculo | `issue_official_records` | Sesión 6 o gobierno |

Un registro oficial **nunca** se inserta en `cases` y **nunca** se cuenta como reporte ciudadano.
`origin = 'official'` significa que el caso compartido nace solo de datos de gobierno.

---

## 2. Mapeo exacto desde el colector

El adaptador canónico es `fromCollectorRecord()` en
`src/server/services/official-record-adapter.ts`. Convierte un `NormalizedOfficialRecord` en la
fila de `official_records` sin dependencia de build entre workspaces.

| Colector (`NormalizedOfficialRecord`) | Canonical (`official_records`) | Notas |
| --- | --- | --- |
| `source` (`"cdmx_0311"`) | `source_system` | Valor canónico de la fuente |
| `source_record_id` | `source_record_id` | Si es `null`, se usa `dedupe_key` |
| `dedupe_key` | `dedupe_key` | Trazabilidad del criterio de deduplicación |
| `source_dataset` | `source_dataset` | `"0311"` |
| — | `external_folio` | No viene en el colector; queda `null` |
| `source_url` | `source_url` | Página/archivo de origen |
| `original_category` | `original_category` | Texto crudo |
| `normalized_category` | `provenance.normalized_category` | También puede asignarse al issue |
| `original_status` | `original_status` | Texto crudo, manda |
| `normalized_status` | `status_normalized` | `received/in_progress/resolved/closed_no_action/unknown` |
| `description` | `description` | Ya pasa por `scrubPii` del colector |
| `reported_at` | `reported_at` y `source_created_at` | |
| `closed_at` | `source_closed_at` | |
| `updated_at` | `source_updated_at` | |
| `collected_at` | `source_fetched_at`, `first_seen_at`, `last_synced_at` | |
| `latitude` / `longitude` | `latitude` / `longitude` | Nulos si no hay geometría |
| `colonia` | `colonia` | |
| `alcaldia` | `alcaldia` | |
| `responsible_agency` | `responsible_agency` | |
| `schema_version` | `collector_schema_version` | `"1.0.0"` |
| `extraction_method` | `extraction_method` | `ckan_csv`, `ckan_datastore`, `dashboard_api`, `browser` |
| `data_quality_flags` | `data_quality_flags` | `text[]` |
| `record_hash` | `content_hash` | SHA-256 del registro normalizado |
| `source_license` | `license` | |
| `source_license_verified_from` | `license_verified_from` | `ckan_metadata`/`dataset_page`/`unverified` |
| `raw_reference` | `provenance.raw_reference` | Recurso, fila y hash de fila |
| `original_alcaldia`, `original_subcategory` | `provenance.*` | Trazabilidad |
| — | `sync_run_id` | Lo aporta la corrida |
| — | `attribution`, `license_url` | Configurables por fuente |
| — | `redistribution` | `allowed` solo si la licencia fue verificada; si no, `unknown` |
| — | `raw_payload` | **No se usa**: el colector ya redacta PII y entrega `raw_reference` |

Regla de título: el colector no produce `title`; se deja `null` y la UI usa la categoría o la
descripción corta. No inventes títulos en la ingesta.

## 3. Identidad e idempotencia

Clave natural: **`(source_system, source_record_id)`** con restricción `unique`.

- `source_system`: identificador estable de la fuente, sin versiones.
  Valor canónico para el colector: **`cdmx_0311`**. Otras fuentes: `SUAC`, `CDMX-…`.
  El validador acepta mayúsculas o minúsculas pero **no mezcles estilos para una misma fuente**.
- `source_record_id`: identificador inmutable dentro de la fuente. Si el origen no trae id,
  usa el `dedupe_key` del colector (`0311:id:…`, `0311:natural:…`, `0311:content:…`).
  **No** uses el folio como identificador: puede faltar, repetirse o cambiar de formato.
- Reejecutar una sincronización actualiza la fila existente; no crea duplicados.
- `content_hash` (opcional) permite omitir escrituras cuando el registro no cambió.

```sql
select * from public.upsert_official_record($1::jsonb);
-- returns (official_record_id uuid, created boolean)
```

La función es `security definer`, solo ejecutable por `service_role`. Es la **única** vía de
escritura recomendada.

---

## 4. Validador compartido

`src/server/validation.ts` exporta `officialRecordIngestSchema` (Zod). El colector puede importarlo
para validar antes de llamar al RPC, de modo que ambos lados usen exactamente las mismas reglas:

- `source_system`: 2–60 caracteres, letras/números/`.`, `_`, `-` (canónico: `cdmx_0311`).
- `source_record_id`: requerido, hasta 200 caracteres (usa `dedupe_key` como respaldo).
- `source_url` y `license_url`: URL válida o `null`.
- Fechas: ISO 8601 con zona horaria.
- Coordenadas: ambas o ninguna, dentro de Cuauhtémoc.
- `redistribution`: `allowed` | `restricted` | `unknown` (por defecto `unknown`).
- `content_hash` / `record_hash`: SHA-256 hexadecimal de 64 caracteres.
- `extraction_method`: `ckan_csv` | `ckan_datastore` | `dashboard_api` | `browser`.
- `license_verified_from`: `ckan_metadata` | `dataset_page` | `unverified`.

## 5. Payload aceptado

`upsert_official_record` acepta un JSON con estas claves (todas opcionales salvo las dos primeras):

```jsonc
{
  "source_system": "cdmx_0311",          // requerido
  "source_record_id": "0311-2026-004512",// requerido (o dedupe_key si no hay id)
  "dedupe_key": "0311:id:0311-2026-004512",
  "source_dataset": "0311",
  "external_folio": "CDMX-0311-2026-004512",
  "source_url": "https://tablero311.cdmx.gob.mx/...",
  "original_category": "Bache",
  "original_status": "En proceso",       // texto crudo de la fuente
  "status_normalized": "in_progress",    // received|in_progress|resolved|closed_no_action|unknown
  "title": "Bache en Av. Cuauhtémoc",
  "description": "…",
  "reported_at": "2026-10-01T10:00:00-06:00",
  "latitude": 19.4288,                   // opcional
  "longitude": -99.1551,                 // opcional
  "colonia": "Doctores",
  "alcaldia": "Cuauhtémoc",
  "address_hint": "Av. Cuauhtémoc 123",
  "responsible_agency": "Secretaría de Obras y Servicios",
  "collector_schema_version": "1.0.0",
  "extraction_method": "ckan_csv",
  "data_quality_flags": ["missing_title"],
  "raw_payload": { "...": "registro original" },
  "provenance": { "dataset": "0311", "snapshot": "2026-10-29" },
  "license": "Datos abiertos CDMX",
  "license_url": "https://datos.cdmx.gob.mx/",
  "attribution": "Gobierno de la Ciudad de México",
  "license_verified_from": "ckan_metadata",
  "redistribution": "allowed",           // allowed | restricted | unknown
  "redistribution_note": null,
  "content_hash": "sha256:…",
  "sync_run_id": "2026-10-29T06:00Z-cuauhtemoc",
  "source_closed_at": null,
  "source_created_at": "2026-10-01T10:00:00-06:00",
  "source_updated_at": "2026-10-02T09:00:00-06:00",
  "source_fetched_at": "2026-10-29T06:00:12-06:00",
  "first_seen_at": "2026-10-29T06:00:12-06:00",
  "is_active": true
}
```

Semántica de actualización: los campos presentes sobrescriben; los ausentes (`null` u omitidos)
conservan el valor previo. Para vaciar un campo usa cadena vacía donde aplique o actualiza
directamente con `service_role` si es imprescindible.

---

## 6. Fechas

| Campo | Significado |
| --- | --- |
| `source_created_at` | Alta del registro en el sistema de origen |
| `source_updated_at` | Última modificación reportada por el origen |
| `source_fetched_at` | Momento en que el colector descargó el dato |
| `first_seen_at` | Primera vez que VotaVía vio el registro |
| `last_synced_at` | Última sincronización correcta (lo escribe la función) |
| `imported_at` | Alta inicial en VotaVía |

Regla: la UI y la API pública muestran **fechas de origen** para el hecho y `last_synced_at` para
la frescura del espejo. Nunca presentes `last_synced_at` como si fuera la fecha del reporte oficial.

---

## 7. Historial de estado

Cada cambio de `original_status` inserta una fila en `official_record_status_history` y marca la
anterior como `is_current = false`. Hay un índice único parcial que garantiza **una sola fila
vigente** por registro.

- No envíes historial desde el colector: solo el estado actual. La base calcula el diff.
- `status_normalized` es advisory; el texto crudo siempre se conserva.
- El historial es de solo agregado: no se actualiza ni se borra.

Para reconstruir el estado actual de la fuente:

```sql
select r.source_system, r.source_record_id, h.status_text, h.changed_at, h.observed_at
from public.official_records r
join public.official_record_status_history h
  on h.official_record_id = r.id and h.is_current
where r.source_system = 'CDMX-0311';
```

---

## 8. Bajas y sincronizaciones parciales

- Una sincronización **parcial** solo actualiza los registros que descargó.
- Al terminar una sincronización **completa** con éxito, llama:

```sql
select public.retire_missing_official_records('CDMX-0311', '2026-10-29T06:00Z-cuauhtemoc');
```

Marca `is_active = false` y `upstream_removed_at = now()` en registros que no aparecieron en ese
`sync_run_id`. No borra filas: el historial y los vínculos con issues se conservan.

- Si un registro reaparece, envíalo de nuevo con `is_active: true`; el mismo `id` se reactiva.
- Nunca borres registros oficiales manualmente: rompe el historial y los vínculos.

---

## 9. Vínculo con casos comunitarios

El vínculo se escribe en `issue_official_records`. El camino recomendado dentro de VotaVía es el
servicio `linkOfficialRecord`; si el colector necesita enlazar directamente:

```sql
insert into public.issue_official_records (issue_id, official_record_id, linked_by_user_id)
values ($1, $2, $3)
on conflict (issue_id, official_record_id) do nothing;
```

Recuerda actualizar `issues.origin` a `mixed` cuando enlaces a un issue ciudadano. Reglas:

- Un issue puede enlazar N registros y un registro puede enlazar N issues.
- Al enlazar un registro a un issue `citizen`, el issue pasa a `mixed`.
- El vínculo no convierte el registro oficial en reporte ciudadano.
- La detección de duplicados (Sesión 3) propone vínculos; la decisión final se audita en
  `case_events` (`official_record_linked`).

---

## 10. Provenance, licencia y redistribución

`redistribution` controla qué puede publicarse:

| Valor | Uso interno (gobierno, panel) | API pública / UI ciudadana |
| --- | --- | --- |
| `allowed` | Sí | Sí |
| `restricted` | Sí | No |
| `unknown` | Sí | No (por defecto) |

Reglas:

1. Sin licencia verificada, usa `unknown`. El adaptador hace esto automáticamente cuando
   `source_license_verified_from = "unverified"`. No asumas apertura por ser un portal público.
2. `license`, `license_url`, `attribution` se muestran junto al dato en la UI.
3. `raw_payload` **nunca** se publica; puede contener datos personales del denunciante.
4. Si cambia la licencia de la fuente, actualiza `redistribution` y `redistribution_note`.
5. `official_records_public` (vista) ya aplica `is_active and redistribution = 'allowed'`.
   Sesión 4 debe leer de esa vista o replicar exactamente el filtro.

---

## 11. Ubicación geográfica opcional

`latitude` y `longitude` son nullable. No inventes centroides de colonia: si el origen no trae
geometría, deja `null` y conserva `colonia` / `address_hint`. La UI solo dibuja registros con
coordenadas.

Rango válido: latitud 19.2–19.6, longitud −99.35 a −98.95 (Cuauhtémoc). Fuera de rango ⇒ `null`.

---

## 12. Deduplicación de registros oficiales

Dos fuentes pueden describir el mismo evento. No fusiones filas automáticamente:

- Mantén una fila por `(source_system, source_record_id)`.
- Si dos fuentes describen lo mismo, crea un `issue` que enlace ambos registros.
- No reutilices `source_record_id` entre sistemas.

---

## 13. Idempotencia — ejemplo de sincronización

```
run_id = "2026-10-29T06:00Z-cuauhtemoc"
for record in fetch_and_normalize():
    payload.sync_run_id = run_id
    payload.content_hash = sha256(normalize(record))
    upsert_official_record(payload)
retire_missing_official_records("CDMX-0311", run_id)   # solo si la corrida fue completa
```

Reejecutar la misma corrida dos veces produce el mismo estado final.

Integración directa desde el workspace del colector:

```ts
import { fromCollectorRecord } from "votavia/src/server/services/official-record-adapter";

const row = fromCollectorRecord(collectorRecord, {
  syncRunId: runId,
  attribution: dataset.attribution,
  licenseUrl: dataset.license_url,
});
await supabase.rpc("upsert_official_record", { payload: row });
```

`fromCollectorRecord` es puro: no toca red ni base de datos, y produce un objeto que pasa
`officialRecordIngestSchema` (hay pruebas que lo garantizan).

---

## 14. Checklist para Session 6

- [ ] `source_record_id` estable; si no existe, enviar `dedupe_key` como id.
- [ ] `source_system = "cdmx_0311"` constante para esta fuente.
- [ ] `sync_run_id` único por corrida.
- [ ] `redistribution` explícito en cada registro.
- [ ] `license` / `attribution` cuando la fuente lo declare.
- [ ] Coordenadas solo si son reales.
- [ ] `retire_missing_official_records` solo tras corridas completas.
- [ ] Sin `DELETE` sobre `official_records`.
- [ ] `raw_payload` solo si es necesario y con revisión de datos personales.

## 15. Checklist para Sesión 4 (API pública)

- [ ] Leer `official_records_public`, no la tabla base.
- [ ] Incluir `source_system`, `external_folio`, `source_url`, `license`, `attribution`.
- [ ] Separar `operational_status`, `original_status` y `community_verification_status`.
- [ ] Nunca exponer `raw_payload`, `reporter_email` ni `created_by_user_id`.
- [ ] Respetar `is_active = false` (registro retirado en origen).
