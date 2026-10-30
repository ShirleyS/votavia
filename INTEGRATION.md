# VotaVía · API pública — Guía de integración

Rama: `feature/public-api` (Session 4). **No fusionada automáticamente.**

Esta guía describe cómo conectar la API pública y el portal `/desarrolladores` a la
plataforma de casos de Session 1 y al motor preventivo de Session 3. La API es de solo
lectura, nunca crea una base de datos y nunca modifica el esquema de Session 1.

---

## 1. Qué ya está implementado

| Ruta | Contenido |
|---|---|
| `GET /api/v1/public/cases` | Lista paginada de casos publicados, con filtros. |
| `GET /api/v1/public/cases/:id` | Detalle público con línea de tiempo y observaciones. |
| `GET /api/v1/public/cases.geojson` | `FeatureCollection` de casos geolocalizados, con precisión controlada. |
| `GET /api/v1/public/categories` | Catálogo de categorías con etiquetas y conteos publicados. |
| `GET /api/v1/public/official-reports` | Registros gubernamentales importados con licencia y permiso verificados. |
| `GET /api/v1/public/statistics` | Agregados del conjunto publicado. |
| `GET /api/v1/public/risk-signals` | Señales preventivas aprobadas, nunca calculadas aquí. |
| `GET /api/v1/public/health` | Estado del servicio, de la fuente de datos y del feed oficial. |
| `GET /api/v1/public/openapi.json` | Contrato OpenAPI 3.1. |
| `GET /desarrolladores` | Portal en español con documentación, peticiones y consola. |

La raíz `/` redirige a `/desarrolladores`. No se modificaron páginas ciudadanas,
autenticación, APIs internas ni migraciones.

`/cases` es la ruta canónica. Los nombres ilustrativos `issues` y `reports` **no** se
implementan como rutas duplicadas: la documentación los señala como equivalentes para
que un integrador no cree dos clientes distintos. Si en el futuro hace falta un alias,
debe resolverse con una reescritura hacia `/cases`, nunca con una segunda lógica.

### Modos de operación

- **Demo (predeterminado).** `VOTAVIA_PUBLIC_API_MODE` vacío o `demo`. Usa fixtures
  deterministas de `src/public-api/mock-data.ts`. Las respuestas traen
  `meta.dataset: "demo"` y cada caso trae `is_demo: true`.
- **Live.** Se activa con `VOTAVIA_PUBLIC_API_MODE=live` o, implícitamente, cuando
  `VOTAVIA_INTERNAL_API_BASE_URL` tiene valor. Lee la plataforma real.
- **En proceso.** Tras integrar el módulo dentro de la app de Session 1, el adaptador
  puede llamar directamente al servicio de casos, sin HTTP interno.

---

## 2. Qué necesita la API pública de Session 1

### 2.1 Contrato compartido

Se copió **sin cambios** `src/shared/votavia-contract.ts` desde Session 1. No se debe
crear un contrato paralelo. Los tipos públicos se definen en
`src/public-api/types.ts` como una **proyección de salida**, no como un reemplazo del
contrato interno.

Campos usados del contrato:

- `Case`: `case_id`, `display_id`, `category`, `status`, `title`, `description`,
  `location`, `colonia`, `latitude`, `longitude`, `photos`, `support_count`,
  `observation_count`, `has_safety_concern`, `has_accessibility_concern`, `is_demo`,
  `is_published`, `created_at`, `updated_at`, `resolved_at`.
- `CaseTimelineEvent`: `event_id`, `type`, `actor_type`, `title`, `description`,
  `created_at`, `is_public`.
- `ReportObservation`: `observation_id`, `kind`, `body`, `actor_type`, `created_at`.
- `PublicStats`: totales, desgloses por categoría/estado/colonia y `recent_resolved`.

La API pública **ignora deliberadamente** `reporter_email`, `created_by_user_id`,
`address_hint`, `supported_by_me`, `is_mine`, `metadata` y cualquier propiedad adicional
del registro interno.

#### Extensión local de metadatos públicos

El contrato de Session 1 todavía no describe procedencia ni verificación comunitaria. Para
no crear un contrato paralelo, esas piezas viven en
`src/public-api/contract-extensions.ts` como **extensión aditiva y opcional**. Si el campo
no existe, la API aplica un valor conservador; `null` significa desconocido, nunca
“resuelto”.

| Campo público | Origen | Regla |
|---|---|---|
| `votavia_operational_status` | `Case.status` (`CaseStatus`) | Canónico. Es el único campo que expresa el flujo de VotaVía. |
| `status` | Espejo de `Case.status` | Compatibilidad con consumidores anteriores; quedará obsoleto. |
| `external_government_status` | Campo aditivo del mismo nombre | Lo que reporta una autoridad externa. `kind: "closed"` **no** implica resolución. |
| `community_verification_status` | Campo aditivo del mismo nombre | Valores canónicos del contrato compartido: `unreviewed`, `confirmed`, `disputed` o `verified_resolved`. |
| `community_verification_summary` | Campo aditivo | Texto público y depurado; opcional. |
| `community_verified_at` | Campo aditivo | Fecha ISO 8601; opcional. |
| `record_origin` | Campo aditivo | `citizen`, `community` o `government_import`. Predeterminado `citizen`. |
| `provenance` | Campo aditivo | Obligatorio para `government_import`; se omite o va en `null` en el resto. |

Propuesta para Session 1 (no se escribe en el archivo compartido desde esta rama):

```ts
// Propuesta: añadir a src/shared/votavia-contract.ts, sin romper lo existente.
export interface CasePublicMetadata {
  record_origin?: "citizen" | "community" | "government_import";
  external_government_status?: {
    code: string | null;
    label: string;
    kind: "open" | "in_progress" | "closed" | "unknown";
    reported_at: string | null;
  } | null;
  community_verification_status?:
    | "unreviewed"
    | "confirmed"
    | "disputed"
    | "verified_resolved";
  community_verification_summary?: string | null;
  community_verified_at?: string | null;
  provenance?: CaseProvenance | null;
}
```

`CaseProvenance` incluye `dataset`, `source_name`, `source_url`, `official_folio`,
`source_reported_at`, `last_synced_at`, `license` (`id`, `name`, `url`,
`redistributable`), `license_verified_from` (`ckan_metadata`, `dataset_page`,
`unverified` o `unknown`) y `permission` (`verified`, `verified_at`, `reference`). Solo
se publican URLs `https` sin query string ni fragmento, para que un enlace firmado o un
token no se filtre por procedencia.

Un registro importado se publica únicamente si cumple **todas** estas condiciones:
`is_published`, `record_origin === "government_import"`, `license_verified_from` distinto
de `unverified`, licencia redistribuible, permiso verificado, URL de fuente, folio
oficial, `last_synced_at` y `dataset` distinto de
`unknown`. La comprobación ocurre en la capa de consulta y proyección (`provenance.ts`),
nunca solo en la interfaz. El adaptador en proceso y los fixtures la aplican antes de
contar, ordenar o paginar; en el puente HTTP, el origen debe respetar los filtros para que
el `total` no incluya registros que la proyección descarta.

### 2.2 Métodos del servicio de casos

El adaptador en proceso necesita este subconjunto de `CitizenCaseService`:

```ts
type CaseServicePort = Pick<
  CitizenCaseService,
  "listCases" | "getCase" | "getCaseTimeline" | "getCaseObservations" | "getPublicStats"
>;
```

Comportamiento esperado:

- `listCases(filters)` → `Paginated<Case>` con `items` y `total` coherentes con los filtros.
- `getCase(caseId)` → `Case | null`. La API vuelve a comprobar `is_published`.
- `getCaseTimeline(caseId)` → eventos; la API filtra `is_public === true`.
- `getCaseObservations(caseId)` → observaciones; la API recorta y depura texto.
- `getPublicStats()` → `PublicStats`; la API recalcula la tasa de resolución y elimina
  cualquier caso no publicado de `recent_resolved`.

`CaseServicePort` acepta además un método **opcional** `listPublicCases(query)` que recibe
la consulta pública ya validada (origen, verificación, alcaldía, fechas, soporte, bbox,
búsqueda, orden y paginación). Si existe, se usa tal cual y los filtros quedan del lado
del servidor. Si no existe, el adaptador hace un escaneo acotado de `listCases` con un
tope de **5 000 registros** (`MAX_IN_PROCESS_SCAN`) y aplica los filtros en memoria. Ese
tope es una salvaguarda de integración, no un mecanismo para grandes volúmenes: cuando el
dataset crezca, Session 1 debe exponer `listPublicCases` o consultas equivalentes.

### 2.3 Integración en proceso (recomendada)

`src/public-api/adapters/resolve.ts` es el único punto de sustitución:

```ts
import { createCaseServiceSource } from "./case-service-source";
import { getCaseService } from "@/server/services/case-service";

export function getPublicCaseSource() {
  return createCaseServiceSource(getCaseService());
}
```

Ajusta el import y el factory al nombre real de Session 1. Si el servicio necesita un
contexto de participante, pásalo al crear el servicio o añade un wrapper; la API pública
solo consume lecturas.

### 2.4 Integración por HTTP (temporal o despliegue separado)

Si el módulo se despliega como proceso independiente, configura
`VOTAVIA_INTERNAL_API_BASE_URL`. El adaptador
`src/public-api/adapters/http-case-source.ts` espera:

| Método interno | Respuesta esperada |
|---|---|
| `GET /api/cases?page=&pageSize=&sort=&category=&status=&verification=&origin=&alcaldia=&colonia=&created_from=&created_to=&min_support=&bbox=&q=` | `{ items: Case[], total: number }` |
| `GET /api/cases/:id` | `{ case: Case, timeline: CaseTimelineEvent[], observations: ReportObservation[] }` |
| `GET /api/stats` | `PublicStats` |

Cabeceras enviadas:

```http
Accept: application/json
x-votavia-internal-token: <VOTAVIA_INTERNAL_API_TOKEN, si existe>
```

Un `404` interno se traduce a `404` público. Un `5xx`, timeout o respuesta ilegible se
traduce a `502 upstream_unavailable`.

Si el endpoint interno no entiende todavía `verification`, `origin`, `alcaldia`,
`created_from`, `created_to`, `min_support` o `bbox`, debe ignorarlos y devolver el
conjunto base: la API pública vuelve a filtrar y a verificar visibilidad antes de
responder. Lo que **no** puede hacer es devolver casos sin `is_published: true` como si
fueran publicables. La proyección los descarta, pero el `total` de la fuente HTTP se
reutiliza tal cual: si el origen incluye borradores, la paginación pública quedará
inflada. Por eso el endpoint interno debe filtrar `is_published: true` y respetar los
filtros recibidos; el adaptador en proceso sí recalcula el total del conjunto visible.

> Revisa que `/api/cases` entregue también casos no publicados si el endpoint interno es
> de uso ciudadano. La proyección pública los descarta, pero es más eficiente filtrar
> `is_published: true` en el origen cuando sea posible.

---

## 3. Qué necesita del motor preventivo (Session 3)

La API pública **no calcula riesgo**. Solo republica salidas aprobadas.

Configura `VOTAVIA_RISK_SIGNALS_URL` con un endpoint que responda:

```json
{
  "signals": [
    {
      "signal_id": "signal-2026-10-29-roma-baches",
      "signal_type": "emerging_concentration",
      "area_label": "Roma Norte · corredor Río Pánuco",
      "colonia": "Roma Norte",
      "category": "road_damage",
      "risk_level": "high",
      "attention_index": 78,
      "finding": "Se concentraron 6 reportes…",
      "recommended_action": "Programar una inspección conjunta…",
      "spatial_precision": "coordinates",
      "centroid": { "latitude": 19.415, "longitude": -99.164 },
      "radius_meters": 250,
      "window_days": 14,
      "current_window_count": 6,
      "previous_window_count": 2,
      "change_ratio": 2,
      "valid_from": "2026-10-29T00:00:00.000Z",
      "valid_until": "2026-11-12T23:59:59.000Z",
      "generated_at": "2026-10-29T08:15:00.000Z",
      "approved_at": "2026-10-29T17:40:00.000Z",
      "approved_by_role": "coordinacion_territorial",
      "analysis_version": "preventive-2026-10-30.1",
      "limitations": ["…"],
      "approval_status": "approved",
      "is_public": true
    }
  ]
}
```

Reglas obligatorias:

1. El feed debe entregar únicamente señales con `approval_status: "approved"`.
2. La API vuelve a comprobar `approval_status === "approved" && is_public === true`.
3. `evidence_record_ids` es interno y **nunca** se republica.
4. Los centroides se redondean a 3 decimales antes de responder.
5. Si no hay feed en modo live, el endpoint responde:
   `503 { "error": { "code": "risk_signals_unavailable", … } }`.
6. No se inyectan señales demo en modo live.

Cabecera opcional: `Authorization: Bearer <VOTAVIA_RISK_SIGNALS_TOKEN>`.

---

## 4. Configuración

Copia `.env.example` y define:

| Variable | Obligatoria | Uso |
|---|---|---|
| `VOTAVIA_PUBLIC_API_MODE` | No | `demo` o `live`. |
| `VOTAVIA_INTERNAL_API_BASE_URL` | En live HTTP | Base de la plataforma real. |
| `VOTAVIA_INTERNAL_API_TOKEN` | No | Token de servicio interno. |
| `VOTAVIA_RISK_SIGNALS_URL` | En live con señales | Feed aprobado de Session 3. |
| `VOTAVIA_RISK_SIGNALS_TOKEN` | No | Token del feed. |
| `VOTAVIA_CASE_PERMALINK_PATH` | No | Ruta pública del caso. Predeterminado `/casos`. |
| `VOTAVIA_PUBLIC_RATE_LIMIT` | No | Solicitudes por minuto e IP. Predeterminado `120`. |
| `VOTAVIA_OFFICIAL_FEED_ENABLED` | No | `true` solo con permiso de redistribución verificado. Predeterminado desactivado. |
| `VOTAVIA_OFFICIAL_SOURCE_LICENSE` | Sí, si el feed está activo | Identificador de licencia, p. ej. `cc-by-4.0`. Sin ella el feed queda en `awaiting_permission`. |
| `VOTAVIA_OFFICIAL_SOURCE_ATTRIBUTION` | Recomendada, si el feed está activo | Texto de atribución que se publica con los registros importados. |
| `VOTAVIA_OFFICIAL_LAST_SYNCED_AT` | Recomendada, si el feed está activo | Fecha ISO de la última sincronización; alimenta la frescura. |
| `VOTAVIA_OFFICIAL_RECORDS_PATH` | No | JSONL normalizado de Session 6. Se abre en solo lectura; nunca se escribe ni se modifica. |
| `VOTAVIA_OFFICIAL_MANIFEST_PATH` | No | Manifiesto de la corrida que declara licencia, conteos y fechas. |
| `NEXT_PUBLIC_APP_URL` | Recomendada | Dominio para permalinks y ejemplos. |

No se requieren credenciales de Supabase para la API pública. No se requieren variables
de autenticación ciudadana.

### 4.1 Política del feed de registros oficiales

El feed está **desactivado por omisión**. `GET /official-reports` y `GET /health`
publican el estado en `meta.official_feed`:

| Estado | Cuándo ocurre | Respuesta |
|---|---|---|
| `disabled_by_configuration` | `VOTAVIA_OFFICIAL_FEED_ENABLED` no es `true`. | Lista vacía; no se publican importaciones. |
| `awaiting_permission` | El feed se pidió, pero falta `VOTAVIA_OFFICIAL_SOURCE_LICENSE`. | Lista vacía; el motivo es visible y seguro de publicar. |
| `enabled` | Flag activo y licencia declarada. | Solo registros que además pasan todas las validaciones de procedencia. |

Los fixtures de demostración pueden mostrar la *forma* de un registro importado aunque el
feed esté apagado, porque van marcados con `is_demo: true` y `meta.dataset: "demo"`. En
modo live nunca se inyectan fixtures oficiales.

**La ingesta no forma parte de este módulo.** La construye Ismael. Esta rama no descarga,
raspa ni sincroniza el tablero de ninguna dependencia; solo publica registros ya
normalizados, licenciados y autorizados.

### 4.2 CDMX y el tablero 311

VotaVía **no ofrece ni representa una API oficial del Gobierno de la Ciudad de México**.

- `https://tablero311.cdmx.gob.mx/` muestra reportes oficiales recientes, pero no se
  verificó una API pública documentada ni permiso para redistribuir registros nuevos.
- Mientras no exista permiso y licencia comprobables, el feed de producción permanece
  apagado (`disabled_by_configuration`) y los ejemplos del portal se marcan como
  demostración.
- Solo se publican importaciones cuya fuente tenga acceso legítimo, licencia
  redistribuible y permiso verificado. No basta con que el dato sea visible en un sitio
  público.
- Cuando se habilite una fuente, debe declarar `source_name`, `source_url`, folio, fecha
  reportada por la fuente, última sincronización, licencia y atribución.

También es válido operar sin ningún feed gubernamental: la API funciona con reportes
ciudadanos y comunitarios publicados por VotaVía.

### 4.3 Contrato de ingesta con Session 6

Session 6 publica una salida **normalizada** (un `NormalizedOfficialRecord` por línea en
JSONL) y un manifiesto por corrida. Este módulo la consume en **solo lectura** a través de
`src/public-api/adapters/session6-official-source.ts`; no descarga, raspa, normaliza ni
escribe registros. El adaptador se compone con la fuente de Session 1 mediante
`CompositeCaseSource`, de modo que los casos ciudadanos y comunitarios siguen viniendo
del servicio canónico.

Variables:

```bash
VOTAVIA_OFFICIAL_RECORDS_PATH=/ruta/a/records.jsonl
VOTAVIA_OFFICIAL_MANIFEST_PATH=/ruta/a/manifest.json
VOTAVIA_OFFICIAL_FEED_ENABLED=true
VOTAVIA_OFFICIAL_SOURCE_LICENSE=cc-by-4.0
VOTAVIA_OFFICIAL_SOURCE_ATTRIBUTION="Fuente: …"
```

Si `VOTAVIA_OFFICIAL_RECORDS_PATH` está vacío, no se lee ningún archivo y solo se usa la
fuente base. Si el archivo declara registros sin coordenadas utilizables, se omiten: el
contrato canónico exige un punto.

#### Mapeo de campos

| Session 6 | API pública | Regla |
|---|---|---|
| `dedupe_key` | `case_id` | UUID determinista (SHA-1) para que el mismo registro conserve identidad entre corridas. |
| `source_record_id` | `display_id` | Prefijo `CDMX-0311-`; el folio externo nunca se usa como `case_id`. |
| `normalized_category` | `category` | Debe ser una categoría del contrato compartido. |
| `normalized_status` | `external_government_status` | **Solo** estado externo. `closed` se publica como `kind: closed` con la etiqueta “… no verificado por VotaVía”. |
| — | `votavia_operational_status` | Siempre `reported`. Un cierre oficial no lo cambia. |
| — | `resolved_at` | Siempre `null`. |
| — | `community_verification_status` | Siempre `unreviewed`. |
| `source_license`, `source_license_verified_from` | `provenance.license`, `provenance.license_verified_from` | `unverified` bloquea el registro aunque el feed esté activo. |
| `collected_at`, `reported_at`, `closed_at`, `updated_at` | `provenance.last_synced_at`, `source_reported_at`, `official_record.source_closed_at`, `source_updated_at` | Se publican como fechas de la fuente, no como resolución. |
| `data_quality_flags`, `responsible_agency`, `original_*`, `extraction_method` | `official_record.*` | Allowlist. Filas crudas, `raw_reference`, hashes y columnas de contacto nunca se publican. |

#### Controles aplicados en la capa de datos

- El manifiesto con `license_status: "unverified"` bloquea **todos** los registros de la
  corrida.
- Un registro con `source_license_verified_from: "unverified"` se excluye aunque el
  manifiesto esté verificado.
- La política global (`is_demo`, `VOTAVIA_OFFICIAL_FEED_ENABLED`) se evalúa después de la
  comprobación por registro; los fixtures solo se publican con `is_demo: true`.
- Los registros importados se excluyen de `resolved_at`, de estadísticas de resolución y
  de cualquier agregado que los presente como verificados por VotaVía.
- `official_record` es `null` para todo registro que no sea `government_import`.

Session 6 no debe publicar datos personales en su salida normalizada. Aun así, este módulo
aplica una segunda barrera: solo lee los campos de la allowlist y descarta el resto.

### 4.4 Reutilización por otros municipios

Las convenciones son deliberadamente portables:

- `case_id` estable (UUID) y `display_id` legible; nunca se usan folios externos como ID.
- Tres estados separados: operativo de VotaVía, externo gubernamental y verificación
  comunitaria.
- Procedencia explícita por registro y política de publicación por licencia.
- Filtros y GeoJSON con los mismos nombres; `precision` controla la exposición geográfica.
- Respuestas con `meta.api_version`, `meta.dataset`, `meta.generated_at` y
  `meta.request_id`; errores con `error.code`, `error.message` y `error.request_id`.
- Límite de página 50, GeoJSON 500, bbox máximo 5° por lado.

Un municipio puede desplegar el mismo módulo con su propio adaptador y su propio feed,
pero la API pública **no otorga escritura**. No hay endpoints de creación, edición,
asignación ni cierre. Esas operaciones quedan en APIs internas autenticadas, separadas de
esta superficie.

---

## 5. Seguridad y privacidad

`src/public-api/privacy.ts` es la frontera de salida. Aplica:

- Descarte de casos con `is_published: false`.
- Construcción campo por campo (allowlist); propiedades internas no pueden “viajar”.
- Eliminación de correos y teléfonos en título, descripción, fotos, eventos y observaciones.
- Exclusión de `address_hint`, identidad del reportero, notas internas y datos de especialistas.
- Exclusión de correos, teléfonos y cualquier PII presente en registros importados.
- Exclusión de enlaces mágicos, tokens de autenticación y metadatos de evidencia sensible.
- Exclusión de asignaciones internas de gobierno que no estén marcadas como públicas.
- Coordenadas redondeadas a 3 decimales (`precision_meters: 110`).
- Solo eventos de línea de tiempo con `is_public: true`.
- Solo señales con aprobación humana y `is_public: true`.

Cabeceras y límites:

- CORS: `Access-Control-Allow-Origin: *` para lecturas.
- `ETag` + `If-None-Match` → `304`.
- `Cache-Control` público con `stale-while-revalidate`.
- Límite en memoria: `VOTAVIA_PUBLIC_RATE_LIMIT` (120 solicitudes/minuto/IP por
  omisión). **En producción multinodo, sustituir por un limitador distribuido o un
  WAF/edge.** El limitador actual es una salvaguarda de desarrollo y una sola instancia.
- Paginación acotada (máximo 50), GeoJSON acotado (máximo 500) y bbox máximo de 5° por
  lado para evitar consultas de barrido.
- Validación estricta con Zod: parámetros desconocidos producen `400`, no se ignoran.
- CORS público solo para lectura; no se permiten credenciales ni métodos de escritura.

---

## 6. Verificación

```bash
cd votavia-public-api
npx tsc --noEmit
npx vitest run
npx next build --webpack
```

Pruebas cubiertas:

- Fugas de correo, teléfono, notas internas, `address_hint`, eventos privados y casos no publicados.
- Filtros, paginación, orden, detalle, 404 y validación de UUID.
- Filtros de origen, verificación comunitaria, fechas, soporte y bbox.
- GeoJSON con precisión, `geometry: null` para casos sensibles y colección vacía válida.
- Procedencia: feed desactivado, `awaiting_permission` y feed habilitado con licencia.
- Catálogo de categorías, registros oficiales y estado de salud.
- Estadísticas sin casos no publicados.
- Señales aprobadas únicamente.
- CORS, ETag/304, envelope de error, OpenAPI y rate limit.
- Delegación del adaptador en proceso.
- Ingesta Session 6: mapeo de `normalized_status` solo a estado externo, bloqueo por
  `license_verified_from: "unverified"`, bloqueo por manifiesto no verificado, omisión de
  registros sin coordenadas, allowlist de `official_record` y ausencia de PII en la
  proyección pública.

---

## 7. Lista de verificación para integrar

- [ ] El contrato compartido sigue siendo la única fuente de tipos.
- [ ] `createCaseServiceSource(getCaseService())` está conectado en `resolve.ts`.
- [ ] `listCases` respeta filtros, `page`, `pageSize`, `sort` y devuelve `total`.
- [ ] `getCase` devuelve `null` para casos inexistentes.
- [ ] `getCaseTimeline` y `getCaseObservations` no requieren contexto privado.
- [ ] `getPublicStats` no incluye casos no publicados.
- [ ] Los campos de extensión (`record_origin`, `provenance`, estados externo y comunitario) existen o se aceptan como opcionales.
- [ ] El feed oficial sigue desactivado salvo que exista licencia y permiso verificados.
- [ ] La ingesta oficial está conectada por Ismael, no por este módulo.
- [ ] `VOTAVIA_OFFICIAL_RECORDS_PATH` apunta a la salida JSONL de Session 6 y
  `VOTAVIA_OFFICIAL_MANIFEST_PATH` al manifiesto de la misma corrida.
- [ ] Cada registro importado declara `source_license_verified_from`; ningún registro
  importado se publica con `unverified`.
- [ ] Los registros importados conservan `votavia_operational_status: reported`,
  `resolved_at: null` y `community_verification_status: unreviewed`.
- [ ] `official_record` no contiene filas crudas, hashes ni columnas de contacto.
- [ ] El feed de Session 3 entrega solo señales aprobadas y públicas.
- [ ] `NEXT_PUBLIC_APP_URL` apunta al dominio correcto para permalinks.
- [ ] Se revisó el límite de solicitudes para el entorno de producción.
- [ ] El portal `/desarrolladores` se revisó en español y muestra el estado real del feed.
- [ ] Se ejecutaron typecheck, tests y build.
- [ ] **No se fusionó la rama automáticamente.**

---

## 8. Limitaciones conocidas

- El limitador de solicitudes es en memoria y por instancia.
- El adaptador en proceso tiene un tope de 5 000 registros cuando Session 1 no expone
  `listPublicCases`. No sustituye una consulta paginada del lado del servidor.
- El feed de registros oficiales está desactivado por omisión. Habilitarlo exige una
  fuente con licencia y permiso de redistribución verificados; la ingesta pertenece a
  Ismael y no se implementa aquí.
- Los registros importados requieren coordenadas utilizables. La ingesta debe publicar
  latitud y longitud; de lo contrario el registro se omite del conjunto público.
- El feed lee el JSONL completo de Session 6 en cada arranque en frío (con caché por
  proceso). Para volúmenes grandes, Session 6 debería emitir solo los registros vigentes
  o este adaptador necesitaría un índice persistente.
- No se verificó una API pública documentada del tablero 311 de CDMX. VotaVía no afirma
  ser una API oficial ni redistribuye registros sin permiso.
- La consola del portal llama a la API desde el navegador; en un despliegue con CSP
  estricta, permite `connect-src 'self'`.
- Los ejemplos del portal usan `NEXT_PUBLIC_APP_URL` o `https://votavia.mx` como base;
  la consola usa rutas relativas del mismo origen.
- El modo demo es deliberadamente visible en `meta.dataset` y `is_demo`; no debe
  presentarse como información real.
- No se implementó autenticación porque la API es pública y de solo lectura. Si en el
  futuro se añaden cuotas por cliente, el punto de extensión es `http.ts` / `rate-limit.ts`.
- La rama `feature/public-api` se entrega **sin fusión ni despliegue**. La integración
  requiere revisión humana.
