import type { CaseCategory, CaseStatus } from "@/shared/votavia-contract";
import type {
  CommunityVerificationStatus,
  ExternalStatusKind,
  RecordOrigin,
} from "@/public-api/contract-extensions";
import {
  COMMUNITY_VERIFICATION_LABELS,
  RECORD_ORIGIN_LABELS,
} from "@/public-api/contract-extensions";
import type { RiskLevel, RiskSignalType } from "@/public-api/types";
import { stockPhoto } from "@/lib/stock-photos";

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  road_damage: "Baches y pavimento",
  street_lighting: "Luminarias y alumbrado",
  traffic_signals: "Semáforos y señalización",
  sidewalk_accessibility: "Banquetas y accesibilidad",
  trees_vegetation: "Árboles y vegetación",
  waste_sanitation: "Limpieza y residuos",
  parks_public_spaces: "Parques y espacio público",
  other: "Otros",
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  reported: "Reportado",
  under_review: "En revisión",
  assigned: "Asignado",
  in_progress: "En proceso",
  pending_verification: "Pendiente de verificación",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  critical: "Crítico",
};

export const SIGNAL_TYPE_LABELS: Record<RiskSignalType, string> = {
  repeated_reports: "Reportes repetidos",
  emerging_concentration: "Concentración emergente",
  recurring_problem: "Problema recurrente",
  high_severity_reports: "Reportes de alta severidad",
};

export const ORIGIN_LABELS: Record<RecordOrigin, string> = RECORD_ORIGIN_LABELS;

export const VERIFICATION_LABELS: Record<CommunityVerificationStatus, string> =
  COMMUNITY_VERIFICATION_LABELS;

export const EXTERNAL_STATUS_KIND_LABELS: Record<ExternalStatusKind, string> = {
  open: "Abierto en la fuente externa",
  in_progress: "En atención según la fuente externa",
  closed: "Cerrado por la autoridad (no equivale a resuelto)",
  unknown: "Sin estado externo conocido",
};

export const FRESHNESS_LABELS: Record<string, string> = {
  fresh: "Reciente (menos de 24 h)",
  aging: "Envejeciendo (24 a 72 h)",
  stale: "Desactualizado (más de 72 h)",
  unknown: "Sin dato de sincronización",
};

const CASE_ID = "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000011";

export const SAMPLE_CASE = `{
  "data": [
    {
      "case_id": "${CASE_ID}",
      "display_id": "VOT-0011",
      "category": "traffic_signals",
      "votavia_operational_status": "reported",
      "status": "reported",
      "external_government_status": null,
      "community_verification_status": "unverified",
      "community_verification": {
        "status": "unverified",
        "summary": null,
        "verified_at": null
      },
      "record_origin": "citizen",
      "provenance": null,
      "title": "Señal de alto caída en Calle López",
      "description": "La señal de alto del cruce con Independencia está tirada sobre la banqueta. Los vehículos no respetan el cruce.",
      "location": {
        "colonia": "Centro",
        "alcaldia": "Cuauhtémoc",
        "latitude": 19.43,
        "longitude": -99.14,
        "precision_meters": 1100
      },
      "photos": [
        {
          "photo_id": "${CASE_ID}-photo-1",
          "url": ${stockPhoto("semaforo-2")},
          "kind": "report",
          "caption": null,
          "created_at": "2026-10-25T12:00:00.000Z"
        }
      ],
      "support_count": 9,
      "observation_count": 1,
      "has_safety_concern": true,
      "has_accessibility_concern": false,
      "is_demo": true,
      "created_at": "2026-10-25T12:00:00.000Z",
      "updated_at": "2026-10-25T12:00:00.000Z",
      "resolved_at": null,
      "permalink": "/casos/${CASE_ID}"
    }
  ],
  "meta": {
    "request_id": "c1a2e535-8df7-4f37-9c54-1f0a1d60e5aa",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo",
    "page": 1,
    "page_size": 20,
    "total": 14,
    "total_pages": 1,
    "has_more": false
  }
}`;

const DETAIL_ID = "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001";

export const SAMPLE_CASE_DETAIL = `{
  "data": {
    "case_id": "${DETAIL_ID}",
    "display_id": "VOT-0001",
    "category": "road_damage",
    "votavia_operational_status": "in_progress",
    "status": "in_progress",
    "external_government_status": null,
    "community_verification_status": "unverified",
    "community_verification": {
      "status": "unverified",
      "summary": null,
      "verified_at": null
    },
    "record_origin": "citizen",
    "provenance": null,
    "title": "Bache profundo en Río Pánuco y Río Tiber",
    "description": "Bache de aproximadamente un metro frente al 42. Para dar seguimiento escribe a [correo protegido] o llama al [teléfono protegido].",
    "location": {
      "colonia": "Roma Norte",
      "alcaldia": "Cuauhtémoc",
      "latitude": 19.42,
      "longitude": -99.16,
      "precision_meters": 1100
    },
    "photos": [
      {
        "photo_id": "${DETAIL_ID}-photo-1",
        "url": ${stockPhoto("bache-1")},
        "kind": "report",
        "caption": "Bache frente al 42",
        "created_at": "2026-10-06T12:00:00.000Z"
      }
    ],
    "support_count": 42,
    "observation_count": 1,
    "has_safety_concern": true,
    "has_accessibility_concern": false,
    "is_demo": true,
    "created_at": "2026-10-06T12:00:00.000Z",
    "updated_at": "2026-10-28T12:00:00.000Z",
    "resolved_at": null,
    "permalink": "/casos/${DETAIL_ID}",
    "timeline": [
      {
        "event_id": "${DETAIL_ID}-event-0",
        "type": "reported",
        "actor_type": "citizen",
        "title": "Reporte recibido",
        "description": "El reporte se recibió y quedó en la cola de revisión.",
        "created_at": "2026-10-06T13:00:00.000Z"
      },
      {
        "event_id": "${DETAIL_ID}-event-3",
        "type": "in_progress",
        "actor_type": "government",
        "title": "Trabajo en proceso",
        "description": "Actualización pública del seguimiento del caso.",
        "created_at": "2026-10-28T12:00:00.000Z"
      }
    ],
    "observations": [
      {
        "observation_id": "${DETAIL_ID}-obs-1",
        "kind": "comment",
        "body": "Confirmo que el problema sigue presente esta semana.",
        "actor_type": "citizen",
        "created_at": "2026-10-28T12:00:00.000Z"
      }
    ]
  },
  "meta": {
    "request_id": "8ad68e8e-87b6-4f19-9fbc-8ca8c0a28ca6",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo"
  }
}`;

export const SAMPLE_STATISTICS = `{
  "data": {
    "total_cases": 14,
    "resolved_cases": 3,
    "resolution_rate": 21.4,
    "total_supports": 299,
    "total_observations": 14,
    "official_records_included": 1,
    "is_demo": true,
    "by_category": [
      { "category": "road_damage", "count": 2, "resolved": 0 },
      { "category": "street_lighting", "count": 2, "resolved": 1 },
      { "category": "waste_sanitation", "count": 3, "resolved": 0 }
    ],
    "by_status": [
      { "status": "in_progress", "count": 3 },
      { "status": "resolved", "count": 3 },
      { "status": "closed", "count": 1 }
    ],
    "by_colonia": [
      { "colonia": "Roma Norte", "count": 4, "resolved": 0, "supports": 125 },
      { "colonia": "Centro", "count": 3, "resolved": 1, "supports": 38 }
    ],
    "by_origin": [
      { "record_origin": "citizen", "count": 12 },
      { "record_origin": "government_import", "count": 1 },
      { "record_origin": "community", "count": 1 }
    ],
    "by_community_verification": [
      { "community_verification_status": "unverified", "count": 12 },
      { "community_verification_status": "not_applicable", "count": 1 },
      { "community_verification_status": "community_confirmed", "count": 1 }
    ],
    "recent_resolved": [
      {
        "case_id": "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000005",
        "display_id": "VOT-0005",
        "category": "sidewalk_accessibility",
        "votavia_operational_status": "resolved",
        "status": "resolved",
        "external_government_status": null,
        "community_verification_status": "unverified",
        "record_origin": "citizen",
        "title": "Rampa obstruida en Metro Insurgentes",
        "colonia": "Juárez",
        "support_count": 22,
        "resolved_at": "2026-10-24T12:00:00.000Z",
        "created_at": "2026-09-30T12:00:00.000Z",
        "permalink": "/casos/0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000005"
      }
    ],
    "generated_at": "2026-10-30T18:00:00.000Z"
  },
  "meta": {
    "request_id": "e53e29a0-f84a-4d66-97a0-e5c00d6da4ca",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo"
  }
}`;

export const SAMPLE_GEOJSON = `{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000012",
      "geometry": {
        "type": "Point",
        "coordinates": [-99.145, 19.414]
      },
      "properties": {
        "case_id": "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000012",
        "display_id": "VOT-0012",
        "category": "sidewalk_accessibility",
        "votavia_operational_status": "under_review",
        "external_government_status_label": null,
        "external_government_status_kind": null,
        "community_verification_status": "unverified",
        "record_origin": "citizen",
        "title": "Banqueta rota en Avenida Obrera",
        "colonia": "Obrera",
        "alcaldia": "Cuauhtémoc",
        "support_count": 14,
        "created_at": "2026-10-24T12:00:00.000Z",
        "updated_at": "2026-10-28T12:00:00.000Z",
        "permalink": "/casos/0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000012",
        "spatial_precision": "block",
        "coordinate_precision_meters": 110,
        "source_name": null,
        "official_folio": null,
        "source_url": null,
        "license_id": null,
        "freshness": null
      }
    },
    {
      "type": "Feature",
      "id": "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000011",
      "geometry": null,
      "properties": {
        "case_id": "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000011",
        "display_id": "VOT-0011",
        "category": "traffic_signals",
        "votavia_operational_status": "reported",
        "community_verification_status": "unverified",
        "record_origin": "citizen",
        "title": "Señal de alto caída en Calle López",
        "colonia": "Centro",
        "alcaldia": "Cuauhtémoc",
        "support_count": 9,
        "spatial_precision": "coarse",
        "coordinate_precision_meters": 1100
      }
    }
  ],
  "meta": {
    "request_id": "0d6b7a0e-52a1-4f5b-9d1c-6f0e2a4b7c10",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo",
    "count": 2
  },
  "provenance": {
    "attribution": "VotaVía · datos cívicos abiertos. Ver /desarrolladores para licencias y limitaciones.",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "license": "Consulta /desarrolladores para la licencia de cada conjunto de datos.",
    "limitations": [
      "Solo incluye registros publicados y aprobados para publicación.",
      "Las coordenadas están redondeadas; los casos con preocupación de seguridad se publican a mayor escala.",
      "La cobertura no es completa: refleja lo reportado y lo importado con permiso vigente.",
      "Un cierre gubernamental no equivale a una resolución verificada."
    ]
  }
}`;

export const SAMPLE_CATEGORIES = `{
  "data": {
    "categories": [
      {
        "category": "road_damage",
        "label": "Baches y pavimento",
        "description": "Baches, hundimientos, grietas y pavimento en mal estado.",
        "count": 2,
        "resolved": 0,
        "record_origins": ["citizen"]
      },
      {
        "category": "waste_sanitation",
        "label": "Limpieza y residuos",
        "description": "Basura acumulada, contenedores desbordados y escombros.",
        "count": 3,
        "resolved": 0,
        "record_origins": ["citizen", "government_import"]
      },
      {
        "category": "other",
        "label": "Otros",
        "description": "Problemas urbanos que no encajan en las categorías anteriores.",
        "count": 0,
        "resolved": 0,
        "record_origins": []
      }
    ],
    "total_published": 14,
    "generated_at": "2026-10-30T18:00:00.000Z"
  },
  "meta": {
    "request_id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo",
    "count": 8
  }
}`;

export const SAMPLE_OFFICIAL_REPORTS = `{
  "data": [
    {
      "case_id": "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000014",
      "display_id": "VOT-0014",
      "category": "waste_sanitation",
      "votavia_operational_status": "pending_verification",
      "status": "pending_verification",
      "external_government_status": {
        "code": "CLOSED_BY_AGENCY",
        "label": "Cerrado por la autoridad",
        "kind": "closed",
        "reported_at": "2026-10-27T12:00:00.000Z"
      },
      "community_verification_status": "not_applicable",
      "community_verification": {
        "status": "not_applicable",
        "summary": null,
        "verified_at": null
      },
      "record_origin": "government_import",
      "provenance": {
        "record_origin": "government_import",
        "dataset": "cdmx-311-demo",
        "source_name": "Tablero 311 CDMX (demostración)",
        "source_url": "https://tablero311.cdmx.gob.mx/registro/8871",
        "official_folio": "CDMX-311-8871",
        "source_reported_at": "2026-10-09T12:00:00.000Z",
        "last_synced_at": "2026-10-29T12:00:00.000Z",
        "license": {
          "id": "demo-cc-by-4.0",
          "name": "Creative Commons Atribución 4.0 (demostración)",
          "url": "https://creativecommons.org/licenses/by/4.0/",
          "redistributable": true
        },
        "permission": {
          "verified": true,
          "verified_at": "2026-09-30T12:00:00.000Z",
          "reference": "https://example.org/permissions/demo-311"
        },
        "attribution": "Datos de demostración inspirados en un tablero público.",
        "freshness": {
          "status": "aging",
          "age_hours": 30,
          "checked_at": "2026-10-30T18:00:00.000Z"
        },
        "is_demo": true
      },
      "title": "Reporte oficial: residuos en vía pública (folio CDMX-311-8871)",
      "description": "Registro importado del tablero público. El reporte original menciona un contacto en [correo protegido] y el teléfono [teléfono protegido]. Requiere verificación de campo.",
      "location": {
        "colonia": "Centro",
        "alcaldia": "Cuauhtémoc",
        "latitude": 19.433,
        "longitude": -99.133,
        "precision_meters": 110
      },
      "photos": [
        {
          "photo_id": "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000014-photo-1",
          "url": ${stockPhoto("bache-1")},
          "kind": "report",
          "caption": null,
          "created_at": "2026-10-10T12:00:00.000Z"
        }
      ],
      "support_count": 5,
      "observation_count": 1,
      "has_safety_concern": false,
      "has_accessibility_concern": false,
      "is_demo": true,
      "created_at": "2026-10-10T12:00:00.000Z",
      "updated_at": "2026-10-27T12:00:00.000Z",
      "resolved_at": null,
      "permalink": "/casos/0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000014"
    }
  ],
  "meta": {
    "request_id": "b1e2d3c4-5f60-4a7b-8c9d-0e1f2a3b4c5d",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo",
    "page": 1,
    "page_size": 20,
    "total": 1,
    "total_pages": 1,
    "has_more": false,
    "official_feed": {
      "enabled": false,
      "reason": "disabled_by_configuration",
      "note": "El feed de registros gubernamentales está desactivado. No se publican registros importados.",
      "license": null,
      "attribution": null,
      "last_synced_at": null
    }
  }
}`;

export const SAMPLE_HEALTH = `{
  "data": {
    "status": "ok",
    "api_version": "v1",
    "dataset": "demo",
    "checks": {
      "data_source": {
        "status": "ok",
        "detail": "Datos de demostración deterministas; no hay plataforma conectada."
      },
      "official_municipal_feed": {
        "status": "disabled",
        "detail": "El feed de registros gubernamentales está desactivado. No se publican registros importados."
      },
      "preventive_signals": {
        "status": "ok",
        "detail": "Feed de señales aprobadas configurado."
      },
      "rate_limiting": {
        "status": "ok",
        "detail": "Límite por instancia; se recomienda además limitar en el borde (CDN/WAF)."
      }
    },
    "generated_at": "2026-10-30T18:00:00.000Z"
  },
  "meta": {
    "request_id": "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo"
  }
}`;

export const SAMPLE_RISK = `{
  "data": [
    {
      "signal_id": "signal-2026-10-29-roma-baches",
      "signal_type": "emerging_concentration",
      "area_label": "Roma Norte · corredor Río Pánuco",
      "colonia": "Roma Norte",
      "category": "road_damage",
      "risk_level": "high",
      "attention_index": 78,
      "finding": "Se concentraron 6 reportes de baches en un radio de 250 m durante los últimos 14 días, frente a 2 en la ventana anterior.",
      "recommended_action": "Programar una inspección conjunta del tramo y revisar si hay una fuga de agua subyacente.",
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
      "limitations": [
        "Indica concentración de reportes, no una probabilidad de falla.",
        "Puede reflejar mayor participación vecinal en la zona."
      ]
    }
  ],
  "meta": {
    "request_id": "0f8a5f9d-b1c2-4d15-9c8a-4b0a7f5f5b11",
    "api_version": "v1",
    "generated_at": "2026-10-30T18:00:00.000Z",
    "dataset": "demo",
    "count": 1
  }
}`;

export const SAMPLE_ERROR = `{
  "error": {
    "code": "invalid_request",
    "message": "Revisa los parámetros de la solicitud.",
    "details": [
      {
        "parameter": "page_size",
        "message": "Too big: expected number to be <=50"
      }
    ],
    "request_id": "4b971c84-13bc-4b4f-b6d1-08b6e4ec9a2b"
  }
}`;

export function listCurl(base: string) {
  return `curl --request GET \\
  --url "${base}/api/v1/public/cases?alcaldia=Cuauht%C3%A9moc&category=road_damage%2Cstreet_lighting&page_size=10" \\
  --header "Accept: application/json"`;
}

export function listFetch(base: string) {
  return `const params = new URLSearchParams({
  status: "reported",
  origin: "citizen",
  sort: "supported",
  page_size: "20",
});

const response = await fetch(
  "${base}/api/v1/public/cases?" + params,
  { headers: { Accept: "application/json" } },
);

if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
const { data, meta } = await response.json();

console.log(meta.total, data[0]?.votavia_operational_status);`;
}

export function listPython(base: string) {
  return `import requests

response = requests.get(
    "${base}/api/v1/public/cases",
    params={
        "colonia": "Roma Norte",
        "created_from": "2026-10-01",
        "min_support": 10,
        "page_size": 20,
    },
    headers={"Accept": "application/json"},
    timeout=10,
)
response.raise_for_status()

payload = response.json()
for case in payload["data"]:
    print(case["display_id"], case["votavia_operational_status"], case["title"])`;
}

export function detailCurl(base: string) {
  return `curl --request GET \\
  --url "${base}/api/v1/public/cases/${DETAIL_ID}" \\
  --header "Accept: application/json"`;
}

export function statsCurl(base: string) {
  return `curl --request GET \\
  --url "${base}/api/v1/public/statistics" \\
  --header "Accept: application/json"`;
}

export function riskCurl(base: string) {
  return `curl --request GET \\
  --url "${base}/api/v1/public/risk-signals?risk_level=high%2Ccritical" \\
  --header "Accept: application/json"`;
}

export function geoJsonCurl(base: string) {
  return `curl --request GET \\
  --url "${base}/api/v1/public/cases.geojson?bbox=-99.20%2C19.38%2C-99.10%2C19.46&limit=200" \\
  --header "Accept: application/geo+json"`;
}

export function categoriesCurl(base: string) {
  return `curl --request GET \\
  --url "${base}/api/v1/public/categories" \\
  --header "Accept: application/json"`;
}

export function officialReportsCurl(base: string) {
  return `curl --request GET \\
  --url "${base}/api/v1/public/official-reports?category=waste_sanitation" \\
  --header "Accept: application/json"`;
}

export function healthCurl(base: string) {
  return `curl --request GET --url "${base}/api/v1/public/health"`;
}

export function openApiCurl(base: string) {
  return `curl --request GET --url "${base}/api/v1/public/openapi.json"`;
}

export function detailFetch(base: string) {
  return `const caseId = "${DETAIL_ID}";
const response = await fetch(
  \`${base}/api/v1/public/cases/\${caseId}\`,
  { headers: { Accept: "application/json" } },
);

if (response.status === 404) {
  console.log("El caso no existe o no está publicado.");
} else {
  const { data } = await response.json();
  console.log(data.display_id, data.votavia_operational_status, data.timeline.length);
}`;
}

export function detailPython(base: string) {
  return `import requests

case_id = "${DETAIL_ID}"
response = requests.get(
    f"${base}/api/v1/public/cases/{case_id}",
    headers={"Accept": "application/json"},
    timeout=10,
)

if response.status_code == 404:
    print("El caso no existe o no está publicado.")
else:
    response.raise_for_status()
    case = response.json()["data"]
    print(case["display_id"], case["votavia_operational_status"], len(case["timeline"]))`;
}

export function statsFetch(base: string) {
  return `const response = await fetch("${base}/api/v1/public/statistics", {
  headers: { Accept: "application/json" },
});

if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
const { data } = await response.json();

console.log(data.total_cases, data.resolved_cases);
console.table(data.by_origin);`;
}

export function statsPython(base: string) {
  return `import requests

response = requests.get(
    "${base}/api/v1/public/statistics",
    headers={"Accept": "application/json"},
    timeout=10,
)
response.raise_for_status()
data = response.json()["data"]

print(data["total_cases"], "casos publicados")
for row in data["by_category"]:
    print(row["category"], row["count"], row["resolved"])`;
}

export function riskFetch(base: string) {
  return `const response = await fetch(
  "${base}/api/v1/public/risk-signals?risk_level=high%2Ccritical",
  { headers: { Accept: "application/json" } },
);

if (response.status === 503) {
  console.log("Las señales preventivas no están disponibles por ahora.");
} else {
  const { data } = await response.json();
  for (const signal of data) {
    console.log(signal.signal_type, signal.area_label, signal.finding);
  }
}`;
}

export function riskPython(base: string) {
  return `import requests

response = requests.get(
    "${base}/api/v1/public/risk-signals",
    params={"risk_level": "high,critical"},
    headers={"Accept": "application/json"},
    timeout=10,
)

if response.status_code == 503:
    print("Las señales preventivas no están disponibles por ahora.")
else:
    response.raise_for_status()
    for signal in response.json()["data"]:
        print(signal["signal_type"], signal["area_label"])`;
}

export function geoJsonFetch(base: string) {
  return `const response = await fetch(
  "${base}/api/v1/public/cases.geojson?alcaldia=Cuauht%C3%A9moc&limit=200",
  { headers: { Accept: "application/geo+json" } },
);

if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
const collection = await response.json();

for (const feature of collection.features) {
  if (feature.geometry === null) continue; // ubicación protegida
  console.log(feature.id, feature.properties.votavia_operational_status);
}`;
}

export function categoriesFetch(base: string) {
  return `const response = await fetch("${base}/api/v1/public/categories", {
  headers: { Accept: "application/json" },
});

const { data } = await response.json();

for (const category of data.categories) {
  console.log(category.category, category.label, category.count, category.record_origins);
}`;
}

export function officialReportsFetch(base: string) {
  return `const response = await fetch(
  "${base}/api/v1/public/official-reports?origin=government_import",
  { headers: { Accept: "application/json" } },
);

const { data, meta } = await response.json();

console.log("feed habilitado:", meta.official_feed.enabled);
for (const record of data) {
  console.log(
    record.provenance.official_folio,
    record.votavia_operational_status,
    record.external_government_status?.label ?? "sin estado externo",
  );
}`;
}

export function healthFetch(base: string) {
  return `const response = await fetch("${base}/api/v1/public/health", {
  headers: { Accept: "application/json" },
});

const { data } = await response.json();

console.log(data.status, data.dataset);
console.log(data.checks.official_municipal_feed.status);`;
}
