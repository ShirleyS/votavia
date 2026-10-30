import type {
  Case,
  CaseCategory,
  CaseStatus,
  CaseTimelineEvent,
  CreateCaseInput,
  Location,
} from "@/shared/votavia-contract";

export const FIXTURE_LOCATION: Location = {
  latitude: 19.4175,
  longitude: -99.1628,
  colonia: "Roma Norte",
  address_hint: "Calle ficticia 123",
  alcaldia: "Cuauhtémoc",
};

export const VALID_CASE_INPUT: CreateCaseInput = {
  category: "road_damage",
  title: "Bache profundo frente al mercado",
  description:
    "Hay un bache de casi un metro que obliga a los coches a invadir el carril contrario.",
  latitude: FIXTURE_LOCATION.latitude,
  longitude: FIXTURE_LOCATION.longitude,
  colonia: FIXTURE_LOCATION.colonia,
  address_hint: FIXTURE_LOCATION.address_hint,
  has_safety_concern: true,
  has_accessibility_concern: false,
  reporter_email: null,
  created_by_user_id: null,
  photo_urls: [],
};

export const uuid = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

export const FIXTURE_CASE: Case = {
  case_id: uuid("1"),
  display_id: "VOT-9001",
  category: "street_lighting",
  status: "reported",
  title: "Luminaria apagada en la esquina",
  description: "La luminaria lleva dos semanas apagada y la calle queda a oscuras.",
  location: FIXTURE_LOCATION,
  colonia: FIXTURE_LOCATION.colonia,
  latitude: FIXTURE_LOCATION.latitude,
  longitude: FIXTURE_LOCATION.longitude,
  photos: [],
  support_count: 0,
  supported_by_me: false,
  observation_count: 0,
  has_safety_concern: true,
  has_accessibility_concern: false,
  is_demo: false,
  is_published: true,
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
  resolved_at: null,
};

export const FIXTURE_TIMELINE: CaseTimelineEvent[] = [
  {
    event_id: uuid("2"),
    case_id: FIXTURE_CASE.case_id,
    type: "reported",
    actor_type: "community",
    title: "Reporte recibido",
    description: "Tu reporte se registró y entrará a revisión.",
    created_at: "2026-10-01T12:00:00.000Z",
    is_public: true,
    metadata: null,
  },
];

export const VALID_CATEGORIES: CaseCategory[] = [
  "road_damage",
  "street_lighting",
  "traffic_signals",
  "sidewalk_accessibility",
  "trees_vegetation",
  "waste_sanitation",
  "parks_public_spaces",
  "other",
];

export const VALID_STATUSES: CaseStatus[] = [
  "reported",
  "under_review",
  "assigned",
  "in_progress",
  "pending_verification",
  "resolved",
  "closed",
];
