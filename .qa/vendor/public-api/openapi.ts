import { CASE_CATEGORIES, CASE_STATUSES } from "@/shared/votavia-contract";
import { PUBLIC_API_VERSION, RISK_LEVELS, RISK_SIGNAL_TYPES } from "./types";

const errorResponse = {
  description: "Solicitud inválida",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

function envelope(schema: string, extra = {}) {
  return {
    type: "object",
    required: ["data", "meta"],
    properties: {
      data: { $ref: `#/components/schemas/${schema}` },
      meta: { $ref: "#/components/schemas/Meta" },
      ...extra,
    },
  };
}

export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "VotaVía · API pública",
      version: PUBLIC_API_VERSION,
      summary: "Consulta de casos urbanos publicados en la alcaldía Cuauhtémoc.",
      description:
        "API de solo lectura. Expone únicamente información aprobada para publicación; nunca identidades, correos, notas internas ni datos de especialistas.",
      contact: { name: "Equipo VotaVía", url: "/desarrolladores" },
      license: { name: "Uso cívico con atribución" },
    },
    servers: [{ url: "/", description: "Mismo dominio de VotaVía" }],
    security: [],
    tags: [
      { name: "Casos", description: "Reportes públicos aprobados." },
      { name: "Estadísticas", description: "Agregados del conjunto publicado." },
      { name: "Señales preventivas", description: "Salidas aprobadas del motor preventivo." },
    ],
    paths: {
      "/api/v1/public/cases": {
        get: {
          tags: ["Casos"],
          operationId: "listPublicCases",
          summary: "Lista casos publicados",
          parameters: [
            {
              name: "category",
              in: "query",
              description: "Categorías separadas por coma.",
              schema: { type: "string", example: "road_damage,street_lighting" },
            },
            {
              name: "status",
              in: "query",
              description: "Estados separados por coma.",
              schema: { type: "string", example: "reported,in_progress" },
            },
            { name: "colonia", in: "query", schema: { type: "string", maxLength: 80 } },
            { name: "q", in: "query", description: "Búsqueda en título, descripción y colonia.", schema: { type: "string", maxLength: 120 } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["recent", "supported"], default: "recent" } },
          ],
          responses: {
            "200": {
              description: "Lista paginada de casos",
              content: {
                "application/json": {
                  schema: envelope(
                    "CaseList",
                    { meta: { $ref: "#/components/schemas/PaginationMeta" } },
                  ),
                },
              },
            },
            "400": errorResponse,
            "429": errorResponse,
          },
        },
      },
      "/api/v1/public/cases/{id}": {
        get: {
          tags: ["Casos"],
          operationId: "getPublicCase",
          summary: "Obtiene un caso por case_id (UUID)",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "UUID del caso. Los identificadores VOT-0001 no son aceptados.",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Detalle del caso con cronología pública y observaciones publicadas",
              content: {
                "application/json": {
                  schema: envelope("CaseDetail"),
                },
              },
            },
            "400": errorResponse,
            "404": { description: "Caso inexistente o no publicado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "429": errorResponse,
          },
        },
      },
      "/api/v1/public/statistics": {
        get: {
          tags: ["Estadísticas"],
          operationId: "getPublicStatistics",
          summary: "Agregados de casos publicados",
          responses: {
            "200": {
              description: "Estadísticas agregadas",
              content: { "application/json": { schema: envelope("Statistics") } },
            },
            "429": errorResponse,
          },
        },
      },
      "/api/v1/public/risk-signals": {
        get: {
          tags: ["Señales preventivas"],
          operationId: "listRiskSignals",
          summary: "Señales preventivas aprobadas para publicación",
          description:
            "No es una predicción ni una probabilidad. Solo incluye señales calculadas por el motor preventivo y aprobadas por una persona revisora.",
          parameters: [
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "colonia", in: "query", schema: { type: "string" } },
            {
              name: "risk_level",
              in: "query",
              schema: { type: "string", enum: [...RISK_LEVELS] },
            },
            {
              name: "signal_type",
              in: "query",
              schema: { type: "string", enum: [...RISK_SIGNAL_TYPES] },
            },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          ],
          responses: {
            "200": {
              description: "Señales aprobadas, ordenadas por índice de atención",
              content: { "application/json": { schema: envelope("RiskSignalList") } },
            },
            "503": { description: "Publicación de señales no habilitada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "429": errorResponse,
          },
        },
      },
    },
    components: {
      schemas: {
        Meta: {
          type: "object",
          required: ["request_id", "api_version", "generated_at", "dataset"],
          properties: {
            request_id: { type: "string", format: "uuid" },
            api_version: { type: "string", const: "v1" },
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
        Location: {
          type: "object",
          required: ["colonia", "alcaldia", "latitude", "longitude", "precision_meters"],
          properties: {
            colonia: { type: "string" },
            alcaldia: { type: "string" },
            latitude: { type: "number", description: "Redondeada a 3 decimales (~110 m)." },
            longitude: { type: "number", description: "Redondeada a 3 decimales (~110 m)." },
            precision_meters: { type: "integer", const: 110 },
          },
        },
        Photo: {
          type: "object",
          required: ["photo_id", "url", "kind", "caption", "created_at"],
          properties: {
            photo_id: { type: "string" },
            url: { type: "string" },
            kind: { type: "string", enum: ["report", "before", "after"] },
            caption: { type: ["string", "null"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Case: {
          type: "object",
          required: [
            "case_id", "display_id", "category", "status", "title", "description",
            "location", "photos", "support_count", "observation_count",
            "has_safety_concern", "has_accessibility_concern", "is_demo",
            "created_at", "updated_at", "resolved_at", "permalink",
          ],
          properties: {
            case_id: { type: "string", format: "uuid" },
            display_id: { type: "string", example: "VOT-0042" },
            category: { type: "string", enum: [...CASE_CATEGORIES] },
            status: { type: "string", enum: [...CASE_STATUSES] },
            title: { type: "string" },
            description: { type: "string" },
            location: { $ref: "#/components/schemas/Location" },
            photos: { type: "array", items: { $ref: "#/components/schemas/Photo" }, maxItems: 8 },
            support_count: { type: "integer" },
            observation_count: { type: "integer" },
            has_safety_concern: { type: "boolean" },
            has_accessibility_concern: { type: "boolean" },
            is_demo: { type: "boolean" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            resolved_at: { type: ["string", "null"], format: "date-time" },
            permalink: { type: "string" },
          },
        },
        CaseList: { type: "array", items: { $ref: "#/components/schemas/Case" } },
        TimelineEvent: {
          type: "object",
          properties: {
            event_id: { type: "string" },
            type: { type: "string" },
            actor_type: { type: "string", enum: ["citizen", "community", "government", "specialist", "system"] },
            title: { type: "string" },
            description: { type: ["string", "null"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Observation: {
          type: "object",
          properties: {
            observation_id: { type: "string" },
            kind: { type: "string", enum: ["comment", "still_happening", "safety_concern", "accessibility_concern"] },
            body: { type: "string" },
            actor_type: { type: "string" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        CaseDetail: {
          allOf: [
            { $ref: "#/components/schemas/Case" },
            {
              type: "object",
              required: ["timeline", "observations"],
              properties: {
                timeline: { type: "array", items: { $ref: "#/components/schemas/TimelineEvent" } },
                observations: { type: "array", items: { $ref: "#/components/schemas/Observation" } },
              },
            },
          ],
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
            recent_resolved: { type: "array", items: { $ref: "#/components/schemas/Case" } },
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
    "x-privacy": {
      never_exposed: [
        "correo o teléfono de la persona reportante",
        "notas internas o de especialistas",
        "casos no publicados",
        "metadatos internos de eventos",
        "identificadores de evidencia del motor preventivo",
      ],
      coordinate_precision_meters: 110,
    },
  } as const;
}
