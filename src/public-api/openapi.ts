import { CASE_CATEGORIES, CASE_STATUSES } from "@/shared/votavia-contract";
import { categories as categoryCatalog } from "./catalog";
import {
  COMMUNITY_VERIFICATION_STATUSES,
  EXTERNAL_STATUS_KINDS,
  RECORD_ORIGINS,
} from "./contract-extensions";
import {
  GEOJSON_SPATIAL_PRECISION,
  PUBLIC_API_VERSION,
  RISK_LEVELS,
  RISK_SIGNAL_TYPES,
} from "./types";
import { MAX_BBOX_SPAN_DEGREES, MAX_PAGE_SIZE } from "./params";
import { officialFeedPolicy } from "./provenance";

const errorRef = { $ref: "#/components/schemas/Error" };

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: errorRef } },
  };
}

function envelope(schema: string, meta = "Meta") {
  return {
    type: "object",
    required: ["data", "meta"],
    properties: {
      data: { $ref: `#/components/schemas/${schema}` },
      meta: { $ref: `#/components/schemas/${meta}` },
    },
  };
}

const filters = [
  { $ref: "#/components/parameters/Category" },
  { $ref: "#/components/parameters/Status" },
  { $ref: "#/components/parameters/Verification" },
  { $ref: "#/components/parameters/Origin" },
  { $ref: "#/components/parameters/Alcaldia" },
  { $ref: "#/components/parameters/Colonia" },
  { $ref: "#/components/parameters/CreatedFrom" },
  { $ref: "#/components/parameters/CreatedTo" },
  { $ref: "#/components/parameters/MinSupport" },
  { $ref: "#/components/parameters/Bbox" },
  { $ref: "#/components/parameters/Query" },
];

const rateLimited = errorResponse("Límite de solicitudes excedido");

export function openApiDocument() {
  const policy = officialFeedPolicy();
  return {
    openapi: "3.1.0",
    info: {
      title: "VotaVía · API pública de datos cívicos",
      version: PUBLIC_API_VERSION,
      summary:
        "Interfaz abierta de solo lectura para reportes urbanos publicados. Reutilizable por otros municipios.",
      description: [
        "API pública, de solo lectura y sin autenticación. Expone únicamente registros aprobados para publicación.",
        "Distingue tres estados independientes: `votavia_operational_status` (flujo de VotaVía), `external_government_status` (lo que reporta una autoridad externa) y `community_verification_status` (verificación comunitaria). Un cierre gubernamental NUNCA equivale a una resolución verificada.",
        "Los registros importados solo se publican con licencia redistribuible y permiso verificado. VotaVía no ofrece ni representa una API oficial del Gobierno de la Ciudad de México.",
        "Nunca se publican correos, teléfonos, enlaces mágicos, notas internas, asignaciones internas ni metadatos de evidencia.",
      ].join("\n\n"),
      contact: { name: "Equipo VotaVía", url: "/desarrolladores" },
      license: {
        name: "Datos cívicos abiertos con atribución; cada conjunto declara su propia licencia",
      },
    },
    servers: [{ url: "/", description: "Mismo dominio de VotaVía" }],
    security: [{}, { apiKey: [] }],
    tags: [
      { name: "Casos", description: "Reportes ciudadanos y comunitarios publicados." },
      { name: "GeoJSON", description: "Salida geoespacial con atributos seguros." },
      { name: "Catálogo", description: "Categorías y conteos del conjunto publicado." },
      { name: "Registros oficiales", description: "Importaciones gubernamentales con licencia verificada." },
      { name: "Estadísticas", description: "Agregados del conjunto publicado." },
      { name: "Señales preventivas", description: "Salidas aprobadas del motor preventivo." },
      { name: "Operación", description: "Estado del servicio y del feed oficial." },
    ],
    paths: {
      "/api/v1/public/cases": {
        get: {
          tags: ["Casos"],
          operationId: "listPublicCases",
          summary: "Lista casos publicados (equivale a /issues y /reports)",
          description:
            "Orden estable: `sort=recent` usa created_at DESC, `supported` usa support_count DESC y `updated` usa updated_at DESC. Todos desempatan por case_id ascendente.",
          parameters: [
            ...filters,
            { $ref: "#/components/parameters/Page" },
            { $ref: "#/components/parameters/PageSize" },
            { $ref: "#/components/parameters/Sort" },
          ],
          responses: {
            "200": {
              description: "Lista paginada de casos públicos",
              content: {
                "application/json": { schema: envelope("CaseList", "PaginationMeta") },
              },
            },
            "400": errorResponse("Parámetros inválidos"),
            "429": rateLimited,
          },
        },
      },
      "/api/v1/public/cases/{id}": {
        get: {
          tags: ["Casos"],
          operationId: "getPublicCase",
          summary: "Obtiene un caso por case_id (UUID)",
          parameters: [{ $ref: "#/components/parameters/CaseId" }],
          responses: {
            "200": {
              description: "Detalle con cronología pública y observaciones publicadas",
              content: { "application/json": { schema: envelope("CaseDetail") } },
            },
            "400": errorResponse("Identificador con formato inválido"),
            "404": errorResponse("Caso inexistente, no publicado o no redistribuible"),
            "429": rateLimited,
          },
        },
      },
      "/api/v1/public/cases.geojson": {
        get: {
          tags: ["GeoJSON"],
          operationId: "listPublicCasesGeoJson",
          summary: "FeatureCollection de casos geolocalizados (equivale a /issues.geojson)",
          description:
            "Devuelve `application/geo+json`. Las coordenadas se publican redondeadas (~110 m o ~1.1 km). Los casos con preocupación de seguridad se publican con `geometry: null` y `spatial_precision: coarse`. `precision=coarse` oculta toda geometría.",
          parameters: [
            ...filters,
            { $ref: "#/components/parameters/Precision" },
            { $ref: "#/components/parameters/Limit" },
          ],
          responses: {
            "200": {
              description: "FeatureCollection de casos públicos",
              content: {
                "application/geo+json": {
                  schema: { $ref: "#/components/schemas/GeoJsonFeatureCollection" },
                },
              },
            },
            "400": errorResponse("Parámetros inválidos"),
            "429": rateLimited,
          },
        },
      },
      "/api/v1/public/categories": {
        get: {
          tags: ["Catálogo"],
          operationId: "listPublicCategories",
          summary: "Catálogo de categorías con conteos publicados",
          responses: {
            "200": {
              description: "Categorías, etiquetas en español y conteos",
              content: { "application/json": { schema: envelope("CategoryCatalog") } },
            },
            "429": rateLimited,
          },
        },
      },
      "/api/v1/public/official-reports": {
        get: {
          tags: ["Registros oficiales"],
          operationId: "listOfficialReports",
          summary: "Registros gubernamentales importados con permiso de redistribución",
          description: [
            "Los registros solo aparecen si su licencia permite redistribuir y el permiso está verificado.",
            "El feed de producción está desactivado por omisión. Cuando está desactivado, la respuesta es una lista vacía con `meta.official_feed.enabled = false`.",
            "Esto NO es una API oficial del Gobierno de la Ciudad de México ni de ningún otro gobierno.",
          ].join(" "),
          parameters: [
            ...filters,
            { $ref: "#/components/parameters/Page" },
            { $ref: "#/components/parameters/PageSize" },
          ],
          responses: {
            "200": {
              description: "Registros oficiales publicables",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OfficialReportsEnvelope" },
                },
              },
            },
            "400": errorResponse("Parámetros inválidos"),
            "429": rateLimited,
          },
        },
      },
      "/api/v1/public/statistics": {
        get: {
          tags: ["Estadísticas"],
          operationId: "getPublicStatistics",
          summary: "Agregados del conjunto publicado",
          responses: {
            "200": {
              description: "Totales, distribución por categoría, estado, colonia y origen",
              content: { "application/json": { schema: envelope("Statistics") } },
            },
            "429": rateLimited,
          },
        },
      },
      "/api/v1/public/risk-signals": {
        get: {
          tags: ["Señales preventivas"],
          operationId: "listRiskSignals",
          summary: "Señales preventivas aprobadas para publicación",
          description:
            "La API no calcula riesgo. Solo republica salidas ya aprobadas por el servicio preventivo (Session 3). Sin feed configurado responde 503.",
          parameters: [
            { $ref: "#/components/parameters/Category" },
            { $ref: "#/components/parameters/Colonia" },
            {
              name: "risk_level",
              in: "query",
              schema: { type: "string", example: "high,critical" },
            },
            {
              name: "signal_type",
              in: "query",
              schema: { type: "string", example: "repeated_reports" },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Señales públicas aprobadas",
              content: { "application/json": { schema: envelope("RiskSignalList") } },
            },
            "400": errorResponse("Parámetros inválidos"),
            "429": rateLimited,
            "503": errorResponse("Publicación de señales no habilitada"),
          },
        },
      },
      "/api/v1/public/health": {
        get: {
          tags: ["Operación"],
          operationId: "getPublicHealth",
          summary: "Estado del servicio y de los feeds opcionales",
          responses: {
            "200": {
              description: "Estado operativo",
              content: { "application/json": { schema: envelope("Health") } },
            },
            "429": rateLimited,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description:
            "Opcional en esta versión. Si se habilita una clave para límites ampliados, usa este encabezado. La API sigue siendo de solo lectura.",
        },
      },
      parameters: {
        Category: {
          name: "category",
          in: "query",
          description: "Categorías separadas por coma.",
          schema: { type: "string", enum: [...CASE_CATEGORIES] },
        },
        Status: {
          name: "status",
          in: "query",
          description:
            "Estado operativo canónico de VotaVía (votavia_operational_status), separado por coma.",
          schema: { type: "string", enum: [...CASE_STATUSES] },
        },
        Verification: {
          name: "verification",
          in: "query",
          description: "Estado de verificación comunitaria, separado por coma.",
          schema: { type: "string", enum: [...COMMUNITY_VERIFICATION_STATUSES] },
        },
        Origin: {
          name: "origin",
          in: "query",
          description: "Origen del registro, separado por coma.",
          schema: { type: "string", enum: [...RECORD_ORIGINS] },
        },
        Alcaldia: {
          name: "alcaldia",
          in: "query",
          description: "Alcaldía o municipio. Hasta 10 valores separados por coma.",
          schema: { type: "string", example: "Cuauhtémoc" },
        },
        Colonia: {
          name: "colonia",
          in: "query",
          description: "Colonia. Hasta 10 valores separados por coma.",
          schema: { type: "string", example: "Roma Norte,Condesa" },
        },
        CreatedFrom: {
          name: "created_from",
          in: "query",
          description: "Fecha ISO 8601 inclusiva de creación.",
          schema: { type: "string", format: "date-time", example: "2026-10-01" },
        },
        CreatedTo: {
          name: "created_to",
          in: "query",
          description: "Fecha ISO 8601 inclusiva de creación.",
          schema: { type: "string", format: "date-time", example: "2026-10-31" },
        },
        MinSupport: {
          name: "min_support",
          in: "query",
          description: "Conteo mínimo de apoyos comunitarios.",
          schema: { type: "integer", minimum: 0, maximum: 1_000_000 },
        },
        Bbox: {
          name: "bbox",
          in: "query",
          description: `minLon,minLat,maxLon,maxLat. Rango máximo de ${MAX_BBOX_SPAN_DEGREES}° por lado.`,
          schema: { type: "string", example: "-99.19,19.39,-99.13,19.44" },
        },
        Query: {
          name: "q",
          in: "query",
          description: "Búsqueda en título, descripción, colonia y display_id.",
          schema: { type: "string", maxLength: 120 },
        },
        Page: {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 10_000, default: 1 },
        },
        PageSize: {
          name: "page_size",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 },
        },
        Sort: {
          name: "sort",
          in: "query",
          schema: {
            type: "string",
            enum: ["recent", "supported", "updated"],
            default: "recent",
          },
        },
        Precision: {
          name: "precision",
          in: "query",
          description: "`block` publica puntos redondeados; `coarse` oculta la geometría.",
          schema: { type: "string", enum: [...GEOJSON_SPATIAL_PRECISION], default: "block" },
        },
        Limit: {
          name: "limit",
          in: "query",
          description: "Número máximo de features.",
          schema: { type: "integer", minimum: 1, maximum: 500, default: 200 },
        },
        CaseId: {
          name: "id",
          in: "path",
          required: true,
          description: "UUID del caso. Los identificadores VOT-0001 no son aceptados.",
          schema: { type: "string", format: "uuid" },
        },
      },
      schemas: {
        Meta: {
          type: "object",
          required: ["request_id", "api_version", "generated_at", "dataset"],
          properties: {
            request_id: { type: "string" },
            api_version: { type: "string", const: PUBLIC_API_VERSION },
            generated_at: { type: "string", format: "date-time" },
            dataset: { type: "string", enum: ["demo", "live"] },
            count: { type: "integer" },
          },
        },
        PaginationMeta: {
          allOf: [
            { $ref: "#/components/schemas/Meta" },
            {
              type: "object",
              required: ["page", "page_size", "total", "total_pages", "has_more"],
              properties: {
                page: { type: "integer" },
                page_size: { type: "integer" },
                total: { type: "integer" },
                total_pages: { type: "integer" },
                has_more: { type: "boolean" },
              },
            },
          ],
        },
        ExternalGovernmentStatus: {
          type: ["object", "null"],
          description:
            "Estado reportado por una autoridad externa. `kind: closed` no implica que el problema esté resuelto.",
          properties: {
            code: { type: ["string", "null"] },
            label: { type: "string" },
            kind: { type: "string", enum: [...EXTERNAL_STATUS_KINDS] },
            reported_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        Provenance: {
          type: "object",
          required: ["record_origin", "dataset", "source_name", "license", "permission"],
          properties: {
            record_origin: { type: "string", enum: [...RECORD_ORIGINS] },
            dataset: { type: "string" },
            source_name: { type: "string" },
            source_url: { type: ["string", "null"], format: "uri" },
            official_folio: { type: ["string", "null"] },
            source_reported_at: { type: ["string", "null"], format: "date-time" },
            last_synced_at: { type: ["string", "null"], format: "date-time" },
            license: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                url: { type: ["string", "null"], format: "uri" },
                redistributable: { type: "boolean" },
              },
            },
            permission: {
              type: "object",
              properties: {
                verified: { type: "boolean" },
                verified_at: { type: ["string", "null"], format: "date-time" },
                reference: { type: ["string", "null"], format: "uri" },
              },
            },
            attribution: { type: ["string", "null"] },
            freshness: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["fresh", "aging", "stale", "unknown"] },
                age_hours: { type: ["number", "null"] },
                checked_at: { type: "string", format: "date-time" },
              },
            },
            is_demo: { type: "boolean" },
          },
        },
        Case: {
          type: "object",
          required: [
            "case_id",
            "display_id",
            "category",
            "votavia_operational_status",
            "community_verification_status",
            "record_origin",
            "created_at",
          ],
          properties: {
            case_id: { type: "string", format: "uuid" },
            display_id: { type: "string", example: "VOT-0001" },
            category: { type: "string", enum: [...CASE_CATEGORIES] },
            votavia_operational_status: { type: "string", enum: [...CASE_STATUSES] },
            status: {
              type: "string",
              enum: [...CASE_STATUSES],
              deprecated: true,
              description: "Alias obsoleto de votavia_operational_status.",
            },
            external_government_status: { $ref: "#/components/schemas/ExternalGovernmentStatus" },
            community_verification_status: {
              type: "string",
              enum: [...COMMUNITY_VERIFICATION_STATUSES],
            },
            community_verification: {
              type: "object",
              properties: {
                status: { type: "string", enum: [...COMMUNITY_VERIFICATION_STATUSES] },
                summary: { type: ["string", "null"] },
                verified_at: { type: ["string", "null"], format: "date-time" },
              },
            },
            record_origin: { type: "string", enum: [...RECORD_ORIGINS] },
            provenance: {
              oneOf: [
                { $ref: "#/components/schemas/Provenance" },
                { type: "null" },
              ],
            },
            title: { type: "string" },
            description: { type: "string" },
            location: {
              type: "object",
              required: ["colonia", "alcaldia", "latitude", "longitude", "precision_meters"],
              properties: {
                colonia: { type: "string" },
                alcaldia: { type: "string" },
                latitude: { type: "number" },
                longitude: { type: "number" },
                precision_meters: { type: "integer" },
              },
            },
            photos: { type: "array", items: { type: "object" } },
            support_count: { type: "integer", minimum: 0 },
            observation_count: { type: "integer", minimum: 0 },
            has_safety_concern: { type: "boolean" },
            has_accessibility_concern: { type: "boolean" },
            is_demo: { type: "boolean" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            resolved_at: { type: ["string", "null"], format: "date-time" },
            permalink: { type: "string" },
          },
        },
        CaseSummary: {
          type: "object",
          properties: {
            case_id: { type: "string" },
            display_id: { type: "string" },
            category: { type: "string", enum: [...CASE_CATEGORIES] },
            votavia_operational_status: { type: "string", enum: [...CASE_STATUSES] },
            external_government_status: { $ref: "#/components/schemas/ExternalGovernmentStatus" },
            community_verification_status: {
              type: "string",
              enum: [...COMMUNITY_VERIFICATION_STATUSES],
            },
            record_origin: { type: "string", enum: [...RECORD_ORIGINS] },
            title: { type: "string" },
            colonia: { type: "string" },
            support_count: { type: "integer" },
            resolved_at: { type: ["string", "null"], format: "date-time" },
            created_at: { type: "string", format: "date-time" },
            permalink: { type: "string" },
          },
        },
        CaseList: { type: "array", items: { $ref: "#/components/schemas/Case" } },
        CaseDetail: {
          allOf: [
            { $ref: "#/components/schemas/Case" },
            {
              type: "object",
              properties: {
                timeline: { type: "array", items: { type: "object" } },
                observations: { type: "array", items: { type: "object" } },
              },
            },
          ],
        },
        Category: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...CASE_CATEGORIES] },
            label: { type: "string" },
            description: { type: "string" },
            count: { type: "integer" },
            resolved: { type: "integer" },
            record_origins: { type: "array", items: { type: "string", enum: [...RECORD_ORIGINS] } },
          },
        },
        CategoryCatalog: {
          type: "object",
          properties: {
            categories: { type: "array", items: { $ref: "#/components/schemas/Category" } },
            total_published: { type: "integer" },
            generated_at: { type: "string", format: "date-time" },
          },
        },
        GeoJsonFeature: {
          type: "object",
          required: ["type", "id", "geometry", "properties"],
          properties: {
            type: { type: "string", const: "Feature" },
            id: { type: "string", description: "case_id canónico y estable." },
            geometry: {
              oneOf: [
                {
                  type: "object",
                  properties: {
                    type: { type: "string", const: "Point" },
                    coordinates: {
                      type: "array",
                      items: { type: "number" },
                      minItems: 2,
                      maxItems: 2,
                    },
                  },
                },
                { type: "null" },
              ],
            },
            properties: {
              type: "object",
              properties: {
                case_id: { type: "string" },
                display_id: { type: "string" },
                category: { type: "string", enum: [...CASE_CATEGORIES] },
                votavia_operational_status: { type: "string", enum: [...CASE_STATUSES] },
                external_government_status_label: { type: ["string", "null"] },
                external_government_status_kind: { type: ["string", "null"] },
                community_verification_status: {
                  type: "string",
                  enum: [...COMMUNITY_VERIFICATION_STATUSES],
                },
                record_origin: { type: "string", enum: [...RECORD_ORIGINS] },
                title: { type: "string" },
                colonia: { type: "string" },
                alcaldia: { type: "string" },
                support_count: { type: "integer" },
                created_at: { type: "string", format: "date-time" },
                updated_at: { type: "string", format: "date-time" },
                permalink: { type: "string" },
                spatial_precision: { type: "string", enum: [...GEOJSON_SPATIAL_PRECISION] },
                coordinate_precision_meters: { type: "integer" },
                source_name: { type: ["string", "null"] },
                official_folio: { type: ["string", "null"] },
                source_url: { type: ["string", "null"] },
                license_id: { type: ["string", "null"] },
                freshness: { type: ["string", "null"] },
              },
            },
          },
        },
        GeoJsonFeatureCollection: {
          type: "object",
          required: ["type", "features", "meta"],
          properties: {
            type: { type: "string", const: "FeatureCollection" },
            features: {
              type: "array",
              items: { $ref: "#/components/schemas/GeoJsonFeature" },
            },
            meta: { $ref: "#/components/schemas/Meta" },
            provenance: { type: "object" },
          },
        },
        OfficialFeedMeta: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            reason: { type: "string" },
            note: { type: "string" },
            license: { type: ["string", "null"] },
            attribution: { type: ["string", "null"] },
            last_synced_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        OfficialReportsEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Case" } },
            meta: {
              allOf: [
                { $ref: "#/components/schemas/PaginationMeta" },
                {
                  type: "object",
                  properties: { official_feed: { $ref: "#/components/schemas/OfficialFeedMeta" } },
                },
              ],
            },
          },
        },
        Statistics: {
          type: "object",
          properties: {
            total_cases: { type: "integer" },
            resolved_cases: { type: "integer" },
            resolution_rate: { type: "number" },
            total_supports: { type: "integer" },
            total_observations: { type: "integer" },
            is_demo: { type: "boolean" },
            by_category: { type: "array", items: { type: "object" } },
            by_status: { type: "array", items: { type: "object" } },
            by_colonia: { type: "array", items: { type: "object" } },
            by_origin: { type: "array", items: { type: "object" } },
            by_community_verification: { type: "array", items: { type: "object" } },
            official_records_included: { type: "integer" },
            recent_resolved: {
              type: "array",
              items: { $ref: "#/components/schemas/CaseSummary" },
            },
            generated_at: { type: "string", format: "date-time" },
          },
        },
        RiskSignal: {
          type: "object",
          properties: {
            signal_id: { type: "string" },
            signal_type: { type: "string", enum: [...RISK_SIGNAL_TYPES] },
            area_label: { type: "string" },
            colonia: { type: ["string", "null"] },
            category: { type: "string", enum: [...CASE_CATEGORIES] },
            risk_level: { type: ["string", "null"], enum: [...RISK_LEVELS, null] },
            attention_index: { type: "integer", minimum: 0, maximum: 100 },
            finding: { type: "string" },
            recommended_action: { type: ["string", "null"] },
            spatial_precision: { type: "string", enum: ["coordinates", "colonia"] },
            centroid: { type: ["object", "null"] },
            radius_meters: { type: ["integer", "null"] },
            window_days: { type: ["integer", "null"] },
            current_window_count: { type: "integer" },
            previous_window_count: { type: ["integer", "null"] },
            change_ratio: { type: ["number", "null"] },
            valid_from: { type: "string", format: "date-time" },
            valid_until: { type: ["string", "null"], format: "date-time" },
            generated_at: { type: "string", format: "date-time" },
            approved_at: { type: "string", format: "date-time" },
            approved_by_role: { type: "string" },
            analysis_version: { type: "string" },
            limitations: { type: "array", items: { type: "string" } },
          },
        },
        RiskSignalList: { type: "array", items: { $ref: "#/components/schemas/RiskSignal" } },
        Health: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok", "degraded"] },
            api_version: { type: "string" },
            dataset: { type: "string", enum: ["demo", "live"] },
            checks: { type: "object" },
            generated_at: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "request_id"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
                request_id: { type: "string" },
              },
            },
          },
        },
      },
    },
    "x-canonical-contract": {
      source: "@/shared/votavia-contract",
      identity: "case_id (UUID)",
      status_mapping: {
        votavia_operational_status: "Case.status",
        external_government_status: "additive field (separate authority status)",
        community_verification_status: "additive field (independent verification)",
      },
    },
    "x-data-policy": {
      access: "read-only",
      authentication: "none required in v1",
      rate_limit: "120 requests/minute/IP by default; configurable via VOTAVIA_PUBLIC_RATE_LIMIT",
      cache_max_age_seconds: 30,
      official_feed_enabled: policy.enabled,
      official_feed_reason: policy.reason,
      never_exposed: [
        "correo o teléfono de la persona reportante",
        "enlaces mágicos, tokens o claves de acceso",
        "notas internas o de especialistas",
        "asignaciones gubernamentales no marcadas como públicas",
        "metadatos sensibles de evidencia",
        "casos no publicados",
        "registros importados sin licencia redistribuible o permiso verificado",
        "identificadores de evidencia del motor preventivo",
      ],
      coordinate_precision_meters: 110,
      sensitive_coordinate_precision_meters: 1100,
      source_records_are_not_scraped: true,
      official_cdmx_api: false,
    },
    "x-categories": categoryCatalog,
  } as const;
}
