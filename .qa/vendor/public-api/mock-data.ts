import { ALCALDIA, type Case, type CaseTimelineEvent, type ReportObservation } from "@/shared/votavia-contract";
import type { ApprovedRiskSignal } from "./risk";

/**
 * Deterministic demo dataset. It deliberately contains extra "private" keys at
 * runtime (reporter email, phone, internal notes, specialist notes) so the
 * test suite can prove they never reach the public projection.
 */
export type MockCase = Case & Record<string, unknown>;

export const DEMO_NOW = "2026-10-30T12:00:00.000Z";

const iso = (daysAgo: number, hoursAgo = 0) =>
  new Date(Date.parse(DEMO_NOW) - daysAgo * 86_400_000 - hoursAgo * 3_600_000).toISOString();

function base(
  n: number,
  input: {
    category: Case["category"];
    status: Case["status"];
    title: string;
    description: string;
    colonia: string;
    latitude: number;
    longitude: number;
    address_hint?: string;
    support_count: number;
    photos?: Array<{ url: string; kind: "report" | "before" | "after"; caption?: string }>;
    safety?: boolean;
    accessibility?: boolean;
    created_days: number;
    updated_days: number;
    resolved_days?: number;
    published?: boolean;
    extra?: Record<string, unknown>;
  },
): MockCase {
  const case_id = `0b7f1f3e-6f2a-4a1c-9a58-1c1e8d${String(n).padStart(6, "0")}`;
  const photos = (input.photos ?? [{ url: "/demo/bache-1.svg", kind: "report" as const }]).map(
    (photo, index) => ({
      photo_id: `${case_id}-photo-${index + 1}`,
      case_id,
      url: photo.url,
      kind: photo.kind,
      caption: photo.caption ?? null,
      created_at: iso(input.created_days),
    }),
  );

  return {
    case_id,
    display_id: `VOT-${String(n).padStart(4, "0")}`,
    category: input.category,
    status: input.status,
    title: input.title,
    description: input.description,
    location: {
      latitude: input.latitude,
      longitude: input.longitude,
      colonia: input.colonia,
      address_hint: input.address_hint ?? null,
      alcaldia: ALCALDIA,
    },
    colonia: input.colonia,
    latitude: input.latitude,
    longitude: input.longitude,
    photos,
    support_count: input.support_count,
    supported_by_me: false,
    observation_count: 1,
    has_safety_concern: input.safety ?? false,
    has_accessibility_concern: input.accessibility ?? false,
    is_demo: true,
    is_published: input.published ?? true,
    created_at: iso(input.created_days),
    updated_at: iso(input.updated_days),
    resolved_at: input.resolved_days === undefined ? null : iso(input.resolved_days),
    ...input.extra,
  };
}

export const demoCases: MockCase[] = [
  base(1, {
    category: "road_damage",
    status: "in_progress",
    title: "Bache profundo en Río Pánuco y Río Tiber",
    description:
      "Bache de aproximadamente un metro frente al 42, sobre la calle. Los autos frenan o invaden el carril contrario. Para seguimiento escribí a vecinos@example.com o al 55 1234 5678.",
    colonia: "Roma Norte",
    latitude: 19.4152,
    longitude: -99.1642,
    address_hint: "Río Pánuco 42, entre Río Tiber y Río Nilo",
    support_count: 42,
    photos: [
      { url: "/demo/bache-1.svg", kind: "report", caption: "Bache frente al 42" },
      { url: "/demo/bache-2.svg", kind: "report", caption: "Vista desde la banqueta" },
    ],
    safety: true,
    created_days: 24,
    updated_days: 2,
    extra: {
      created_by_user_id: "user-secret-123",
      reporter_email: "residenta@example.com",
      reporter_phone: "+52 55 9999 0000",
      internal_notes: "No publicar: conflicto vecinal pendiente.",
      specialist_notes: "Cuadrilla asignada; costo estimado 18,000 MXN.",
      private_notes: "Nota privada de la unidad territorial.",
    },
  }),
  base(2, {
    category: "street_lighting",
    status: "reported",
    title: "Luminaria apagada en Parque México",
    description:
      "Una luminaria del andador central lleva tres semanas apagada. La zona queda oscura después de las 19:00.",
    colonia: "Condesa",
    latitude: 19.4113,
    longitude: -99.1703,
    address_hint: "Andador central de Parque México, cerca del foro",
    support_count: 31,
    photos: [{ url: "/demo/luminaria-1.svg", kind: "report" }],
    safety: true,
    created_days: 18,
    updated_days: 18,
    extra: { reporter_email: "alguien@example.com" },
  }),
  base(3, {
    category: "waste_sanitation",
    status: "under_review",
    title: "Acumulación de basura en Av. Chapultepec",
    description:
      "Los contenedores llevan cuatro días desbordados. Hay bolsas en la banqueta, mal olor y fauna nociva.",
    colonia: "Juárez",
    latitude: 19.4231,
    longitude: -99.1611,
    address_hint: "Av. Chapultepec 118, esquina con Havre",
    support_count: 27,
    photos: [{ url: "/demo/basura-1.svg", kind: "report" }],
    accessibility: true,
    created_days: 9,
    updated_days: 4,
  }),
  base(4, {
    category: "traffic_signals",
    status: "assigned",
    title: "Semáforo peatonal descompuesto en Av. Insurgentes",
    description:
      "El semáforo peatonal del cruce con Roma no funciona desde el lunes. Personas con carriola y personas mayores cruzan con el tráfico en movimiento.",
    colonia: "Roma Norte",
    latitude: 19.4171,
    longitude: -99.1628,
    address_hint: "Av. Insurgentes Sur esquina con Roma",
    support_count: 38,
    photos: [{ url: "/demo/semaforo-1.svg", kind: "report" }],
    safety: true,
    accessibility: true,
    created_days: 14,
    updated_days: 5,
  }),
  base(5, {
    category: "sidewalk_accessibility",
    status: "resolved",
    title: "Rampa obstruida en Metro Insurgentes",
    description:
      "Una rampa de acceso estaba bloqueada por puestos y material de obra. Ya se liberó el paso.",
    colonia: "Juárez",
    latitude: 19.4198,
    longitude: -99.1639,
    address_hint: "Salida sur de Metro Insurgentes",
    support_count: 22,
    photos: [
      { url: "/demo/banqueta-1.svg", kind: "before", caption: "Paso obstruido" },
      { url: "/demo/banqueta-2.svg", kind: "after", caption: "Paso liberado" },
    ],
    accessibility: true,
    created_days: 30,
    updated_days: 6,
    resolved_days: 6,
  }),
  base(6, {
    category: "trees_vegetation",
    status: "resolved",
    title: "Árbol con rama en riesgo en Parque Pushkin",
    description:
      "Una rama de gran tamaño quedó inclinada sobre el paso peatonal. El equipo de arbolado la retiró.",
    colonia: "Condesa",
    latitude: 19.4137,
    longitude: -99.1718,
    support_count: 19,
    photos: [
      { url: "/demo/arbol-antes.svg", kind: "before" },
      { url: "/demo/arbol-despues.svg", kind: "after" },
    ],
    safety: true,
    created_days: 26,
    updated_days: 12,
    resolved_days: 12,
  }),
  base(7, {
    category: "parks_public_spaces",
    status: "in_progress",
    title: "Juegos infantiles dañados en Parque Hundido",
    description:
      "El columpio principal tiene una cadena rota y el piso de caucho está levantado. Hay riesgo de caída.",
    colonia: "San Rafael",
    latitude: 19.4082,
    longitude: -99.1781,
    address_hint: "Área de juegos, Parque Hundido",
    support_count: 16,
    photos: [{ url: "/demo/parque-1.svg", kind: "report" }],
    safety: true,
    accessibility: true,
    created_days: 11,
    updated_days: 3,
  }),
  base(8, {
    category: "road_damage",
    status: "pending_verification",
    title: "Hundimiento en calle Colima",
    description:
      "El pavimento se hundió junto a una coladera. Se colocó señalización provisional y falta la reparación definitiva.",
    colonia: "Roma Norte",
    latitude: 19.4138,
    longitude: -99.1648,
    address_hint: "Colima 210",
    support_count: 12,
    photos: [{ url: "/demo/bache-2.svg", kind: "report" }],
    safety: true,
    created_days: 8,
    updated_days: 1,
  }),
  base(9, {
    category: "waste_sanitation",
    status: "closed",
    title: "Escombros en banqueta de Doctor Vértiz",
    description:
      "Material de construcción ocupaba la banqueta durante una semana. El propietario lo retiró.",
    colonia: "Doctores",
    latitude: 19.4204,
    longitude: -99.1469,
    support_count: 7,
    photos: [{ url: "/demo/basura-2.svg", kind: "report" }],
    accessibility: true,
    created_days: 40,
    updated_days: 20,
    resolved_days: 21,
  }),
  base(10, {
    category: "street_lighting",
    status: "resolved",
    title: "Luminarias intermitentes en Calle de Regina",
    description:
      "Tres luminarias del pasaje parpadeaban toda la noche. Se reemplazaron los balastros.",
    colonia: "Centro",
    latitude: 19.4269,
    longitude: -99.1348,
    support_count: 24,
    photos: [{ url: "/demo/luminaria-2.svg", kind: "report" }],
    created_days: 35,
    updated_days: 15,
    resolved_days: 15,
  }),
  base(11, {
    category: "traffic_signals",
    status: "reported",
    title: "Señal de alto caída en Calle López",
    description:
      "La señal de alto del cruce con Independencia está tirada sobre la banqueta. Los vehículos no respetan el cruce.",
    colonia: "Centro",
    latitude: 19.4287,
    longitude: -99.1402,
    support_count: 9,
    photos: [{ url: "/demo/semaforo-2.svg", kind: "report" }],
    safety: true,
    created_days: 5,
    updated_days: 5,
  }),
  base(12, {
    category: "sidewalk_accessibility",
    status: "under_review",
    title: "Banqueta rota en Avenida Obrera",
    description:
      "El concreto está fracturado en tres tramos y una silla de ruedas no puede pasar sin bajar a la calle.",
    colonia: "Obrera",
    latitude: 19.4143,
    longitude: -99.1451,
    support_count: 14,
    photos: [{ url: "/demo/banqueta-1.svg", kind: "report" }],
    accessibility: true,
    created_days: 6,
    updated_days: 2,
  }),
  base(13, {
    category: "other",
    status: "reported",
    title: "Reporte en revisión de privacidad",
    description: "Este registro está despublicado y nunca debe aparecer en la API pública.",
    colonia: "Guerrero",
    latitude: 19.4361,
    longitude: -99.1462,
    address_hint: "Calle secreta 1",
    support_count: 3,
    photos: [{ url: "/demo/parque-2.svg", kind: "report" }],
    created_days: 2,
    updated_days: 2,
    published: false,
    extra: {
      reporter_email: "no-publicar@example.com",
      internal_notes: "Caso retirado a solicitud de la persona reportante.",
    },
  }),
];

export const demoObservations: Record<string, ReportObservation[]> = Object.fromEntries(
  demoCases.map((item) => {
    const rows: ReportObservation[] = [
      {
        observation_id: `${item.case_id}-obs-1`,
        case_id: item.case_id,
        kind: "comment",
        body:
          item.case_id.endsWith("000001")
            ? "Sigue el bache. Me pueden escribir a vecina@example.com o al 55 8888 7766."
            : "Confirmo que el problema sigue presente esta semana.",
        actor_type: "citizen",
        author_label: "Vecina o vecino de la colonia",
        created_at: item.updated_at,
      },
    ];
    return [item.case_id, rows];
  }),
);

const rank: Record<Case["status"], number> = {
  reported: 0,
  under_review: 1,
  assigned: 2,
  in_progress: 3,
  pending_verification: 4,
  resolved: 5,
  closed: 6,
};

const titles: Array<{ type: CaseTimelineEvent["type"]; title: string }> = [
  { type: "reported", title: "Reporte recibido" },
  { type: "under_review", title: "En revisión" },
  { type: "assigned", title: "Asignado a un equipo" },
  { type: "in_progress", title: "Trabajo en proceso" },
  { type: "pending_verification", title: "Pendiente de verificación" },
  { type: "resolved", title: "Resuelto" },
  { type: "closed", title: "Caso cerrado" },
];

export const demoTimeline: Record<string, CaseTimelineEvent[]> = Object.fromEntries(
  demoCases.map((item) => {
    const upTo = rank[item.status];
    const start = Date.parse(item.created_at);
    const span = Math.max(0, Date.parse(item.updated_at) - start);
    const events: CaseTimelineEvent[] = titles.slice(0, upTo + 1).map((entry, index) => ({
      event_id: `${item.case_id}-event-${index}`,
      case_id: item.case_id,
      type: entry.type,
      actor_type: index === 0 ? "citizen" : "government",
      title: entry.title,
      description:
        index === 0
          ? "El reporte se recibió y quedó en la cola de revisión."
          : "Actualización pública del seguimiento del caso.",
      created_at: new Date(start + (span * (index + 1)) / (upTo + 2)).toISOString(),
      is_public: true,
      metadata: { internal_actor_id: "secret-actor" },
    }));

    if (item.case_id.endsWith("000001")) {
      events.push({
        event_id: `${item.case_id}-event-private`,
        case_id: item.case_id,
        type: "government_update",
        actor_type: "government",
        title: "Nota interna: no publicar",
        description: "Contacto de la persona: privado@example.com, teléfono 55 0000 1111.",
        created_at: iso(2),
        is_public: false,
        metadata: { reporter_email: "privado@example.com", specialist_phone: "+52 55 0000 1111" },
      });
    }
    return [item.case_id, events];
  }),
);

export const demoRiskSignals: ApprovedRiskSignal[] = [
  {
    signal_id: "signal-2026-10-29-roma-baches",
    signal_type: "emerging_concentration",
    area_label: "Roma Norte · corredor Río Pánuco",
    colonia: "Roma Norte",
    category: "road_damage",
    risk_level: "high",
    attention_index: 78,
    finding:
      "Se concentraron 6 reportes de baches en un radio de 250 m durante los últimos 14 días, frente a 2 en la ventana anterior.",
    recommended_action:
      "Programar una inspección conjunta del tramo y revisar si hay una fuga de agua subyacente.",
    spatial_precision: "coordinates",
    centroid: { latitude: 19.4152333, longitude: -99.1642111 },
    radius_meters: 250,
    window_days: 14,
    current_window_count: 6,
    previous_window_count: 2,
    change_ratio: 2,
    valid_from: "2026-10-29T00:00:00.000Z",
    valid_until: "2026-11-12T23:59:59.000Z",
    generated_at: "2026-10-29T08:15:00.000Z",
    approved_at: "2026-10-29T17:40:00.000Z",
    approved_by_role: "coordinacion_territorial",
    analysis_version: "preventive-2026-10-30.1",
    limitations: [
      "Indica concentración de reportes, no una probabilidad de falla.",
      "Puede reflejar mayor participación vecinal en la zona.",
    ],
    approval_status: "approved",
    is_public: true,
    evidence_record_ids: ["internal-do-not-publish-1", "internal-do-not-publish-2"],
  },
  {
    signal_id: "signal-2026-10-28-centro-alumbrado",
    signal_type: "repeated_reports",
    area_label: "Centro · Calle de Regina",
    colonia: "Centro",
    category: "street_lighting",
    risk_level: "medium",
    attention_index: 61,
    finding:
      "Cuatro reportes de luminarias con falla se repitieron en tres semanas sobre la misma cuadra.",
    recommended_action: "Verificar el circuito completo y no solo las luminarias reportadas.",
    spatial_precision: "colonia",
    centroid: null,
    radius_meters: null,
    window_days: 21,
    current_window_count: 4,
    previous_window_count: 1,
    change_ratio: 3,
    valid_from: "2026-10-28T00:00:00.000Z",
    valid_until: "2026-11-18T23:59:59.000Z",
    generated_at: "2026-10-28T06:00:00.000Z",
    approved_at: "2026-10-28T19:10:00.000Z",
    approved_by_role: "direccion_servicios_urbanos",
    analysis_version: "preventive-2026-10-30.1",
    limitations: ["Solo hay precisión de colonia; no se publica ubicación exacta."],
    approval_status: "approved",
    is_public: true,
  },
  {
    signal_id: "signal-2026-10-27-juarez-residuos",
    signal_type: "recurring_problem",
    area_label: "Juárez · Av. Chapultepec",
    colonia: "Juárez",
    category: "waste_sanitation",
    risk_level: "medium",
    attention_index: 54,
    finding:
      "El mismo punto de recolección presenta desbordamiento en cuatro de las últimas seis semanas.",
    recommended_action: "Revisar la frecuencia de recolección y la capacidad del contenedor.",
    spatial_precision: "coordinates",
    centroid: { latitude: 19.4231, longitude: -99.1611 },
    radius_meters: 120,
    window_days: 42,
    current_window_count: 4,
    previous_window_count: 3,
    change_ratio: 0.33,
    valid_from: "2026-10-27T00:00:00.000Z",
    valid_until: "2026-12-08T23:59:59.000Z",
    generated_at: "2026-10-27T07:30:00.000Z",
    approved_at: "2026-10-27T16:05:00.000Z",
    approved_by_role: "coordinacion_territorial",
    analysis_version: "preventive-2026-10-30.1",
    limitations: ["El patrón puede variar por temporada o eventos locales."],
    approval_status: "approved",
    is_public: true,
  },
  {
    signal_id: "signal-2026-10-26-condesa-arbolado",
    signal_type: "high_severity_reports",
    area_label: "Condesa · Parque Pushkin",
    colonia: "Condesa",
    category: "trees_vegetation",
    risk_level: "low",
    attention_index: 34,
    finding: "Dos reportes recientes describieron ramas sobre el paso peatonal.",
    recommended_action: "Incluir el punto en la ronda ordinaria de arbolado.",
    spatial_precision: "colonia",
    centroid: null,
    radius_meters: null,
    window_days: 14,
    current_window_count: 2,
    previous_window_count: 2,
    change_ratio: 0,
    valid_from: "2026-10-26T00:00:00.000Z",
    valid_until: null,
    generated_at: "2026-10-26T05:45:00.000Z",
    approved_at: "2026-10-26T18:20:00.000Z",
    approved_by_role: "direccion_medio_ambiente",
    analysis_version: "preventive-2026-10-30.1",
    limitations: ["Volumen bajo: revisar antes de tratarlo como patrón."],
    approval_status: "approved",
    is_public: true,
  },
  {
    signal_id: "signal-pendiente-no-publicar",
    signal_type: "emerging_concentration",
    area_label: "Guerrero · zona reservada",
    colonia: "Guerrero",
    category: "other",
    risk_level: "critical",
    attention_index: 95,
    finding: "Señal pendiente de revisión humana; no debe publicarse todavía.",
    recommended_action: null,
    spatial_precision: "colonia",
    centroid: null,
    radius_meters: null,
    window_days: 7,
    current_window_count: 9,
    previous_window_count: 1,
    change_ratio: 8,
    valid_from: "2026-10-30T00:00:00.000Z",
    valid_until: null,
    generated_at: "2026-10-30T04:00:00.000Z",
    approved_at: "2026-10-30T04:00:00.000Z",
    approved_by_role: "pendiente",
    analysis_version: "preventive-2026-10-30.1",
    limitations: ["Sin aprobación."],
    approval_status: "pending",
    is_public: false,
  },
  {
    signal_id: "signal-rechazada-no-publicar",
    signal_type: "repeated_reports",
    area_label: "Doctores · punto descartado",
    colonia: "Doctores",
    category: "road_damage",
    risk_level: "high",
    attention_index: 80,
    finding: "Señal rechazada por la unidad territorial.",
    recommended_action: null,
    spatial_precision: "colonia",
    centroid: null,
    radius_meters: null,
    window_days: 14,
    current_window_count: 5,
    previous_window_count: 1,
    change_ratio: 4,
    valid_from: "2026-10-25T00:00:00.000Z",
    valid_until: null,
    generated_at: "2026-10-25T04:00:00.000Z",
    approved_at: "2026-10-25T18:00:00.000Z",
    approved_by_role: "coordinacion_territorial",
    analysis_version: "preventive-2026-10-30.1",
    limitations: ["Rechazada: evidencia insuficiente."],
    approval_status: "rejected",
    is_public: true,
  },
];
